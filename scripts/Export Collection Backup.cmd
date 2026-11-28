@echo off
python "%~dp0offline_collection_server.py" --data "%~dp0data" --web "%~dp0web" --export
if errorlevel 1 pause
