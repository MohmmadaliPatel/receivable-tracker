@echo off
@REM call npm i -g yarn
call npm install
call npm migrate
call npm generate
call npm seed

REM Check if .env.production exists
IF EXIST ".env.production" (
  REM Check if SERVER_URL already exists in the file
  findstr /C:"SERVER_URL=" .env.production >nul
  IF ERRORLEVEL 1 (
    echo SERVER_URL="https://notice-tracker.taxteck.in" >> .env.production
    echo Added SERVER_URL to existing .env.production file.
  ) ELSE (
    echo SERVER_URL already exists in .env.production
  )
) ELSE (
  REM Create new .env.production with SERVER_URL
  echo SERVER_URL="https://notice-tracker.taxteck.in" > .env.production
  echo Created new .env.production file.
)