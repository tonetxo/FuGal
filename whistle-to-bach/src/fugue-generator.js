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

        // Obtener el BPM de la secuencia de entrada para mantener la consistencia rítmica
        const qpm = inputSequence.tempos?.[0]?.qpm || 120;
        // 1 beat = 1/8 note (corchea). Si qpm es negra, qpm*2 son corcheas por min.
        this.beatDuration = 60 / (qpm * 2);

        console.log(`Generando fuga algorítmica a ${qpm} BPM (corchea = ${this.beatDuration}s)...`);

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
            tempos: [{ time: 0, qpm: qpm }],
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
     * Construye la exposición con 4 entradas escalonadas (solapadas parcialmente)
     */
    buildExposition(subject, answer, countersubject) {
        const notes = [];
        const subjectDuration = this.getSequenceDuration(subject);

        // Entrada cada sujeto completo o medio (mínimo 1 compás = 8 corcheas)
        // Redondeamos a múltiplos de 4 beats para mejor alineación musical
        let entrySpacing = Math.max(8, Math.ceil(subjectDuration / 4) * 4);

        // Transponer a tesituras apropiadas
        const sopranoSubject = this.transposeToRange(subject, this.voiceRanges.soprano);
        const altoAnswer = this.transposeToRange(answer, this.voiceRanges.alto);
        const tenorSubject = this.transposeToRange(subject, this.voiceRanges.tenor);
        const bassAnswer = this.transposeToRange(answer, this.voiceRanges.bass);
        const sopranoCS = this.transposeToRange(countersubject, this.voiceRanges.soprano);
        const altoCS = this.transposeToRange(countersubject, this.voiceRanges.alto);
        const tenorCS = this.transposeToRange(countersubject, this.voiceRanges.tenor);
        const bassCS = this.transposeToRange(countersubject, this.voiceRanges.bass);

        // === ENTRADA 1: Soprano (sujeto) ===
        const entry1Beat = 0;
        sopranoSubject.forEach(n => {
            notes.push({ ...n, startBeat: n.startBeat + entry1Beat, endBeat: n.endBeat + entry1Beat, voice: 0 });
        });

        // === ENTRADA 2: Alto (respuesta) - entra durante el sujeto ===
        const entry2Beat = entrySpacing;
        altoAnswer.forEach(n => {
            notes.push({ ...n, startBeat: n.startBeat + entry2Beat, endBeat: n.endBeat + entry2Beat, voice: 1 });
        });
        // Soprano continúa con contrasujeto
        sopranoCS.forEach(n => {
            notes.push({ ...n, startBeat: n.startBeat + entry2Beat, endBeat: n.endBeat + entry2Beat, voice: 0 });
        });

        // === ENTRADA 3: Tenor (sujeto) ===
        const entry3Beat = entrySpacing * 2;
        tenorSubject.forEach(n => {
            notes.push({ ...n, startBeat: n.startBeat + entry3Beat, endBeat: n.endBeat + entry3Beat, voice: 2 });
        });
        // Alto con contrasujeto
        altoCS.forEach(n => {
            notes.push({ ...n, startBeat: n.startBeat + entry3Beat, endBeat: n.endBeat + entry3Beat, voice: 1 });
        });
        // Soprano continúa con variación del sujeto (material libre)
        this.generateFreeCounterpoint(sopranoSubject, entry3Beat).forEach(n => {
            notes.push({ ...n, voice: 0 });
        });

        // === ENTRADA 4: Bajo (respuesta) ===
        const entry4Beat = entrySpacing * 3;
        bassAnswer.forEach(n => {
            notes.push({ ...n, startBeat: n.startBeat + entry4Beat, endBeat: n.endBeat + entry4Beat, voice: 3 });
        });
        // Tenor con contrasujeto
        tenorCS.forEach(n => {
            notes.push({ ...n, startBeat: n.startBeat + entry4Beat, endBeat: n.endBeat + entry4Beat, voice: 2 });
        });
        // Alto y Soprano continúan
        this.generateFreeCounterpoint(altoAnswer, entry4Beat).forEach(n => {
            notes.push({ ...n, voice: 1 });
        });
        this.generateFreeCounterpoint(sopranoSubject, entry4Beat).forEach(n => {
            notes.push({ ...n, voice: 0 });
        });

        // Extensión después de la exposición para dar más desarrollo
        const postExpoStart = entry4Beat + subjectDuration;
        const episode = this.generateEpisode(subject, postExpoStart);
        notes.push(...episode.notes);

        return {
            notes,
            endBeat: episode.endBeat
        };
    }

    /**
     * Genera contrapunto libre basado en un tema (variación rítmica/melódica)
     */
    generateFreeCounterpoint(theme, offsetBeat) {
        if (theme.length === 0) return [];

        // Generar una variación: invertir direcciones y ajustar ritmo
        const result = [];
        const avgPitch = theme.reduce((sum, n) => sum + n.pitch, 0) / theme.length;

        theme.forEach((n, i) => {
            if (i % 2 === 0) { // Usar la mitad de las notas
                const interval = n.pitch - avgPitch;
                result.push({
                    pitch: Math.round(avgPitch - interval * 0.5), // Inversión parcial
                    startBeat: n.startBeat + offsetBeat,
                    endBeat: n.endBeat + offsetBeat,
                    velocity: 65
                });
            }
        });

        return result;
    }

    /**
     * Genera un episodio (desarrollo) con secuencias basadas en el sujeto
     */
    generateEpisode(subject, startBeat) {
        const notes = [];
        const motif = subject.slice(0, Math.min(4, subject.length)); // Motivo corto

        // Secuencia descendente por grados
        const transpositions = [0, -2, -4, -2]; // Patrón de transposición

        transpositions.forEach((trans, i) => {
            const beatOffset = startBeat + (i * 4); // Cada 4 beats
            const voice = i % 4; // Rotar entre voces
            const range = [this.voiceRanges.soprano, this.voiceRanges.alto,
            this.voiceRanges.tenor, this.voiceRanges.bass][voice];

            const transposed = this.transposeToRange(
                motif.map(n => ({ ...n, pitch: n.pitch + trans })),
                range
            );

            transposed.forEach(n => {
                notes.push({
                    ...n,
                    startBeat: n.startBeat + beatOffset,
                    endBeat: n.endBeat + beatOffset,
                    voice: voice
                });
            });
        });

        const endBeat = startBeat + 16; // 2 compases de episodio
        return { notes, endBeat };
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

        // Acorde final en todas las voces (respetando tesituras)
        const tonicPitch = subject[0]?.pitch || 60;
        const tonicClass = tonicPitch % 12; // Clase de pitch (0-11)

        // Calcular pitches del acorde en las tesituras correctas
        const finalChord = [
            { targetPitch: tonicClass, range: this.voiceRanges.soprano, voice: 0 },  // Tónica
            { targetPitch: (tonicClass + 4) % 12, range: this.voiceRanges.alto, voice: 1 },  // 3ª mayor
            { targetPitch: (tonicClass + 7) % 12, range: this.voiceRanges.tenor, voice: 2 },  // 5ª
            { targetPitch: tonicClass, range: this.voiceRanges.bass, voice: 3 }   // Tónica (bajo)
        ];

        finalChord.forEach(chord => {
            // Encontrar el pitch dentro del rango de la voz
            let pitch = chord.range.min + chord.targetPitch;
            while (pitch < chord.range.min) pitch += 12;
            while (pitch > chord.range.max) pitch -= 12;
            // Asegurar que está en el centro del rango
            const center = (chord.range.min + chord.range.max) / 2;
            while (pitch < center - 6 && pitch + 12 <= chord.range.max) pitch += 12;
            while (pitch > center + 6 && pitch - 12 >= chord.range.min) pitch -= 12;


            notes.push({
                pitch: pitch,
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
