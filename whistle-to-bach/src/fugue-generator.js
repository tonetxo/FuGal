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
     * @param {Object} options - Opciones de generación (density, complexity, codaLength)
     * @returns {Object} NoteSequence con 4 voces, tiempos cuantizados
     */
    generate(inputSequence, options = {}) {
        if (!inputSequence || !inputSequence.notes || inputSequence.notes.length === 0) {
            throw new Error("No hay notas válidas para generar la fuga.");
        }

        // Parámetros de generación (defaults)
        this.options = {
            density: options.density ?? 50,       // 0-100: Densidad de notas en episodios
            complexity: options.complexity ?? 70, // 0-100: Cantidad de contrapunto libre
            codaLength: options.codaLength ?? 8    // Beats: Duración de la coda
        };

        // Obtener el BPM de la secuencia de entrada para mantener la consistencia rítmica
        const qpm = inputSequence.tempos?.[0]?.qpm || 120;
        // 1 beat = 1/8 note (corchea). Si qpm es negra, qpm*2 son corcheas por min.
        this.beatDuration = 60 / (qpm * 2);

        console.log(`Generando fuga algorítmica (${this.options.density}% d, ${this.options.complexity}% c) a ${qpm} BPM...`);

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

        // 6. Combinar notas y convertir beats a segundos (LIMPIO Y SIN JITTER)
        const allNotes = [
            ...exposition.notes,
            ...coda.notes
        ].map(n => {
            // CLAMPING FINAL DE SEGURIDAD: Asegurar que nada se sale del rango de la voz
            const voiceRange = [this.voiceRanges.soprano, this.voiceRanges.alto,
            this.voiceRanges.tenor, this.voiceRanges.bass][n.voice];
            const clampedPitch = this.clampPitch(n.pitch, voiceRange.min, voiceRange.max);

            return {
                pitch: clampedPitch,
                startTime: n.startBeat * this.beatDuration,
                endTime: n.endBeat * this.beatDuration,
                velocity: n.velocity || 80,
                instrument: n.voice,
                voice: n.voice
            };
        });

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

        // EXPOSICIÓN EXTENDIDA: Rellenar huecos entre entradas de forma monofónica y en rango
        const expoEndBeat = entry4Beat + subjectDuration;

        [0, 1, 2, 3].forEach(v => {
            const voiceRange = [this.voiceRanges.soprano, this.voiceRanges.alto,
            this.voiceRanges.tenor, this.voiceRanges.bass][v];
            const voiceNotes = notes.filter(n => n.voice === v);
            const lastNote = voiceNotes[voiceNotes.length - 1];

            if (lastNote && lastNote.endBeat < expoEndBeat) {
                // Generar puente directamente en el rango de la voz
                const bridge = this.generateFreeCounterpoint(subject, lastNote.endBeat - subject[0].startBeat, voiceRange);

                bridge.forEach(n => {
                    if (n.startBeat >= lastNote.endBeat && n.startBeat < expoEndBeat) {
                        notes.push({ ...n, voice: v, endBeat: Math.min(n.endBeat, expoEndBeat) });
                    }
                });
            }
        });

        const episode = this.generateEpisode(subject, expoEndBeat);
        notes.push(...episode.notes);

        return {
            notes,
            endBeat: episode.endBeat
        };
    }

    generateFreeCounterpoint(theme, offsetBeat, range = null) {
        if (!theme || theme.length === 0) return [];

        const result = [];
        const complexity = this.options?.complexity ?? 70;
        const prob = complexity / 100;

        let lastPitch = theme[0].pitch;

        theme.forEach((n, i) => {
            // Basar la probabilidad en la complejidad
            if (i % 2 === 0 || Math.random() < prob) {
                // Generar intervalos más variados (hasta una 5ª: +/- 7 semitonos)
                let interval = Math.floor(Math.random() * 9) - 4; // -4 a +4 para fluidez, o saltos ocasionales
                let nextPitch = lastPitch + interval;

                // Suavizar si nos alejamos de la tónica del sujeto
                const tonic = theme[0].pitch;
                if (Math.abs(nextPitch - tonic) > 15) {
                    nextPitch += (nextPitch > tonic ? -3 : 3);
                }

                result.push({
                    pitch: nextPitch,
                    startBeat: n.startBeat + offsetBeat,
                    endBeat: n.endBeat + offsetBeat,
                    velocity: 60 + Math.random() * 15
                });
                lastPitch = nextPitch;
            }
        });

        // Transponer al rango si se proporciona
        if (range) {
            return this.transposeToRange(result, range);
        }
        return result;
    }

    generateEpisode(subject, startBeat) {
        const notes = [];
        const motif = subject.slice(0, Math.min(4, subject.length));

        const density = this.options?.density || 50;
        const numRepetitions = Math.max(3, Math.floor(density / 8)); // 3 a 12 reps

        const direction = Math.random() > 0.5 ? 1 : -1;

        for (let i = 0; i < numRepetitions; i++) {
            const trans = i * 2 * direction;
            const beatOffset = startBeat + (i * 4);

            // Voces activas según densidad (más voces si es más denso)
            const numVoices = density > 75 ? 3 : (density > 25 ? 2 : 1);

            for (let v = 0; v < numVoices; v++) {
                // Rotación de voces que garantiza que todas participen (0, 1, 2, 3)
                const voice = (i + v) % 4;
                const range = [this.voiceRanges.soprano, this.voiceRanges.alto,
                this.voiceRanges.tenor, this.voiceRanges.bass][voice];

                const transposed = this.transposeToRange(
                    motif.map(n => ({ ...n, pitch: n.pitch + trans + (Math.random() > 0.9 ? 1 : 0) })),
                    range
                );

                transposed.forEach(n => {
                    notes.push({
                        ...n,
                        startBeat: n.startBeat + beatOffset,
                        endBeat: n.endBeat + beatOffset,
                        voice: voice,
                        velocity: 55 + Math.random() * 20 // Velocidad variada para más naturalidad
                    });
                });
            }
        }

        const endBeat = startBeat + (numRepetitions * 4);
        return { notes, endBeat };
    }

    /**
     * Construye la coda con un stretto y cadencia final
     */
    buildCoda(subject, startBeat) {
        const notes = [];
        const strettoInterval = this.options?.complexity > 50 ? 2 : 4;
        const shortSubject = subject.slice(0, Math.min(4, subject.length));

        const voices = [
            { range: this.voiceRanges.soprano, voice: 0 },
            { range: this.voiceRanges.alto, voice: 1 },
            { range: this.voiceRanges.tenor, voice: 2 },
            { range: this.voiceRanges.bass, voice: 3 }
        ];

        let maxEndBeat = startBeat;

        // Coda: Stretto con relleno
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

            // Rellenar desde el fin del motivo hasta la cadencia para evitar silencios
            const lastEnd = entryBeat + this.getSequenceDuration(shortSubject);
            const codaBeatsValue = parseInt(this.options?.codaLength || 8);
            const targetCadenceBeat = Math.ceil((maxEndBeat + (codaBeatsValue / 2)) / this.beatsPerMeasure) * this.beatsPerMeasure;

            if (lastEnd < targetCadenceBeat) {
                // Generar puente ya dentro del rango de la voz
                const bridge = this.generateFreeCounterpoint(shortSubject, lastEnd - shortSubject[0].startBeat, v.range);

                bridge.forEach(n => {
                    if (n.startBeat >= lastEnd && n.startBeat < targetCadenceBeat) {
                        notes.push({ ...n, voice: v.voice, endBeat: Math.min(n.endBeat, targetCadenceBeat) });
                    }
                });
            }
        });

        // La codaLength de las opciones controla cuánto esperamos para la cadencia final
        const codaBeats = parseInt(this.options?.codaLength || 8);
        const cadenceBeat = Math.ceil((maxEndBeat + (codaBeats / 2)) / this.beatsPerMeasure) * this.beatsPerMeasure;
        const cadenceDuration = 4; // Blanca

        // Acorde final
        const tonicPitch = subject[0]?.pitch || 60;
        const tonicClass = tonicPitch % 12;

        const finalChord = [
            { targetPitch: tonicClass, range: this.voiceRanges.soprano, voice: 0 },
            { targetPitch: (tonicClass + 4) % 12, range: this.voiceRanges.alto, voice: 1 },
            { targetPitch: (tonicClass + 7) % 12, range: this.voiceRanges.tenor, voice: 2 },
            { targetPitch: tonicClass, range: this.voiceRanges.bass, voice: 3 }
        ];

        finalChord.forEach(chord => {
            // Encontrar la nota del acorde más cercana a la última nota que tocó esta voz
            const voiceNotes = notes.filter(n => n.voice === chord.voice);
            const lastNote = voiceNotes[voiceNotes.length - 1];
            const lastPitch = lastNote ? lastNote.pitch : (chord.range.min + chord.range.max) / 2;

            let pitch = lastPitch;
            // Ajustar a la clase de tónica deseada
            let currentClass = pitch % 12;
            let diff = chord.targetPitch - currentClass;
            if (diff > 6) diff -= 12;
            if (diff < -6) diff += 12;
            pitch += diff;

            // Asegurar que está en rango
            while (pitch < chord.range.min) pitch += 12;
            while (pitch > chord.range.max) pitch -= 12;

            notes.push({
                pitch: pitch,
                startBeat: cadenceBeat,
                endBeat: cadenceBeat + cadenceDuration,
                velocity: 100, // Acorde final fuerte
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
