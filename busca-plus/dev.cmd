@echo off
setlocal
cd /d "%~dp0"

call npm run infra:up
if errorlevel 1 exit /b %errorlevel%

if /I "%1"=="--init" (
  call npm run init
  if errorlevel 1 exit /b %errorlevel%
)

if /I not "%1"=="--init" if /I not "%2"=="--init" (
  call npm run init
  if errorlevel 1 exit /b %errorlevel%
)

if /I "%1"=="--all" (
  call npm run dev:all
) else if /I "%2"=="--all" (
  call npm run dev:all
) else (
  call npm run dev
)
