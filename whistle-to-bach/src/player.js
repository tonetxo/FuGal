// src/player.js
import * as Tone from 'tone';

export class AudioPlayer {
  constructor() {
    this.synths = [];
    this.isPlaying = false;
    this.sequence = null;
    this.parts = [];

    // Inicializar Tone.js en estado suspendido
    this.isInitialized = false;
  }

  async initialize() {
    if (!this.isInitialized) {
      // Crear 4 sintetizadores, uno por voz (Soprano, Alto, Tenor, Bajo)
      const synthOptions = {
        oscillator: { type: "triangle" },
        envelope: {
          attack: 0.03,
          decay: 0.1,
          sustain: 0.4,
          release: 0.8
        }
      };

      const bassSynthOptions = {
        oscillator: { type: "sawtooth" },
        envelope: {
          attack: 0.02,
          decay: 0.1,
          sustain: 0.5,
          release: 0.8
        }
      };

      for (let i = 0; i < 4; i++) {
        const pan = new Tone.Panner((i - 1.5) * 0.4).toDestination();
        const options = i === 3 ? bassSynthOptions : synthOptions;
        const synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 8,
          ...options
        }).connect(pan);

        // Volumen más audible
        synth.volume.value = i === 3 ? -2 : -6;
        this.synths.push(synth);
      }

      this.isInitialized = true;
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
    }, totalDuration + 0.1);

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
