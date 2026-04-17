@echo off
title FlowState Intelligence Worker
echo [System] Initializing Background Intelligence Cluster...
echo [System] Environment: Windows Stable Mode
echo [System] Worker Count: 1
echo.
echo ! IMPORTANT: If you see "Select" in the title bar, your worker is PAUSED.
echo ! Press ESC or Enter to resume if this happens.
echo.
python manage.py qcluster
pause
