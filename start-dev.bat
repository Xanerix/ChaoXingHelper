@echo off
cd /d "%~dp0"
start "log-collector" cmd /k npm run log
rem --force: GM bridge key is hashed from the UserScript header, but prebundled deps are served immutable;
rem without re-optimizing, the browser keeps a cached client with the old key after header changes
start "vite-dev" cmd /k npm run dev -- --force
