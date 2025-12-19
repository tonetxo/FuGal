// src/renderer.js
import abcjs from 'abcjs';

export class ScoreRenderer {
  constructor(elementId) {
    this.elementId = elementId;
  }

  /**
   * Renderiza una NoteSequence de Magenta como partitura usando abcjs
   * @param {Object} noteSequence - NoteSequence de Magenta
   */
  render(noteSequence) {
    if (!noteSequence || !noteSequence.notes || noteSequence.notes.length === 0) {
      console.warn("No hay notas para renderizar");
      const div = document.getElementById(this.elementId);
      if (div) {
        div.innerHTML = '<p style="color: #999; text-align: center;">No hay notas para mostrar</p>';
      }
      return;
    }

    const div = document.getElementById(this.elementId);
    if (!div) {
      console.error(`Elemento con ID "${this.elementId}" no encontrado`);
      return;
    }

    try {
      // Convertir NoteSequence a ABC notation
      const abcNotation = this.noteSequenceToABC(noteSequence);
      console.log("ABC Notation generada:", abcNotation);

      // Renderizar con abcjs
      div.innerHTML = '';
      abcjs.renderAbc(div, abcNotation, {
        responsive: 'resize',
        add_classes: true,
        staffwidth: 850,
        scale: 1.0,
        paddingtop: 10,
        paddingbottom: 10,
        wrap: {
          minSpacing: 1.8,
          maxSpacing: 2.8,
          preferredMeasuresPerLine: 4
        }
      });

    } catch (error) {
      console.error("Error al renderizar la partitura:", error);
      div.innerHTML = '<p style="color: #f00; text-align: center;">Error al renderizar la partitura</p>';
    }
  }

  /**
   * Convierte una NoteSequence de Magenta a notación ABC
   * @param {Object} noteSequence - NoteSequence de Magenta
   * @returns {string} Notación ABC
   */
  noteSequenceToABC(noteSequence) {
    // Separar notas por voz/instrumento
    const voices = {};
    noteSequence.notes.forEach(note => {
      const voice = note.instrument || 0;
      if (!voices[voice]) voices[voice] = [];
      voices[voice].push(note);
    });

    // Ordenar notas por tiempo
    Object.values(voices).forEach(notes => {
      notes.sort((a, b) => a.startTime - b.startTime);
    });

    // Generar header ABC
    let abc = `X:1
T:Whistle to Bach
M:4/4
L:1/8
Q:1/4=120
K:C
`;

    // Generar notas para cada voz
    const voiceKeys = Object.keys(voices).sort((a, b) => a - b);

    voiceKeys.forEach((voiceKey, idx) => {
      const voiceNotes = voices[voiceKey];
      const clef = idx < 2 ? 'treble' : 'bass';
      const voiceName = ['Soprano', 'Alto', 'Tenor', 'Bass'][idx] || `V${idx}`;

      abc += `V:${idx + 1} clef=${clef} name="${voiceName}"\n`;
      abc += this.notesToABCLine(voiceNotes, noteSequence.totalTime);
      abc += '\n';
    });

    return abc;
  }

  /**
   * Convierte un array de notas a una línea ABC
   */
  notesToABCLine(notes, totalTime) {
    if (!notes || notes.length === 0) return 'z8 |\n';

    let abcLine = '';
    let currentTime = 0;
    const beatDuration = 0.5; // 1/8 note at 120 BPM

    notes.forEach((note, i) => {
      // Añadir silencios si hay gaps
      const gap = note.startTime - currentTime;
      if (gap > beatDuration / 2) {
        const restBeats = Math.round(gap / beatDuration);
        if (restBeats > 0) {
          abcLine += `z${restBeats} `;
        }
      }

      // Convertir pitch MIDI a ABC
      const abcNote = this.midiToABC(note.pitch);

      // Calcular duración
      const duration = note.endTime - note.startTime;
      const beats = Math.max(1, Math.round(duration / beatDuration));

      if (beats > 1) {
        abcLine += `${abcNote}${beats}`;
      } else {
        abcLine += abcNote;
      }
      abcLine += ' ';

      currentTime = note.endTime;

      // Añadir barra de compás cada 4 tiempos aproximadamente
      if ((i + 1) % 8 === 0) {
        abcLine += '| ';
      }
    });

    abcLine += '|]';
    return abcLine;
  }

  /**
   * Convierte un pitch MIDI a notación ABC
   * @param {number} midi - Número MIDI (0-127)
   * @returns {string} Nota en formato ABC
   */
  midiToABC(midi) {
    if (typeof midi !== 'number' || midi < 0 || midi > 127) {
      return 'C'; // valor por defecto
    }

    // Nombres de notas en ABC
    const noteNames = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
    const noteName = noteNames[midi % 12];
    const octave = Math.floor(midi / 12) - 1;

    // En ABC:
    // C4 (middle C, MIDI 60) = C
    // C5 = c (lowercase)
    // C6 = c' (lowercase with ')
    // C3 = C, (uppercase with ,)
    // C2 = C,, (uppercase with ,,)

    if (octave === 4) {
      return noteName; // Octava central: C, D, E...
    } else if (octave === 5) {
      return noteName.toLowerCase(); // Una octava arriba: c, d, e...
    } else if (octave >= 6) {
      const primes = "'".repeat(octave - 5);
      return noteName.toLowerCase() + primes; // c', c''...
    } else if (octave === 3) {
      return noteName + ','; // Una octava abajo: C,, D,,...
    } else {
      const commas = ','.repeat(4 - octave);
      return noteName + commas; // C,,, ...
    }
  }
}