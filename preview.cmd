@echo off
rem Double-click to preview the site from this folder (on this PC and on phones in the same Wi-Fi).
cd /d "%~dp0"
python tools\preview.py
pause
