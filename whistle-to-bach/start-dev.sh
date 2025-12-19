#!/bin/bash
# start-dev.sh - Arranca el servidor Python y Vite en paralelo

echo "🎵 Arrancando Whistle to Bach..."

# Función para matar procesos al salir
cleanup() {
    echo ""
    echo "🛑 Deteniendo servidores..."
    kill $PYTHON_PID 2>/dev/null
    kill $VITE_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: Ejecuta este script desde el directorio whistle-to-bach"
    exit 1
fi

# Arrancar servidor Python de transcripción
echo "🐍 Arrancando servidor de transcripción (Python)..."
python transcription_server.py &
PYTHON_PID=$!

# Esperar un momento para que el servidor Python inicie
sleep 2

# Verificar que el servidor Python arrancó
if ! kill -0 $PYTHON_PID 2>/dev/null; then
    echo "❌ Error: El servidor Python no pudo arrancar"
    echo "   Asegúrate de tener instaladas las dependencias: pip install flask basic-pitch soundfile"
    exit 1
fi

echo "✅ Servidor Python corriendo en http://localhost:5000"

# Arrancar Vite
echo "⚡ Arrancando Vite..."
npm run dev &
VITE_PID=$!

echo ""
echo "════════════════════════════════════════════════"
echo "  🎼 Whistle to Bach está listo!"
echo "  🌐 Frontend: http://localhost:5173"
echo "  🐍 Backend:  http://localhost:5000"
echo "  ⏹️  Presiona Ctrl+C para detener todo"
echo "════════════════════════════════════════════════"
echo ""

# Esperar a que termine cualquiera de los procesos
wait
