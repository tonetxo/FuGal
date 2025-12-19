// src/recorder.js

export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    // Inicializamos el AudioContext.
    // Nota: Los navegadores a menudo requieren una interacción del usuario antes de que esto funcione plenamente.
    this.audioContext = null; // Inicializamos en null y creamos cuando sea necesario

    // Para análisis de nivel (VU meter)
    this.analyser = null;
    this.mediaStreamSource = null;
    this.dataArray = null;
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

      // Configurar el analizador de nivel (VU meter)
      const context = this.getAudioContext();
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      this.mediaStreamSource = context.createMediaStreamSource(stream);
      this.mediaStreamSource.connect(this.analyser);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.mediaRecorder.start();
      console.log("Grabación iniciada...");
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      throw err;
    }
  }

  /**
   * Obtiene el nivel de entrada actual (0-1) para el VU meter
   * @returns {number} Nivel normalizado entre 0 y 1
   */
  getInputLevel() {
    if (!this.analyser || !this.dataArray) return 0;

    this.analyser.getByteFrequencyData(this.dataArray);

    // Calcular el promedio de las frecuencias (RMS simplificado)
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length;

    // Normalizar a 0-1 (los valores van de 0-255)
    return Math.min(average / 128, 1);
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
