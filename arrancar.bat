@echo off
REM ============================================================
REM  Pedilo - arranque
REM
REM  Hace las dos cosas de una: instala las dependencias (solo la
REM  primera vez, tarda unos minutos) y levanta la app.
REM
REM  Doble clic y listo. Cuando diga "Waiting on http://localhost:8081"
REM  apreta la tecla  w  para abrirla en el navegador.
REM ============================================================
cd /d "%~dp0"

if not exist "node_modules\" (
  echo.
  echo === Instalando dependencias, esto tarda unos minutos ===
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo *** Fallo npm install. Copiale el error a Claude. ***
    pause
    exit /b 1
  )
)

echo.
echo === Levantando Pedilo. Apreta  w  para abrir en el navegador ===
echo.
call npx expo start -c
pause
