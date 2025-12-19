# 🎵 Whistle to Bach (Silbido a Fuga)

**Una aplicación web que transforma melodías silbadas o tarareadas en composiciones polifónicas estilo Bach, ejecutándose 100% en local.**

> **Estado:** Concepto / En Desarrollo
> **Arquitectura:** Client-Side Only (Offline First)
> **Coste de Nube:** 0€

---

## 📋 Descripción General

Esta aplicación permite al usuario grabar una melodía simple (silbido, voz) a través del micrófono, o desde un archivo de audio. Utilizando Inteligencia Artificial en el navegador (TensorFlow.js), la app transcribe el audio a notas musicales (MIDI) y utiliza un modelo generativo entrenado con corales de Bach para componer automáticamente tres voces de acompañamiento (Alto, Tenor, Bajo), creando una fuga completa.

### Características Clave
* 🎙️ **Grabación en tiempo real:** Captura de audio desde el navegador y/o importación de archivo de audio (mp3, wav).
* 🎼 **Audio-to-MIDI:** Transcripción automática mediante redes neuronales.
* 🧠 **IA Generativa Local:** Armonización estilo Bach sin enviar datos a servidores.
* 👀 **Visualización:** Generación de partitura dinámica.
* 🎹 **Reproducción:** Sintetizador integrado para escuchar el resultado.

---

## 🛠️ Stack Tecnológico (Bibliotecas)

Este proyecto no requiere backend (Node.js, Python, etc.) para la lógica de IA. Todo ocurre en el cliente.

| Componente | Tecnología / Librería | Función |
| :--- | :--- | :--- |
| **Transcripción** | **[`@spotify/basic-pitch`](https://github.com/spotify/basic-pitch)** | Convierte el audio crudo (`.wav`) en notas MIDI (`NoteSequence`). Ligero y preciso. |
| **Motor IA** | **[`@magenta/music`](https://github.com/magenta/magenta-js/tree/master/music)** | Biblioteca core de Google para música generativa en JS. |
| **Modelo** | **`Coconet`** (dentro de Magenta) | Modelo de Inpainting entrenado con corales de Bach. |
| **Visualización** | **[`VexFlow`](https://github.com/0xfe/vexflow)** | Renderizado de partituras estándar en HTML5 Canvas/SVG. |
| **Audio** | **[`Tone.js`](https://tonejs.github.io/)** | Motor de audio web para cargar SoundFonts y reproducir el MIDI. |
| **Bundler** | **[Vite](https://vitejs.dev/)** (Recomendado) | Para gestionar las dependencias de NPM fácilmente. |

---

## 📂 Estructura del Proyecto

```text
/whistle-to-bach
├── /public
│   ├── /assets
│   │   ├── /models
│   │   │   ├── /coconet_checkpoint/  # Archivos .json y .bin del modelo (OFFLINE)
│   │   │   └── /basic_pitch_model/   # Modelo de Spotify (OFFLINE)
│   │   └── /sounds/                  # SoundFonts (ej: organ.mp3, harpsichord.mp3)
│   └── favicon.ico
├── /src
│   ├── main.js             # Orquestador principal (Controlador)
│   ├── recorder.js         # Lógica de Micrófono y AudioContext
│   ├── transcriber.js      # Wrapper para Basic Pitch
│   ├── composer.js         # Lógica de Magenta y Coconet (Inpainting)
│   ├── renderer.js         # Lógica de VexFlow (Dibujado)
│   └── player.js           # Lógica de Tone.js (Reproducción)
├── index.html              # Interfaz de Usuario (Botones, Canvas)
├── package.json            # Dependencias
└── vite.config.js          # Configuración del bundler
