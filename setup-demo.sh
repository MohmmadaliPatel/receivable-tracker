#!/bin/bash
echo "Setting up Email Auto in Demo Mode..."

# Create .env file
cat > .env << EOL
# Demo Mode Configuration
DEMO_MODE=true

# Next.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=demo_secret_key_for_development_only

# Database Configuration
DATABASE_URL="file:./dev.db"
EOL

echo "✅ .env file created for demo mode"
echo "🚀 Starting the application..."
echo ""
echo "To login:"
echo "1. Open http://localhost:3000"
echo "2. Click 'Show Demo Login'"
echo "3. Enter any email/password (e.g., demo@example.com / demo123)"
echo ""
echo "The app will start in demo mode with mock email data!"
