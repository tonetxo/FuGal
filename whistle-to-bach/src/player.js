// src/player.js
import * as Tone from 'tone';

const INSTRUMENT_PRESETS = {
  violin: {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 2.5 }
  },
  cello: {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.15, decay: 0.3, sustain: 0.8, release: 3.0 }
  },
  flute: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.1, decay: 0.1, sustain: 1, release: 1.2 }
  },
  oboe: {
    oscillator: { type: "pulse", width: 0.3 },
    envelope: { attack: 0.08, decay: 0.1, sustain: 0.8, release: 1.5 }
  },
  bassoon: {
    oscillator: { type: "pulse", width: 0.2 },
    envelope: { attack: 0.08, decay: 0.1, sustain: 0.8, release: 1.5 }
  },
  horn: {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.15, decay: 0.2, sustain: 0.8, release: 2.5 }
  },
  trumpet: {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.03, decay: 0.1, sustain: 0.7, release: 1.0 }
  },
  trombone: {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.06, decay: 0.2, sustain: 0.8, release: 1.5 }
  },
  piano: {
    oscillator: { type: "sine" },
    envelope: { attack: 0.005, decay: 1.5, sustain: 0, release: 1.5 }
  },
  harpsichord: {
    oscillator: { type: "pulse", width: 0.1 },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.8 }
  }
};

export class AudioPlayer {
  constructor() {
    this.synths = [];
    this.isPlaying = false;
    this.sequence = null;
    this.parts = [];
    this.currentInstrumentNames = ['flute', 'oboe', 'trombone', 'cello'];

    // Cadena de Mastering (ajustada para máxima claridad sin distorsión)
    this.limiter = new Tone.Limiter(-0.5).toDestination();
    this.masterGain = new Tone.Gain(1.0).connect(this.limiter);

    this.isInitialized = false;
  }

  async initialize() {
    if (!this.isInitialized) {
      for (let i = 0; i < 4; i++) {
        const pan = new Tone.Panner((i - 1.5) * 0.4).connect(this.masterGain);
        const instName = this.currentInstrumentNames[i];
        const preset = INSTRUMENT_PRESETS[instName] || INSTRUMENT_PRESETS.flute;

        const synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 16,
          ...preset
        }).connect(pan);

        // Volumen base ajustado
        synth.volume.value = -8;
        this.synths.push(synth);
      }
      this.isInitialized = true;
    }
  }

  /**
   * Cambia los instrumentos en tiempo real
   */
  async setInstruments(instrumentNames) {
    this.currentInstrumentNames = instrumentNames;
    if (this.isInitialized) {
      for (let i = 0; i < 4; i++) {
        const preset = INSTRUMENT_PRESETS[instrumentNames[i]] || INSTRUMENT_PRESETS.piano;
        this.synths[i].set({ ...preset });
      }
    } else {
      await this.initialize();
    }
  }

  async startTone() {
    if (Tone.context.state !== 'running') {
      await Tone.start();
      console.log("Audio Context Ready");
    }
  }

  /**
   * Carga una secuencia para reproducción.
   * @param {Object} noteSequence - Magenta NoteSequence
   */
  async loadSequence(noteSequence) {
    if (!noteSequence || !noteSequence.notes) {
      console.warn("Secuencia inválida para reproducción");
      return;
    }

    await this.initialize();
    this.stop();
    this.sequence = noteSequence;

    // Agrupar notas por voz
    const notesByVoice = [[], [], [], []];
    noteSequence.notes.forEach(note => {
      const voiceIndex = Math.min(Math.max(note.instrument || 0, 0), 3);
      notesByVoice[voiceIndex].push({
        time: note.startTime,
        note: Tone.Frequency(note.pitch, "midi").toNote(),
        duration: note.endTime - note.startTime,
        velocity: note.velocity ? note.velocity / 127 : 0.6
      });
    });

    console.log(`Player: Cargadas ${noteSequence.notes.length} notas en ${notesByVoice.filter(v => v.length > 0).length} voces`);

    // Limpiar partes anteriores
    this._disposeParts();

    // Crear nuevas partes y sincronizarlas con el Transport
    this.parts = notesByVoice.map((events, index) => {
      if (events.length === 0) return null;

      const part = new Tone.Part((time, value) => {
        this.synths[index].triggerAttackRelease(
          value.note,
          value.duration,
          time,
          value.velocity
        );
      }, events);

      // Ya no llamamos a part.start(0) aquí porque Transport.cancel() en play() lo borraría
      return part;
    }).filter(p => p !== null);
  }

  async play() {
    if (!this.sequence || this.parts.length === 0) {
      console.warn("No hay secuencia cargada para reproducir");
      return;
    }

    await this.initialize();
    await this.startTone();

    if (this.isPlaying) {
      this.stop();
      return;
    }

    // Asegurar que el Transport esté limpio
    Tone.Transport.stop();
    Tone.Transport.cancel(); // Limpia eventos anteriores programados (como el callback de finalización)
    Tone.Transport.seconds = 0;

    // Programar el fin de la reproducción
    const totalDuration = this.sequence.totalTime ||
      Math.max(...this.sequence.notes.map(n => n.endTime), 0);

    Tone.Transport.schedule((time) => {
      Tone.Draw.schedule(() => {
        if (this.isPlaying) {
          console.log("Reproducción finalizada automáticamente");
          this._handlePlaybackEnd();
        }
      }, time);
    }, totalDuration + 2.0); // Buffer más largo para que terminen las resonancias

    // Iniciar el transport con un pequeño offset para estabilidad
    // Asegurarnos de que las partes estén detenidas antes de rearrancarlas
    this.parts.forEach(part => {
      part.stop();
      part.start(0);
    });

    Tone.Transport.start("+0.1");
    this.isPlaying = true;
    console.log("Iniciando reproducción con Tone.Transport");
  }

  stop() {
    // Primero detenemos el transport
    Tone.Transport.stop();

    // Detenemos explícitamente cada parte
    this.parts.forEach(part => {
      try {
        part.stop();
      } catch (e) { }
    });

    // Limpiamos los eventos programados (incluyendo el de finalización)
    Tone.Transport.cancel();

    // Garantizamos que el tiempo sea 0 para la próxima reproducción
    try {
      if (Tone.Transport.seconds < 0) Tone.Transport.seconds = 0;
    } catch (e) { }

    // Apagamos notas
    this.synths.forEach(s => s.releaseAll());

    if (this.isPlaying) {
      this._handlePlaybackEnd();
    }
  }

  _handlePlaybackEnd() {
    this.isPlaying = false;
    // Disparar un evento global o callback si fuera necesario para actualizar la UI
    // En este caso, main.js maneja el estado del botón basándose en el click, 
    // pero podemos emitir un evento personalizado.
    window.dispatchEvent(new CustomEvent('player-stopped'));
  }

  _disposeParts() {
    if (this.parts) {
      this.parts.forEach(part => {
        if (part) {
          part.dispose();
        }
      });
      this.parts = [];
    }
  }

  async destroy() {
    this.stop();
    this._disposeParts();
    for (const synth of this.synths) {
      synth.dispose();
    }
    this.synths = [];
  }
}
