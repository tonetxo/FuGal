// src/transcriber.js
// Client-side transcriber using SPICE from @magenta/music
// Con suavizado temporal, segmentación inteligente y cuantización rítmica

import { SPICE } from '@magenta/music/esm/spice';

// Constantes para segmentación
const CENTS_THRESHOLD = 50;        // Nueva nota si cambio > 50 cents
const SILENCE_THRESHOLD_MS = 100;  // Silencio > 100ms = nueva nota
const MIN_NOTE_DURATION_MS = 50;   // Ignorar notas < 50ms
const MEDIAN_FILTER_SIZE = 5;      // Tamaño del filtro median
const DEFAULT_BPM = 90;            // BPM inicial para cuantización

export class AudioTranscriber {
  constructor() {
    this.spice = null;
    this.isReady = false;
  }

  async initialize() {
    if (this.isReady) return;

    try {
      console.log("Cargando modelo SPICE...");
      this.spice = new SPICE();
      await this.spice.initialize();
      this.isReady = true;
      console.log("Modelo SPICE cargado correctamente");
    } catch (error) {
      console.error("Error al inicializar SPICE:", error);
      throw error;
    }
  }

  /**
   * Transcribe un AudioBuffer con parámetros configurables
   * @param {AudioBuffer} audioBuffer - El audio a transcribir
   * @param {Object} options - Opciones de configuración
   * @param {number} options.centsThreshold - Umbral de cents para nueva nota (default 80)
   * @param {number} options.silenceMs - Silencio mínimo en ms (default 150)
   * @param {number} options.smoothingFrames - Frames para median filter (default 5)
   * @param {number} options.bpm - BPM para cuantización (default 90)
   */
  async transcribe(audioBuffer, options = {}) {
    if (!this.isReady) {
      await this.initialize();
    }

    // Valores por defecto más relajados para notas más largas
    const config = {
      centsThreshold: options.centsThreshold ?? 80,
      silenceMs: options.silenceMs ?? 150,
      smoothingFrames: options.smoothingFrames ?? 5,
      bpm: options.bpm ?? 90,
      minNoteDuration: 80  // ms
    };

    console.log("Transcribiendo con config:", config);

    try {
      // SPICE.getAudioFeatures devuelve: {f0_hz, loudness_db, confidences}
      const audioFeatures = await this.spice.getAudioFeatures(audioBuffer, 0.3);

      console.log(`SPICE detectó ${audioFeatures.f0_hz.length} frames de audio`);

      // 1. Aplicar median filter para suavizado
      const smoothedPitches = this.medianFilter(audioFeatures.f0_hz, config.smoothingFrames);

      // 2. Segmentar en notas usando cents y silencios
      const rawNotes = this.segmentNotes(smoothedPitches, audioFeatures.confidences, audioBuffer.duration, config);

      console.log(`Segmentación inicial: ${rawNotes.length} notas`);

      // 3. Filtrar notas muy cortas
      const filteredNotes = rawNotes.filter(n => (n.endTime - n.startTime) * 1000 >= config.minNoteDuration);

      // 4. Cuantizar rítmicamente
      const quantizedNotes = this.quantizeNotes(filteredNotes, config.bpm);

      console.log(`Final: ${quantizedNotes.length} notas cuantizadas`);

      return {
        notes: quantizedNotes,
        totalTime: audioBuffer.duration,
        tempos: [{ qpm: config.bpm, time: 0 }],
        quantizationInfo: { stepsPerQuarter: 4 }
      };

    } catch (error) {
      console.error("Error durante la transcripción SPICE:", error);
      throw error;
    }
  }

  /**
   * Median filter para suavizar pitches y eliminar glitches
   */
  medianFilter(data, windowSize) {
    const result = new Float32Array(data.length);
    const halfWindow = Math.floor(windowSize / 2);

    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(data.length, i + halfWindow + 1);
      const window = [];

      for (let j = start; j < end; j++) {
        if (data[j] > 0) window.push(data[j]);
      }

      if (window.length > 0) {
        window.sort((a, b) => a - b);
        result[i] = window[Math.floor(window.length / 2)];
      } else {
        result[i] = 0;
      }
    }

    return result;
  }

  /**
   * Segmenta frames en notas basándose en:
   * - Cambio de pitch > centsThreshold
   * - Silencios > silenceMs
   */
  segmentNotes(pitches, confidences, duration, config) {
    const notes = [];
    const frameTime = duration / pitches.length;
    const silenceFrames = Math.ceil((config.silenceMs / 1000) / frameTime);

    let currentNote = null;
    let silenceCounter = 0;

    for (let i = 0; i < pitches.length; i++) {
      const time = i * frameTime;
      const pitchHz = pitches[i];
      const confidence = confidences[i];
      const isActive = confidence > 0.5 && pitchHz > 0;

      if (!isActive) {
        silenceCounter++;

        // Si hay silencio prolongado, cerrar nota actual
        if (currentNote && silenceCounter >= silenceFrames) {
          currentNote.endTime = time - (silenceCounter * frameTime);
          notes.push(currentNote);
          currentNote = null;
        }
        continue;
      }

      silenceCounter = 0;
      const midiPitch = this.hzToMidi(pitchHz);

      if (currentNote === null) {
        // Iniciar nueva nota
        currentNote = {
          pitch: midiPitch,
          pitchHz: pitchHz,
          startTime: time,
          endTime: time,
          velocity: 80,
          instrument: 0,
          program: 0,
          isDrum: false
        };
      } else {
        // Verificar si el cambio de pitch es significativo (> centsThreshold)
        const cents = Math.abs(this.hzToCents(pitchHz) - this.hzToCents(currentNote.pitchHz));

        if (cents > config.centsThreshold) {
          // Cerrar nota anterior y comenzar nueva
          currentNote.endTime = time;
          notes.push(currentNote);

          currentNote = {
            pitch: midiPitch,
            pitchHz: pitchHz,
            startTime: time,
            endTime: time,
            velocity: 80,
            instrument: 0,
            program: 0,
            isDrum: false
          };
        } else {
          // Continuar nota actual (actualizar pitch promedio)
          currentNote.endTime = time;
        }
      }
    }

    // Cerrar última nota
    if (currentNote) {
      currentNote.endTime = duration;
      notes.push(currentNote);
    }

    return notes;
  }

  /**
   * Cuantiza notas a valores rítmicos musicales (1/4, 1/8, 1/16, puntillos)
   * Usa coste mínimo en vez de hard snap
   */
  quantizeNotes(notes, bpm) {
    const beatDuration = 60 / bpm; // Duración de 1/4 en segundos

    // Valores rítmicos permitidos (en beats)
    const rhythmicValues = [
      4,      // redonda
      3,      // blanca con puntillo
      2,      // blanca
      1.5,    // negra con puntillo
      1,      // negra (1/4)
      0.75,   // corchea con puntillo
      0.5,    // corchea (1/8)
      0.375,  // semicorchea con puntillo
      0.25,   // semicorchea (1/16)
      0.125   // fusa (1/32)
    ];

    return notes.map(note => {
      const originalDuration = note.endTime - note.startTime;
      const durationInBeats = originalDuration / beatDuration;

      // Encontrar el valor rítmico más cercano (coste mínimo)
      let bestValue = rhythmicValues[0];
      let minCost = Math.abs(durationInBeats - rhythmicValues[0]);

      for (const value of rhythmicValues) {
        const cost = Math.abs(durationInBeats - value);
        if (cost < minCost) {
          minCost = cost;
          bestValue = value;
        }
      }

      // Cuantizar startTime al beat más cercano
      const startInBeats = note.startTime / beatDuration;
      const quantizedStartBeats = Math.round(startInBeats * 4) / 4; // Cuantizar a 1/16
      const quantizedStart = quantizedStartBeats * beatDuration;
      const quantizedEnd = quantizedStart + (bestValue * beatDuration);

      return {
        ...note,
        startTime: Math.max(0, quantizedStart),
        endTime: quantizedEnd
      };
    });
  }

  /**
   * Convierte Hz a número MIDI
   */
  hzToMidi(hz) {
    if (hz <= 0) return 0;
    return Math.round(12 * Math.log2(hz / 440) + 69);
  }

  /**
   * Convierte Hz a cents (para comparación de pitch)
   */
  hzToCents(hz) {
    if (hz <= 0) return 0;
    return 1200 * Math.log2(hz / 440);
  }

  /**
   * Convierte un AudioBuffer a un array mono Float32 (ya no se usa pero mantenemos)
   */
  audioBufferToMono(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);

    if (audioBuffer.numberOfChannels > 1) {
      const channel2 = audioBuffer.getChannelData(1);
      const mono = new Float32Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        mono[i] = (channelData[i] + channel2[i]) / 2;
      }
      return mono;
    }

    return channelData;
  }
}
