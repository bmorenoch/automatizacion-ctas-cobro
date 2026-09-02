@echo off
title Sistema Automatizado de Cuentas de Cobro Recurrentes
color 0b

echo ========================================================
echo    SISTEMA AUTOMATIZADO DE CUENTAS DE COBRO
echo ========================================================
echo.
echo Iniciando servidor y programador de cobros...
echo.

cd /d "%~dp0"
start http://localhost:3000
node server/server.js

pause
