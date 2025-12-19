// src/renderer.js
import abcjs from 'abcjs';

export class ScoreRenderer {
  constructor(elementId) {
    this.elementId = elementId;
  }

  /**
   * Renderiza una NoteSequence como partitura ABC
   * @param {Object} noteSequence - Secuencia de notas
   * @param {string} layoutMode - Modo de layout ('grand-staff' o 'open-score')
   */
  render(noteSequence, layoutMode = 'grand-staff') {
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
      // Convertir NoteSequence a ABC notation con el layout seleccionado
      const abcNotation = this.noteSequenceToABC(noteSequence, layoutMode);
      console.log("ABC Notation generada:", abcNotation);

      // Renderizar con abcjs
      div.innerHTML = '';
      abcjs.renderAbc(div, abcNotation, {
        responsive: 'resize',
        add_classes: true,
        scale: 1.4,          // Aumentar tamaño para mejor visibilidad
        paddingtop: 20,
        paddingbottom: 20,
        paddingright: 20,
        paddingleft: 20,
        staffwidth: 800,     // Ancho de referencia
        wrap: {              // Forzar el salto de línea para que no se corte
          minSpacing: 1.8,
          maxSpacing: 2.8,
          preferredMeasuresPerLine: 4
        }
      });
    } catch (err) {
      console.error("Error al renderizar partitura:", err);
    }
  }

  /**
   * Convierte una NoteSequence de Magenta a notación ABC
   * @param {Object} noteSequence - Secuencia de notas
   * @param {string} layoutMode - Modo de layout: 'grand-staff' o 'open-score'
   * @returns {string} Notación ABC
   */
  noteSequenceToABC(noteSequence, layoutMode = 'grand-staff') {
    if (!noteSequence || !noteSequence.notes || noteSequence.notes.length === 0) {
      return '';
    }

    // Organizar notas por instrumento (voz)
    const voices = {};
    noteSequence.notes.forEach(note => {
      const inst = note.instrument || 0;
      if (!voices[inst]) voices[inst] = [];
      voices[inst].push(note);
    });

    // Asegurar que las notas están ordenadas
    Object.values(voices).forEach(notes => {
      notes.sort((a, b) => a.startTime - b.startTime);
    });

    // Calcular tiempo total máximo
    let maxEndTime = 0;
    noteSequence.notes.forEach(note => {
      if (note.endTime > maxEndTime) maxEndTime = note.endTime;
    });
    if (maxEndTime === 0) maxEndTime = noteSequence.totalTime || 0;

    // Obtener BPM real de la secuencia
    const qpm = Math.round(noteSequence.tempos?.[0]?.qpm || 120);
    const beatDuration = 60 / (qpm * 2); // 1/8 note duration
    const beatsPerMeasure = 8;
    const totalBeats = Math.ceil(maxEndTime / beatDuration);
    const totalMeasures = Math.ceil(totalBeats / beatsPerMeasure);
    const syncedTotalTime = totalMeasures * beatsPerMeasure * beatDuration;

    // Generar header ABC
    // %%score { (1 2) | (3 4) } agrupa voces 1/2 y 3/4 en dos sistemas con barras unidas
    // %%score { 1 | 2 | 3 | 4 } muestra 4 sistemas independientes pero con barras unidas
    const scoreDirective = layoutMode === 'open-score'
      ? '%%score { 1 | 2 | 3 | 4 }'
      : '%%score { (1 2) | (3 4) }';

    let abc = `X:1
T:Whistle to Bach
M:4/4
L:1/8
Q:1/4=${qpm}
${scoreDirective}
K:C
`;

    // Generar notas para cada voz
    const voiceKeys = Object.keys(voices).sort((a, b) => a - b);

    // Primera pasada: generar todas las voces y contar barras
    const voiceABCs = [];
    let maxBars = 0;

    voiceKeys.forEach((voiceKey, idx) => {
      const voiceNotes = voices[voiceKey];
      const clef = idx < 2 ? 'treble' : 'bass';
      const voiceName = ['Soprano', 'Alto', 'Tenor', 'Bass'][idx] || `V${idx}`;
      const header = `V:${idx + 1} clef=${clef} name="${voiceName}"`;

      // Generar sin límite de compases
      const abcLine = this.notesToABCLine(voiceNotes, beatDuration, syncedTotalTime, 0);
      const bars = (abcLine.match(/\|/g) || []).length;

      if (bars > maxBars) maxBars = bars;

      voiceABCs.push({ header, abcLine, bars, voiceNotes });
    });


    // Segunda pasada: regenerar voces con menos compases para igualar
    voiceABCs.forEach((voice, idx) => {
      abc += voice.header + '\n';
      if (voice.bars < maxBars) {
        // Regenerar con el número correcto de compases
        abc += this.notesToABCLine(voice.voiceNotes, beatDuration, syncedTotalTime, maxBars);
      } else {
        abc += voice.abcLine;
      }
      abc += '\n';
    });

    return abc;
  }

  /**
   * Convierte un array de notas a una línea ABC
   * @param {Array} notes - Array de notas
   * @param {number} beatDuration - Duración de una corchea en segundos
   * @param {number} totalTime - Tiempo total sincronizado
   * @param {number} totalMeasures - Número total de compases requeridos
   */
  notesToABCLine(notes, beatDuration, totalTime, totalMeasures = 0) {
    const beatsPerMeasure = 8;

    if (!notes || notes.length === 0) {
      const measures = totalMeasures > 0 ? totalMeasures : 1;
      let abcLine = '';
      for (let i = 0; i < measures - 1; i++) {
        abcLine += 'z8 | ';
      }
      abcLine += 'z8 |]';
      return abcLine;
    }

    let abcLine = '';
    let currentTime = 0;
    let beatsInMeasure = 0;
    let measuresWritten = 0;

    notes.forEach((note) => {
      const gap = note.startTime - currentTime;
      if (gap > beatDuration / 2) {
        let restBeats = Math.round(gap / beatDuration);

        while (restBeats > 0) {
          const beatsUntilBar = beatsPerMeasure - beatsInMeasure;
          const restsToAdd = Math.min(restBeats, beatsUntilBar);

          if (restsToAdd > 0) {
            abcLine += restsToAdd > 1 ? `z${restsToAdd} ` : 'z ';
            beatsInMeasure += restsToAdd;
            restBeats -= restsToAdd;
          }

          if (beatsInMeasure >= beatsPerMeasure) {
            abcLine += '| ';
            beatsInMeasure = 0;
            measuresWritten++;
          }
        }
      }

      const abcNote = this.midiToABC(note.pitch);
      const duration = note.endTime - note.startTime;
      let noteBeats = Math.max(1, Math.round(duration / beatDuration));

      while (noteBeats > 0) {
        const beatsUntilBar = beatsPerMeasure - beatsInMeasure;
        const beatsToWrite = Math.min(noteBeats, beatsUntilBar);

        abcLine += beatsToWrite > 1 ? `${abcNote}${beatsToWrite} ` : `${abcNote} `;
        beatsInMeasure += beatsToWrite;
        noteBeats -= beatsToWrite;

        if (beatsInMeasure >= beatsPerMeasure) {
          abcLine += '| ';
          beatsInMeasure = 0;
          measuresWritten++;
        }
      }

      currentTime = note.endTime;
    });

    // Contar cuántos compases se han escrito realmente (contando barras |)
    const barsWritten = (abcLine.match(/\|/g) || []).length;

    // Completar el compás actual si está incompleto
    if (beatsInMeasure > 0 && beatsInMeasure < beatsPerMeasure) {
      const remainingBeats = beatsPerMeasure - beatsInMeasure;
      abcLine += remainingBeats > 1 ? `z${remainingBeats} ` : 'z ';
      abcLine += '| ';
    }

    // Contar barras después de completar
    let currentBars = (abcLine.match(/\|/g) || []).length;

    // Añadir compases completos de silencio hasta alcanzar totalMeasures
    const targetMeasures = totalMeasures > 0 ? totalMeasures : currentBars;

    while (currentBars < targetMeasures) {
      abcLine += 'z8 | ';
      currentBars++;
    }

    // Barra de cierre final - reemplazar la última | por |]
    abcLine = abcLine.trimEnd();
    if (abcLine.endsWith('|')) {
      abcLine = abcLine.slice(0, -1) + '|]';
    } else {
      abcLine += ' |]';
    }

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