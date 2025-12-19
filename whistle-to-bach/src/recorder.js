// src/recorder.js

export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    // Inicializamos el AudioContext.
    // Nota: Los navegadores a menudo requieren una interacción del usuario antes de que esto funcione plenamente.
    this.audioContext = null; // Inicializamos en null y creamos cuando sea necesario
  }

  /**
   * Obtiene o crea el AudioContext.
   * @returns {AudioContext} El contexto de audio
   */
  getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  /**
   * Asegura que el AudioContext esté activo.
   */
  async ensureContext() {
    const context = this.getAudioContext();
    if (context.state === 'suspended') {
      await context.resume();
    }
  }

  /**
   * Inicia la grabación desde el micrófono.
   */
  async startRecording() {
    await this.ensureContext();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      console.log("Grabación iniciada...");
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      throw err;
    }
  }

  /**
   * Detiene la grabación y devuelve el AudioBuffer decodificado.
   * @returns {Promise<AudioBuffer>}
   */
  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) return resolve(null);

      this.mediaRecorder.onstop = async () => {
        try {
          // Usar el mimeType real del MediaRecorder (navegador decide: webm, ogg, etc.)
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          const arrayBuffer = await audioBlob.arrayBuffer();
          const audioBuffer = await this.getAudioContext().decodeAudioData(arrayBuffer);

          console.log("Grabación detenida y decodificada.");
          resolve(audioBuffer);
        } catch (error) {
          console.error("Error al decodificar audio:", error);
          reject(error);
        }
      };

      this.mediaRecorder.stop();
      // Liberar el micrófono - validar que existe el stream y tiene tracks
      if (this.mediaRecorder && this.mediaRecorder.stream) {
        const tracks = this.mediaRecorder.stream.getTracks();
        tracks.forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
      }
      this.mediaRecorder = null;
    });
  }

  /**
   * Carga un archivo de audio (File object) y devuelve el AudioBuffer.
   * @param {File} file - Archivo seleccionado por el usuario (wav, mp3, etc.)
   * @returns {Promise<AudioBuffer>}
   */
  async loadAudioFile(file) {
    await this.ensureContext();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.getAudioContext().decodeAudioData(arrayBuffer);
      console.log(`Archivo cargado: ${file.name}, Duración: ${audioBuffer.duration}s`);
      return audioBuffer;
    } catch (error) {
      console.error("Error al decodificar el archivo de audio:", error);
      throw new Error("No se pudo decodificar el archivo de audio. Asegúrate de que es un formato válido.");
    }
  }

  /**
   * Libera recursos del audio context
   */
  async destroy() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
  }
}
