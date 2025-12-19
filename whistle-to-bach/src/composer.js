// src/composer.js
import { Coconet } from '@magenta/music/esm/coconet';
import { sequences } from '@magenta/music/esm/core';
import * as tf from '@tensorflow/tfjs-core';

// Suppress TensorFlow warnings and kernel registration messages
tf.env().set('PROD', true);
tf.env().set('DEBUG', false);

// Usamos el checkpoint oficial de Magenta para Coconet (Bach Chorales)
const COCONET_CHECKPOINT_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/coconet/bach';

export class BachComposer {
  constructor() {
    this.model = new Coconet(COCONET_CHECKPOINT_URL);
    this.isReady = false;
  }

  async initialize() {
    if (!this.isReady) {
      try {
        console.log("Cargando modelo Coconet...");
        // Suppress TF warnings locally if not already done globally
        tf.env().set('PROD', true);

        await this.model.initialize();
        this.isReady = true;
        console.log("Modelo Coconet listo.");
      } catch (error) {
        console.error("Error al inicializar el modelo Coconet:", error);
        throw new Error("No se pudo cargar el modelo de composición Bach. Asegúrate de que los archivos del modelo están presentes.");
      }
    }
  }

  /**
   * Armoniza una melodía monofónica generando 3 voces adicionales.
   * @param {Object} inputSequence - NoteSequence (raw from transcriber)
   * @param {number} stepsPerQuarter - Resolución de cuantización (default 4 = semicorcheas)
   * @returns {Promise<Object>} NoteSequence con 4 voces
   */
  async harmonize(inputSequence, stepsPerQuarter = 4) {
    if (!this.isReady) await this.initialize();

    if (!inputSequence || !inputSequence.notes || inputSequence.notes.length === 0) {
      throw new Error("No hay notas válidas para componer.");
    }

    // 0. Pre-procesamiento: Ajustar rango de tesitura (Whistle suele ser muy agudo)
    // Rango válido de Coconet: 36 (C2) a 81 (A5).
    const MIN_PITCH = 36;
    const MAX_PITCH = 81;

    // Calcular pitch promedio
    let sumPitch = 0;
    let count = 0;
    inputSequence.notes.forEach(n => {
      sumPitch += n.pitch;
      count++;
    });

    let transposeInterval = 0;
    if (count > 0) {
      const avgPitch = sumPitch / count;
      // Objetivo: Centrar en ~60 (C4) o ~67 (G4)
      const targetPitch = 64;
      transposeInterval = Math.round(targetPitch - avgPitch);
    }

    console.log(`Transponiendo entrada por ${transposeInterval} semitonos para ajustar a rango vocal.`);

    // Crear copia modificada para Coconet
    const processedNotes = inputSequence.notes
      .map(n => ({ ...n, pitch: n.pitch + transposeInterval, instrument: 0, isDrum: false }))
      .filter(n => n.pitch >= MIN_PITCH && n.pitch <= MAX_PITCH);

    if (processedNotes.length === 0) {
      throw new Error("La melodía está fuera del rango válido incluso después de transponer.");
    }

    const processedSeq = {
      ...inputSequence,
      notes: processedNotes
    };

    // 1. Cuantizar la secuencia de entrada
    const quantizedSeq = sequences.quantizeNoteSequence(processedSeq, stepsPerQuarter);

    // 2. Configurar opciones de generación
    const generationOptions = {
      numIterations: 3,
      temperature: 0.99,
    };

    // 3. Ejecutar Coconet para generar voces de acompañamiento
    console.log("Componiendo fuga...");
    // infill espera un objeto NoteSequence cuantizado.
    try {
      const result = await this.model.infill(quantizedSeq, generationOptions);

      // Fusionar la entrada original (cuantizada) con la salida generada
      return sequences.unquantizeSequence(result);
    } catch (error) {
      console.error("Error durante la armonización:", error);
      throw new Error("Hubo un problema al generar la composición musical. Inténtalo de nuevo.");
    }
  }

  /**
   * Verifica si el modelo está listo
   * @returns {boolean} True si el modelo está completamente cargado
   */
  isModelReady() {
    return this.isReady;
  }
}
