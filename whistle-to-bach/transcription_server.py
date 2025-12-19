#!/usr/bin/env python3
"""
Python server for audio transcription using TensorFlow and Basic Pitch.
This handles the audio transcription requests from the frontend.
"""

from flask import Flask, request, jsonify
import numpy as np
import io
import soundfile as sf
import sys
import os

# Add the venv packages to the path
venv_path = os.path.join(os.path.dirname(__file__), 'venv')
if os.path.exists(venv_path):
    site_packages = os.path.join(venv_path, 'lib', 'python{}.{}/site-packages'.format(sys.version_info.major, sys.version_info.minor))
    sys.path.insert(0, site_packages)

app = Flask(__name__)

# Initialize models - basic-pitch 0.4.0 usa predict() directamente
basic_pitch_available = False

def initialize_models():
    """Initialize the transcription models."""
    global basic_pitch_available

    try:
        # Verificar que basic-pitch está disponible
        from basic_pitch.inference import predict
        basic_pitch_available = True
        print("Basic Pitch initialized successfully")
    except ImportError as e:
        print(f"Error importing Basic Pitch: {e}")
        print("Install with: pip install basic-pitch")
        import sys
        sys.exit(1)

@app.route('/api/health', methods=['GET'])
def api_health():
    """Health check endpoint accessible from frontend."""
    return jsonify({"status": "ok", "models_loaded": basic_pitch_available})

@app.route('/api/transcribe', methods=['POST'])
def api_transcribe_audio():
    """Endpoint to transcribe uploaded audio."""
    global basic_pitch_model

    try:
        # Check if file is in request
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400

        file = request.files['audio']
        audio_bytes = file.read()

        # Decode audio from bytes
        audio_buffer = io.BytesIO(audio_bytes)
        audio_data, sample_rate = sf.read(audio_buffer)

        # If stereo, convert to mono
        if len(audio_data.shape) > 1:
            audio_data = np.mean(audio_data, axis=1)

        # Import basic pitch prediction function
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH

        # Guardar audio temporalmente para predict()
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            import scipy.io.wavfile
            # Normalizar a int16 para WAV
            audio_int16 = (audio_data * 32767).astype('int16')
            scipy.io.wavfile.write(tmp_file.name, sample_rate, audio_int16)
            tmp_path = tmp_file.name

        # Perform transcription usando predict() de basic-pitch 0.4.0
        model_output, midi_data, note_events = predict(
            tmp_path,
            onset_threshold=0.5,
            frame_threshold=0.3,
            minimum_note_length=58,  # ms
        )

        # Limpiar archivo temporal
        import os as os_module
        os_module.unlink(tmp_path)

        # Format the output as a magenta-compatible NoteSequence
        note_sequence = {
            "notes": [],
            "totalTime": len(audio_data) / sample_rate,  # Duration in seconds
            "tempos": [{"qpm": 120, "time": 0}],
            "quantizationInfo": {"stepsPerQuarter": 4}
        }

        # Convert note events to the required format
        # basic-pitch 0.4.0 devuelve tuplas: (start_time, end_time, pitch, amplitude, bends)
        if note_events is not None:
            for event in note_events:
                start_time, end_time, pitch, amplitude, _ = event
                note = {
                    "pitch": int(pitch),
                    "startTime": float(start_time),
                    "endTime": float(end_time),
                    "velocity": int(amplitude * 127),  # Convertir amplitud 0-1 a velocidad MIDI 0-127
                    "instrument": 0,
                    "program": 0,
                    "isDrum": False
                }
                note_sequence["notes"].append(note)

        return jsonify(note_sequence)

    except Exception as e:
        print(f"Error during transcription: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Initialize models before starting the server
    initialize_models()

    # Start the server
    port = int(os.environ.get('PORT', 5000))
    debug_mode = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug_mode)