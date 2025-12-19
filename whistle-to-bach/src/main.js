// src/main.js
import * as tf from '@tensorflow/tfjs-core';
// Suppress TensorFlow warnings and kernel registration messages
tf.env().set('PROD', true);
tf.env().set('DEBUG', false);

import { AudioRecorder } from './recorder.js';
import { AudioTranscriber } from './transcriber.js';
import { BachComposer } from './composer.js';
import { FugueGenerator } from './fugue-generator.js';
import { AudioPlayer } from './player.js';
import { ScoreRenderer } from './renderer.js';

// Instancias
const recorder = new AudioRecorder();
const transcriber = new AudioTranscriber();
const composer = new BachComposer();  // Coconet para modo Coral
const fugueGen = new FugueGenerator(); // Algorítmico para modo Fuga
const player = new AudioPlayer();
const renderer = new ScoreRenderer('score-container');

// Estado
let audioBuffer = null;
let transcribedSequence = null;  // Secuencia transcrita (melodía original)
let currentSequence = null;      // Secuencia final (con armonización)

// Elementos DOM
const btnRecord = document.getElementById('btn-record');
const fileInput = document.getElementById('file-upload');
const btnProcess = document.getElementById('btn-process');
const btnPlay = document.getElementById('btn-play');
const btnRetranscribe = document.getElementById('btn-retranscribe');
const btnExportMidi = document.getElementById('btn-export-midi');
const statusEl = document.getElementById('status');

// VU Meter
const vuMeter = document.getElementById('vu-meter');
const vuBar = document.getElementById('vu-bar');
let vuAnimationId = null;

// Validar que todos los elementos existan
if (!btnRecord || !fileInput || !btnProcess || !btnPlay || !statusEl) {
  console.error('Error: Algunos elementos DOM requeridos no se encontraron.');
  throw new Error('Elementos DOM requeridos no disponibles.');
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

/**
 * Genera un archivo MIDI (SMF Format 0) a partir de una NoteSequence
 * @param {Object} noteSequence - Secuencia de notas con formato Magenta
 * @param {string} filename - Nombre del archivo a descargar
 */
function exportMidi(noteSequence, filename = 'transcripcion.mid') {
  if (!noteSequence || !noteSequence.notes || noteSequence.notes.length === 0) {
    setStatus('No hay notas para exportar.');
    return;
  }

  const ticksPerBeat = 480;
  const bpm = noteSequence.tempos?.[0]?.qpm || 120;
  const microsecondsPerBeat = Math.round(60000000 / bpm);

  // Funciones helper para escribir datos MIDI
  const writeVarLen = (value) => {
    const bytes = [];
    bytes.push(value & 0x7F);
    while ((value >>= 7) > 0) {
      bytes.unshift((value & 0x7F) | 0x80);
    }
    return bytes;
  };

  const writeInt16 = (value) => [(value >> 8) & 0xFF, value & 0xFF];
  const writeInt32 = (value) => [
    (value >> 24) & 0xFF,
    (value >> 16) & 0xFF,
    (value >> 8) & 0xFF,
    value & 0xFF
  ];

  // Preparar eventos MIDI ordenados por tiempo
  const events = [];
  const beatDuration = 60 / bpm;

  noteSequence.notes.forEach(note => {
    const startTick = Math.round((note.startTime / beatDuration) * ticksPerBeat);
    const endTick = Math.round((note.endTime / beatDuration) * ticksPerBeat);
    const velocity = note.velocity || 80;
    const pitch = note.pitch;
    const channel = 0;

    events.push({ tick: startTick, type: 'noteOn', pitch, velocity, channel });
    events.push({ tick: endTick, type: 'noteOff', pitch, velocity: 0, channel });
  });

  // Ordenar por tick
  events.sort((a, b) => a.tick - b.tick || (a.type === 'noteOff' ? -1 : 1));

  // Construir track data
  const trackData = [];

  // Tempo meta event (FF 51 03 tt tt tt)
  trackData.push(...writeVarLen(0)); // Delta time 0
  trackData.push(0xFF, 0x51, 0x03); // Set tempo
  trackData.push((microsecondsPerBeat >> 16) & 0xFF);
  trackData.push((microsecondsPerBeat >> 8) & 0xFF);
  trackData.push(microsecondsPerBeat & 0xFF);

  // Track name meta event
  const trackName = 'Whistle Transcription';
  trackData.push(...writeVarLen(0));
  trackData.push(0xFF, 0x03, trackName.length);
  for (let i = 0; i < trackName.length; i++) {
    trackData.push(trackName.charCodeAt(i));
  }

  // Program change (acoustic piano)
  trackData.push(...writeVarLen(0));
  trackData.push(0xC0, 0x00);

  // Note events
  let lastTick = 0;
  events.forEach(event => {
    const delta = event.tick - lastTick;
    trackData.push(...writeVarLen(delta));

    if (event.type === 'noteOn') {
      trackData.push(0x90 | event.channel, event.pitch, event.velocity);
    } else {
      trackData.push(0x80 | event.channel, event.pitch, 0);
    }
    lastTick = event.tick;
  });

  // End of track meta event
  trackData.push(...writeVarLen(0));
  trackData.push(0xFF, 0x2F, 0x00);

  // Construir archivo MIDI completo
  const midiData = [];

  // Header chunk: MThd
  midiData.push(0x4D, 0x54, 0x68, 0x64); // "MThd"
  midiData.push(...writeInt32(6));        // Header length
  midiData.push(...writeInt16(0));        // Format 0
  midiData.push(...writeInt16(1));        // 1 track
  midiData.push(...writeInt16(ticksPerBeat)); // Ticks per beat

  // Track chunk: MTrk
  midiData.push(0x4D, 0x54, 0x72, 0x6B); // "MTrk"
  midiData.push(...writeInt32(trackData.length));
  midiData.push(...trackData);

  // Crear y descargar archivo
  const blob = new Blob([new Uint8Array(midiData)], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setStatus(`MIDI exportado: ${filename}`);
}

/**
 * Anima el VU meter durante la grabación
 */
function updateVuMeter() {
  if (!vuBar) return;

  const level = recorder.getInputLevel();
  vuBar.style.width = `${level * 100}%`;

  vuAnimationId = requestAnimationFrame(updateVuMeter);
}

function startVuMeter() {
  if (vuMeter) vuMeter.classList.add('active');
  updateVuMeter();
}

function stopVuMeter() {
  if (vuAnimationId) {
    cancelAnimationFrame(vuAnimationId);
    vuAnimationId = null;
  }
  if (vuMeter) vuMeter.classList.remove('active');
  if (vuBar) vuBar.style.width = '0%';
}

/**
 * Obtiene las opciones de transcripción de los sliders
 */
function getTranscriptionOptions() {
  return {
    centsThreshold: parseInt(document.getElementById('sensitivity')?.value ?? 80),
    bpm: parseInt(document.getElementById('bpm')?.value ?? 90),
    smoothingFrames: parseInt(document.getElementById('smoothing')?.value ?? 5),
    silenceMs: parseInt(document.getElementById('silence')?.value ?? 150)
  };
}

/**
 * Transcribe el audio y muestra la partitura de la melodía
 */
async function transcribeAndShow() {
  if (!audioBuffer) return;

  try {
    setStatus("Transcribiendo melodía (IA)...");

    // Obtener opciones de los sliders
    const options = getTranscriptionOptions();
    transcribedSequence = await transcriber.transcribe(audioBuffer, options);

    if (!transcribedSequence || !transcribedSequence.notes || transcribedSequence.notes.length === 0) {
      setStatus("No se detectaron notas. Intenta grabar más fuerte.");
      btnProcess.disabled = true;
      return;
    }

    // Mostrar la transcripción
    setStatus(`Melodía transcrita: ${transcribedSequence.notes.length} notas. Listo para Bachify.`);
    renderer.render(transcribedSequence);

    // Permitir reproducir la melodía original y re-transcribir
    await player.loadSequence(transcribedSequence);
    btnPlay.disabled = false;
    btnProcess.disabled = false;
    if (btnRetranscribe) btnRetranscribe.disabled = false;
    if (btnExportMidi) btnExportMidi.disabled = false;

  } catch (err) {
    console.error("Error al transcribir:", err);
    setStatus("Error al transcribir el audio.");
  }
}

// 1. Manejo de Grabación
let isRecording = false;

btnRecord.addEventListener('click', async () => {
  if (!isRecording) {
    // Iniciar
    try {
      await recorder.startRecording();
      isRecording = true;
      btnRecord.textContent = "⏹️ Parar Grabación";
      btnRecord.classList.add('recording');
      setStatus("Grabando... Silba tu melodía claramente.");

      // Iniciar VU meter
      startVuMeter();

      // Limpiar estado anterior
      btnProcess.disabled = true;
      btnPlay.disabled = true;
      transcribedSequence = null;
      currentSequence = null;
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      setStatus("Error al acceder al micrófono.");
    }
  } else {
    // Parar
    stopVuMeter();
    setStatus("Procesando audio...");
    audioBuffer = await recorder.stopRecording();
    isRecording = false;
    btnRecord.textContent = "🎙️ Grabar (Silbar)";
    btnRecord.classList.remove('recording');

    if (audioBuffer) {
      // Transcribir automáticamente y mostrar
      await transcribeAndShow();
    } else {
      setStatus("No se pudo capturar el audio.");
    }
  }
});

// 2. Manejo de Archivos
fileInput.addEventListener('change', async (e) => {
  if (e.target.files.length > 0) {
    setStatus("Cargando archivo...");
    try {
      audioBuffer = await recorder.loadAudioFile(e.target.files[0]);
      // Transcribir automáticamente y mostrar
      await transcribeAndShow();
    } catch (err) {
      console.error("Error al cargar archivo:", err);
      setStatus("Error al cargar archivo.");
    }
  }
});

// 2.5 Re-transcribir con nuevos ajustes
if (btnRetranscribe) {
  btnRetranscribe.addEventListener('click', async () => {
    if (!audioBuffer) {
      setStatus("No hay audio cargado.");
      return;
    }
    await transcribeAndShow();
  });
}

// 2.6 Exportar MIDI
if (btnExportMidi) {
  btnExportMidi.addEventListener('click', () => {
    // Exportar la composición Bachificada si existe, sino la melodía transcrita
    const sequenceToExport = currentSequence || transcribedSequence;
    if (!sequenceToExport) {
      setStatus("No hay melodía para exportar.");
      return;
    }

    const filename = currentSequence ? 'bach_composition.mid' : 'whistle_melody.mid';
    exportMidi(sequenceToExport, filename);
  });
}

// 3. Proceso Bachify (Fuga o Coral según selector)
btnProcess.addEventListener('click', async () => {
  if (!transcribedSequence) {
    setStatus("Primero debes grabar o cargar un archivo de audio.");
    return;
  }

  try {
    btnProcess.disabled = true;
    btnPlay.disabled = true;

    // Obtener modo de composición
    const modeSelector = document.getElementById('composition-mode');
    const mode = modeSelector ? modeSelector.value : 'fugue';

    if (mode === 'fugue') {
      // Modo Fuga: Usar FugueGenerator algorítmico
      setStatus("Generando fuga a 4 voces (algorítmico)...");
      currentSequence = fugueGen.generate(transcribedSequence);
    } else {
      // Modo Coral: Usar Coconet para armonización
      setStatus("Componiendo coral a 4 voces (Coconet)... Esto puede tardar.");
      currentSequence = await composer.harmonize(transcribedSequence);
    }

    if (!currentSequence) {
      setStatus("Error al generar la composición musical.");
      btnProcess.disabled = false;
      return;
    }

    const modeLabel = mode === 'fugue' ? 'Fuga' : 'Coral';
    setStatus(`¡${modeLabel} terminada! ${currentSequence.notes.length} notas en 4 voces.`);

    // Cargar en el player y Renderizar
    await player.loadSequence(currentSequence);
    renderer.render(currentSequence);
    btnPlay.disabled = false;
    btnProcess.disabled = false;

  } catch (err) {
    console.error(err);
    setStatus("Error durante el proceso: " + err.message);
    btnProcess.disabled = false;
  }
});

// 4. Reproducción
btnPlay.addEventListener('click', async () => {
  const sequenceToPlay = currentSequence || transcribedSequence;

  if (!sequenceToPlay) {
    setStatus("Primero debes procesar una melodía.");
    return;
  }

  if (player.isPlaying) {
    player.stop();
    btnPlay.textContent = "▶️ Reproducir";
    setStatus("Reproducción detenida.");
  } else {
    setStatus("Reproduciendo...");
    await player.play();
    btnPlay.textContent = "⏹️ Detener";
  }
});

// Escuchar evento de parada del reproductor para actualizar UI
window.addEventListener('player-stopped', () => {
  btnPlay.textContent = "▶️ Reproducir";
  setStatus("Reproducción finalizada.");
});

// Manejar automáticamente el resume del audio context
document.addEventListener('click', async function initAudioContext() {
  try {
    if (typeof window.AudioContext !== 'undefined') {
      if (recorder && recorder.audioContext && recorder.audioContext.state === 'suspended') {
        await recorder.audioContext.resume();
      }
    }
    document.removeEventListener('click', initAudioContext);
  } catch (err) {
    console.warn("No se pudo inicializar el contexto de audio automáticamente:", err);
  }
}, { once: true });