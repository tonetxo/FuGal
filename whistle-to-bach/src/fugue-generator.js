// src/fugue-generator.js
// Generador Algorítmico de Fugas a 4 voces - CON CUANTIZACIÓN CORRECTA

/**
 * Genera una fuga a 4 voces basada en una melodía de entrada (sujeto).
 * Todos los tiempos están cuantizados a beats (corcheas) para alinearse con M:4/4 L:1/8
 */
export class FugueGenerator {
    constructor() {
        // Configuración de tesituras por voz (MIDI pitch range)
        this.voiceRanges = {
            soprano: { min: 60, max: 81 },  // C4 - A5
            alto: { min: 53, max: 74 },     // F3 - D5
            tenor: { min: 48, max: 67 },    // C3 - G4
            bass: { min: 36, max: 60 }      // C2 - C4
        };

        // Beat duration (1/8 note = 0.5s at 120 BPM, que es nuestro tempo base)
        this.beatDuration = 0.5;
        this.beatsPerMeasure = 8; // 4/4 con L:1/8 = 8 corcheas por compás
    }

    /**
     * Genera una fuga a 4 voces a partir del sujeto (melodía transcrita)
     * @param {Object} inputSequence - NoteSequence de Magenta con la melodía
     * @returns {Object} NoteSequence con 4 voces, tiempos cuantizados
     */
    generate(inputSequence) {
        if (!inputSequence || !inputSequence.notes || inputSequence.notes.length === 0) {
            throw new Error("No hay notas válidas para generar la fuga.");
        }

        console.log("Generando fuga algorítmica...");

        // 1. Extraer y CUANTIZAR el sujeto
        const subject = this.extractAndQuantizeSubject(inputSequence.notes);
        console.log(`Sujeto extraído: ${subject.length} notas, duración: ${this.getSequenceDuration(subject)} beats`);

        // 2. Generar la respuesta (transposición tonal a la dominante)
        const answer = this.generateAnswer(subject);

        // 3. Generar contrasujeto
        const countersubject = this.generateCountersubject(subject);

        // 4. Construir exposición (4 entradas escalonadas)
        const exposition = this.buildExposition(subject, answer, countersubject);

        // 5. Construir coda/stretto
        const coda = this.buildCoda(subject, exposition.endBeat);

        // 6. Combinar notas y convertir beats a segundos
        const allNotes = [
            ...exposition.notes,
            ...coda.notes
        ].map(n => ({
            pitch: n.pitch,
            startTime: n.startBeat * this.beatDuration,
            endTime: n.endBeat * this.beatDuration,
            velocity: n.velocity || 80,
            instrument: n.voice,
            voice: n.voice
        }));

        const totalBeats = coda.endBeat;
        const totalTime = totalBeats * this.beatDuration;

        console.log(`Fuga generada: ${allNotes.length} notas, ${totalBeats} beats, ${totalTime.toFixed(2)}s`);

        return {
            notes: allNotes,
            totalTime: totalTime,
            tempos: [{ time: 0, qpm: 120 }],
            timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }]
        };
    }

    /**
     * Extrae el sujeto y cuantiza a beats discretos
     */
    extractAndQuantizeSubject(notes) {
        const startTime = notes[0].startTime;

        return notes.map(n => {
            // Convertir tiempos a beats (cuantizar)
            const startBeat = Math.round((n.startTime - startTime) / this.beatDuration);
            const durationBeats = Math.max(1, Math.round((n.endTime - n.startTime) / this.beatDuration));

            return {
                pitch: n.pitch,
                startBeat: startBeat,
                endBeat: startBeat + durationBeats,
                velocity: n.velocity || 80
            };
        });
    }

    /**
     * Genera la respuesta tonal (5ª justa arriba)
     */
    generateAnswer(subject) {
        return subject.map(n => ({
            ...n,
            pitch: n.pitch + 7 // 5ª justa = 7 semitonos
        }));
    }

    /**
     * Genera un contrasujeto simple basado en movimiento contrario
     */
    generateCountersubject(subject) {
        if (subject.length < 2) return [];

        const avgPitch = subject.reduce((sum, n) => sum + n.pitch, 0) / subject.length;

        return subject.map(n => {
            const interval = n.pitch - avgPitch;
            const csPitch = Math.round(avgPitch - interval * 0.7);

            return {
                pitch: this.clampPitch(csPitch, 48, 72),
                startBeat: n.startBeat,
                endBeat: n.endBeat,
                velocity: 70
            };
        });
    }

    /**
     * Construye la exposición con 4 entradas escalonadas
     */
    buildExposition(subject, answer, countersubject) {
        const notes = [];
        const subjectDuration = this.getSequenceDuration(subject);

        // Asegurar que la duración del sujeto es múltiplo de un compás (8 beats)
        const measureAlignedDuration = Math.ceil(subjectDuration / this.beatsPerMeasure) * this.beatsPerMeasure;

        // Transponer a tesituras apropiadas
        const sopranoSubject = this.transposeToRange(subject, this.voiceRanges.soprano);
        const altoAnswer = this.transposeToRange(answer, this.voiceRanges.alto);
        const tenorSubject = this.transposeToRange(subject, this.voiceRanges.tenor);
        const bassAnswer = this.transposeToRange(answer, this.voiceRanges.bass);
        const sopranoCS = this.transposeToRange(countersubject, this.voiceRanges.soprano);
        const altoCS = this.transposeToRange(countersubject, this.voiceRanges.alto);
        const tenorCS = this.transposeToRange(countersubject, this.voiceRanges.tenor);

        // === ENTRADA 1: Soprano (sujeto) - Compás 1 ===
        const entry1Beat = 0;
        sopranoSubject.forEach(n => {
            notes.push({
                ...n,
                startBeat: n.startBeat + entry1Beat,
                endBeat: n.endBeat + entry1Beat,
                voice: 0
            });
        });

        // === ENTRADA 2: Alto (respuesta) - Compás 2 ===
        const entry2Beat = measureAlignedDuration;
        altoAnswer.forEach(n => {
            notes.push({
                ...n,
                startBeat: n.startBeat + entry2Beat,
                endBeat: n.endBeat + entry2Beat,
                voice: 1
            });
        });
        // Soprano continúa con contrasujeto
        sopranoCS.forEach(n => {
            notes.push({
                ...n,
                startBeat: n.startBeat + entry2Beat,
                endBeat: n.endBeat + entry2Beat,
                voice: 0
            });
        });

        // === ENTRADA 3: Tenor (sujeto) - Compás 3 ===
        const entry3Beat = measureAlignedDuration * 2;
        tenorSubject.forEach(n => {
            notes.push({
                ...n,
                startBeat: n.startBeat + entry3Beat,
                endBeat: n.endBeat + entry3Beat,
                voice: 2
            });
        });
        // Alto con contrasujeto
        altoCS.forEach(n => {
            notes.push({
                ...n,
                startBeat: n.startBeat + entry3Beat,
                endBeat: n.endBeat + entry3Beat,
                voice: 1
            });
        });

        // === ENTRADA 4: Bajo (respuesta) - Compás 4 ===
        const entry4Beat = measureAlignedDuration * 3;
        bassAnswer.forEach(n => {
            notes.push({
                ...n,
                startBeat: n.startBeat + entry4Beat,
                endBeat: n.endBeat + entry4Beat,
                voice: 3
            });
        });
        // Tenor con contrasujeto
        tenorCS.forEach(n => {
            notes.push({
                ...n,
                startBeat: n.startBeat + entry4Beat,
                endBeat: n.endBeat + entry4Beat,
                voice: 2
            });
        });

        return {
            notes,
            endBeat: entry4Beat + measureAlignedDuration
        };
    }

    /**
     * Construye la coda con un stretto y cadencia final
     */
    buildCoda(subject, startBeat) {
        const notes = [];

        // Stretto: entradas muy cercanas (cada 2 beats)
        const shortSubject = subject.slice(0, Math.min(4, subject.length));
        const strettoInterval = 2; // Entradas cada 2 beats

        const voices = [
            { range: this.voiceRanges.soprano, voice: 0 },
            { range: this.voiceRanges.alto, voice: 1 },
            { range: this.voiceRanges.tenor, voice: 2 },
            { range: this.voiceRanges.bass, voice: 3 }
        ];

        let maxEndBeat = startBeat;

        voices.forEach((v, i) => {
            const entryBeat = startBeat + (i * strettoInterval);
            const transposed = this.transposeToRange(shortSubject, v.range);

            transposed.forEach(n => {
                const endBeat = n.endBeat + entryBeat;
                notes.push({
                    ...n,
                    startBeat: n.startBeat + entryBeat,
                    endBeat: endBeat,
                    voice: v.voice
                });
                maxEndBeat = Math.max(maxEndBeat, endBeat);
            });
        });

        // Alinear al siguiente compás para la cadencia
        const cadenceBeat = Math.ceil(maxEndBeat / this.beatsPerMeasure) * this.beatsPerMeasure;
        const cadenceDuration = 4; // Blanca

        // Acorde final en todas las voces
        const tonicPitch = subject[0]?.pitch || 60;
        [
            { pitch: tonicPitch + 24, voice: 0 },  // Soprano: tónica alta
            { pitch: tonicPitch + 16, voice: 1 },  // Alto: 3ª mayor
            { pitch: tonicPitch + 7, voice: 2 },   // Tenor: 5ª
            { pitch: tonicPitch, voice: 3 }        // Bajo: tónica
        ].forEach(chord => {
            notes.push({
                pitch: this.clampPitch(chord.pitch, 36, 84),
                startBeat: cadenceBeat,
                endBeat: cadenceBeat + cadenceDuration,
                velocity: 90,
                voice: chord.voice
            });
        });

        return {
            notes,
            endBeat: cadenceBeat + cadenceDuration
        };
    }

    /**
     * Transpone una secuencia al rango de una voz específica
     */
    transposeToRange(sequence, range) {
        if (sequence.length === 0) return [];

        const avgPitch = sequence.reduce((sum, n) => sum + n.pitch, 0) / sequence.length;
        const targetCenter = (range.min + range.max) / 2;
        const transpose = Math.round(targetCenter - avgPitch);

        return sequence.map(n => ({
            ...n,
            pitch: this.clampPitch(n.pitch + transpose, range.min, range.max)
        }));
    }

    /**
     * Limita un pitch al rango especificado (ajustando octavas)
     */
    clampPitch(pitch, min, max) {
        while (pitch < min) pitch += 12;
        while (pitch > max) pitch -= 12;
        return Math.max(min, Math.min(max, pitch));
    }

    /**
     * Calcula la duración total de una secuencia en beats
     */
    getSequenceDuration(sequence) {
        if (sequence.length === 0) return 0;
        const maxEndBeat = Math.max(...sequence.map(n => n.endBeat));
        const minStartBeat = Math.min(...sequence.map(n => n.startBeat));
        return maxEndBeat - minStartBeat;
    }
}
