@echo off
echo Setting up Email Auto in Demo Mode...

REM Create .env file
(
echo # Demo Mode Configuration
echo DEMO_MODE=true
echo.
echo # Next.js Configuration
echo NEXTAUTH_URL=http://localhost:3000
echo NEXTAUTH_SECRET=demo_secret_key_for_development_only
echo.
echo # Database Configuration
echo DATABASE_URL="file:./dev.db"
) > .env

echo ✅ .env file created for demo mode
echo 🚀 Starting the application...
echo.
echo To login:
echo 1. Open http://localhost:3000
echo 2. Click 'Show Demo Login'
echo 3. Enter any email/password (e.g., demo@example.com / demo123)
echo.
echo The app will start in demo mode with mock email data!
echo.
pause
