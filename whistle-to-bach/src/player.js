// src/player.js
import * as Tone from 'tone';

export class AudioPlayer {
  constructor() {
    this.synths = [];
    this.isPlaying = false;
    this.sequence = null;
    this.parts = [];

    // Inicializar Tone.js en estado suspendido para evitar mensajes de consola
    // La inicialización real se hará en respuesta a la interacción del usuario
    this.isInitialized = false;
  }

  async initialize() {
    if (!this.isInitialized) {
      // Crear 4 sintetizadores, uno por voz (Soprano, Alto, Tenor, Bajo)
      // Usaremos un sonido tipo Órgano/Clave
      const synthOptions = {
        oscillator: { type: "triangle" },
        envelope: {
          attack: 0.05,
          decay: 0.1,
          sustain: 0.3,
          release: 1
        }
      };

      for (let i = 0; i < 4; i++) {
        // Panear las voces ligeramente para dar espacio estéreo
        const pan = new Tone.Panner((i - 1.5) * 0.5).toDestination();
        const synth = new Tone.PolySynth(Tone.Synth, synthOptions).connect(pan);
        synth.volume.value = -8; // Bajar volumen para evitar saturación al sumar 4 voces
        this.synths.push(synth);
      }

      this.isInitialized = true;
    }
  }

  async startTone() {
    if (Tone.context.state !== 'running') {
      // Esto debería suceder después de la interacción del usuario
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

    // Asegurar que los sintes estén inicializados
    await this.initialize();

    this.stop();
    this.sequence = noteSequence;

    // Tone.Part espera eventos en formato { time, note, duration, velocity }
    // Magenta usa segundos absolutos en startTime.

    // Agrupar notas por instrumento/voz (0-3) para asignarlas al sinte correcto
    const notesByVoice = [[], [], [], []];

    noteSequence.notes.forEach(note => {
      // Asegurar que el índice de instrumento esté en rango 0-3
      const voiceIndex = Math.min(Math.max(note.instrument || 0, 0), 3);
      notesByVoice[voiceIndex].push({
        time: note.startTime,
        note: Tone.Frequency(note.pitch, "midi").toNote(),
        duration: note.endTime - note.startTime,
        velocity: note.velocity ? note.velocity / 127 : 0.5 // Valor por defecto si no hay velocidad
      });
    });

    // Programar Tone.Part para cada voz
    this.parts = notesByVoice.map((events, index) => {
      const part = new Tone.Part((time, value) => {
        this.synths[index].triggerAttackRelease(
          value.note,
          value.duration,
          time,
          value.velocity
        );
      }, events);
      return part;
    });
  }

  async play() {
    if (!this.sequence) {
      console.warn("No hay secuencia para reproducir");
      return;
    }

    // Asegurar que los sintes estén inicializados
    await this.initialize();

    await this.startTone();

    Tone.Transport.stop();
    Tone.Transport.cancel(); // Limpiar eventos anteriores

    // Re-crear las partes porque Tone.js a veces da problemas al reusarlas
    await this.loadSequence(this.sequence);

    this.parts.forEach(part => part.start(0));
    Tone.Transport.bpm.value = 120; // Establecer tempo por defecto
    Tone.Transport.start("+0.1");
    this.isPlaying = true;
  }

  stop() {
    if (this.isPlaying) {
      Tone.Transport.stop();
      Tone.Transport.cancel();

      if (this.parts && Array.isArray(this.parts)) {
        this.parts.forEach(part => {
          if (part && typeof part.dispose === 'function') {
            try {
              part.stop(0); // Usar 0 explícito para evitar errores de punto flotante
              part.dispose();
            } catch (e) {
              // Ignorar errores de Tone.js por valores de punto flotante
              part.dispose();
            }
          }
        });
        this.parts = [];
      }

      // Apagar notas colgadas
      this.synths.forEach(s => {
        if (s && typeof s.releaseAll === 'function') {
          s.releaseAll();
        }
      });

      this.isPlaying = false;
    }
  }

  /**
   * Limpia todos los recursos de audio
   */
  async destroy() {
    this.stop();

    // Libera los sintetizadores
    for (const synth of this.synths) {
      if (synth && typeof synth.dispose === 'function') {
        synth.dispose();
      }
    }
    this.synths = [];

    // Cierra el contexto de Tone
    if (Tone.context && typeof Tone.context.close === 'function') {
      await Tone.context.close();
    }
  }
}
