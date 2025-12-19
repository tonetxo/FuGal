// src/main.js
import * as tf from '@tensorflow/tfjs-core';
// Suppress TensorFlow warnings and kernel registration messages
tf.env().set('PROD', true);
tf.env().set('DEBUG', false);

import { AudioRecorder } from './recorder.js';
import { AudioTranscriber } from './transcriber.js';
import { BachComposer } from './composer.js';
import { AudioPlayer } from './player.js';
import { ScoreRenderer } from './renderer.js';

// Instancias
const recorder = new AudioRecorder();
const transcriber = new AudioTranscriber();
const composer = new BachComposer();
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
const statusEl = document.getElementById('status');

// Validar que todos los elementos existan
if (!btnRecord || !fileInput || !btnProcess || !btnPlay || !statusEl) {
  console.error('Error: Algunos elementos DOM requeridos no se encontraron.');
  throw new Error('Elementos DOM requeridos no disponibles.');
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
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

// 3. Proceso Bachify (solo armonización)
btnProcess.addEventListener('click', async () => {
  if (!transcribedSequence) {
    setStatus("Primero debes grabar o cargar un archivo de audio.");
    return;
  }

  try {
    btnProcess.disabled = true;
    btnPlay.disabled = true;

    // Componer (Inpainting con Coconet)
    setStatus("Componiendo fuga a 4 voces (Coconet)... Esto puede tardar.");

    currentSequence = await composer.harmonize(transcribedSequence);

    if (!currentSequence) {
      setStatus("Error al generar la composición musical.");
      btnProcess.disabled = false;
      return;
    }

    setStatus(`¡Composición terminada! ${currentSequence.notes.length} notas en 4 voces.`);

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