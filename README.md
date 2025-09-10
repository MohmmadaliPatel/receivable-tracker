# Email Auto - Outlook Email Manager with Delta Sync

A Next.js application that fetches emails from Outlook using Microsoft Graph API with OAuth authentication, stores them in SQLite database with Prisma ORM, and provides delta sync functionality to resume from the last processed email.

## Features

- 🔐 **Flexible Authentication**: Microsoft OAuth or demo mode for testing
- 🔄 **Delta Sync**: Resume email fetching from where you left off
- 📅 **Advanced Filtering**: Filter by date range and specific senders
- 💾 **Local Storage**: Store emails in SQLite database per user
- 🎨 **Modern UI**: Clean interface with authentication and sync status
- 📊 **Sync Tracking**: Monitor sync progress and reset when needed
- 🔄 **Incremental Updates**: Only fetch new or changed emails
- 👤 **User Isolation**: Each user sees only their own emails
- 🎭 **Demo Mode**: Test the application without Azure AD setup

## Prerequisites

- Node.js 18+
- Azure AD account with app registration (optional for demo mode)
- Outlook account access

## Quick Start (Demo Mode)

If you want to test the application without setting up Azure AD:

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Set up demo environment:**
```bash
cp sample-env.txt .env
# The sample file already has DEMO_MODE=true
```

3. **Start the application:**
```bash
npm run dev
```

4. **Login with demo credentials:**
   - Click "Show Demo Login"
   - Use any email/password combination
   - Example: `demo@example.com` / `demo123`

## Setup Instructions

### 1. Azure AD App Registration (Multi-Tenant Setup)

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Enter app name (e.g., "Email Auto App")
5. **Important**: Set **Supported account types** to:
   - "Accounts in any organizational directory (Any Azure AD directory - Multitenant)"
   - OR "Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)"
6. Add redirect URI: `http://localhost:3000/api/auth/callback/azure-ad` (for local development)
7. Click **Register**

**Note**: For general Microsoft login (any Microsoft account), you must choose multi-tenant account types. Single-tenant will only work for users in your organization.

### 2. Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Add these **delegated permissions** (not application permissions):
   - `Mail.Read` - Read mail in user mailboxes
   - `Mail.ReadWrite` - Read and write mail in user mailboxes
   - `User.Read` - Sign in and read user profile
   - `offline_access` - Maintain access to data you have given it access to

### 3. Get Application Credentials

1. Go to **Certificates & secrets**
2. Create a **New client secret**
3. Copy the **Value** (not the Secret ID)
4. Note your **Application (client) ID** and **Directory (tenant) ID**

### 4. Environment Setup

**For Demo Mode (No Azure AD Required):**
```bash
# Create a .env file with this content:
DEMO_MODE=true
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=demo_secret_key_for_development_only
DATABASE_URL="file:./dev.db"
```

**For Production (Azure AD Required):**

Create a `.env` file in the project root with the following content:

```env
# Demo Mode (set to false for production)
DEMO_MODE=false

# Azure AD Configuration (required for production)
AZURE_CLIENT_ID=your_client_id_here
AZURE_CLIENT_SECRET=your_client_secret_here
AZURE_TENANT_ID=common

# Next.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret_here

# Database
DATABASE_URL="file:./dev.db"
```

Replace the placeholder values with your actual Azure AD credentials.

**Note:** The `NEXTAUTH_SECRET` is optional for development but recommended for production. NextAuth.js will generate one automatically if not provided, but you can generate a secure random string using:
```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5. Install Dependencies

```bash
npm install
```

### 6. Database Setup

```bash
# Generate Prisma client and create database
npx prisma migrate dev --name init
```

### 7. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Authentication

**Option 1: Demo Mode (No Setup Required)**
1. Click **"Show Demo Login"** to reveal the demo login form
2. Enter any email and password combination
3. Example: `demo@example.com` / `demo123`
4. You'll be logged in instantly with demo credentials

**Option 2: Microsoft OAuth (Azure AD Setup Required)**
1. Click **"Sign in with Microsoft"** to authenticate with your Microsoft account
2. Grant the requested permissions for email access
3. You'll be redirected back to the application with your session active

## Demo Mode

If you don't want to set up Azure AD, you can use **Demo Mode** which provides:

- ✅ **No Azure AD setup required**
- ✅ **Local authentication** with any email/password
- ✅ **Full application functionality**
- ✅ **Database storage** for emails
- ✅ **Delta sync simulation**

### To Enable Demo Mode:

1. **Create `.env` file** in your project root with:
```env
DEMO_MODE=true
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=demo_secret_key_for_development_only
DATABASE_URL="file:./dev.db"
```

2. **Restart your application**

3. **Login with demo credentials:**
   - Click "Show Demo Login"
   - Use any email/password combination
   - Example: `demo@example.com` / `demo123`

### Switching from Demo to Production:

1. Set up Azure AD app registration (see setup instructions above)
2. Update your `.env` file:
```env
DEMO_MODE=false
AZURE_CLIENT_ID=your_real_client_id
AZURE_CLIENT_SECRET=your_real_client_secret
```

3. Restart the application

### Sync Status

The header shows your current sync status:
- **Ready**: Sync is idle and ready to fetch new emails
- **Syncing**: Currently fetching emails from Outlook
- **Error**: Last sync attempt failed (check error message)

### Fetching Emails from Outlook

1. **Date Filtering**: Set from/to dates to limit the email fetch range (optional)
2. **Sender Filtering**: Enter comma-separated email addresses to fetch only from specific senders (optional)
3. **Limit**: Set the maximum number of emails to fetch per batch (default: 100)
4. Click **"Fetch Emails from Outlook"** to retrieve and store emails

### Delta Sync

The application uses Microsoft Graph's delta sync functionality:
- **First Sync**: Fetches all emails matching your criteria
- **Subsequent Syncs**: Only fetches new or changed emails since last sync
- **Resume Capability**: If sync is interrupted, it resumes from the last processed email
- **Reset Sync**: Use the "Reset Sync" button to start fresh if needed

### Viewing Stored Emails

- **Filter by Date**: Use the date pickers to filter stored emails by received date
- **Filter by Sender**: Enter a sender email to search emails from that sender
- **Pagination**: Navigate through pages of emails
- **Email Details**: View subject, sender, preview, and metadata for each email

## API Endpoints

All API endpoints require authentication and only return data for the authenticated user.

### GET /api/emails
Retrieve stored emails with optional filtering.

**Query Parameters:**
- `limit` (number): Number of emails per page (default: 50)
- `offset` (number): Pagination offset (default: 0)
- `fromDate` (string): ISO date string for filtering from date
- `toDate` (string): ISO date string for filtering to date
- `sender` (string): Filter by sender email

### POST /api/emails
Fetch emails from Outlook using delta sync and store them in the database.

**Request Body:**
```json
{
  "fromDate": "2024-01-01T00:00:00.000Z",
  "toDate": "2024-12-31T23:59:59.999Z",
  "senders": ["user@example.com", "admin@example.com"],
  "limit": 100
}
```

### GET /api/emails/sync
Get the current sync status for the authenticated user.

### POST /api/emails/sync
Reset the sync state for the authenticated user (clears delta token and sync history).

## Database Schema

The application uses SQLite with the following models:

### User Model (NextAuth.js)
- `id`: Unique identifier
- `name`: Display name
- `email`: Email address (unique)
- `emailVerified`: Email verification timestamp
- `image`: Profile image URL

### Account Model (NextAuth.js)
- `id`: Unique identifier
- `userId`: Reference to User
- `type`: Account type
- `provider`: OAuth provider
- `providerAccountId`: Provider account ID
- `refresh_token`: OAuth refresh token
- `access_token`: OAuth access token
- `expires_at`: Token expiration
- `token_type`: Token type
- `scope`: Token scope
- `id_token`: ID token
- `session_state`: Session state

### Session Model (NextAuth.js)
- `id`: Unique identifier
- `sessionToken`: Session token
- `userId`: Reference to User
- `expires`: Session expiration

### Email Model
- `id`: Unique identifier
- `messageId`: Outlook message ID (unique)
- `subject`: Email subject
- `sender`: Sender email address
- `senderName`: Sender display name
- `recipients`: JSON string of recipients
- `body`: Full email body
- `bodyPreview`: Email preview text
- `receivedAt`: Date received
- `isRead`: Read status
- `hasAttachments`: Attachment indicator
- `attachments`: JSON string of attachment info
- `userId`: Reference to User (for data isolation)
- `createdAt`: Record creation timestamp
- `updatedAt`: Record update timestamp

### EmailSync Model (Delta Tracking)
- `id`: Unique identifier
- `userId`: Reference to User (unique per user)
- `lastSyncToken`: Microsoft Graph delta token
- `lastSyncDate`: Last successful sync timestamp
- `totalEmailsSynced`: Total emails synced for user
- `status`: Sync status (idle, syncing, error, paused)
- `errorMessage`: Last error message
- `createdAt`: Record creation timestamp
- `updatedAt`: Record update timestamp

## Technologies Used

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite with Prisma ORM
- **Authentication**: NextAuth.js with Microsoft OAuth
- **Email API**: Microsoft Graph SDK with Delta Sync
- **Session Management**: NextAuth.js with database sessions

## Troubleshooting

### Authentication Issues
- **"Page not found" after login**: Fixed - removed custom page redirects from NextAuth config
- **Demo login not working**: Ensure `DEMO_MODE=true` in your `.env` file and restart the application
- **"Application not found in directory"**: This means your Client ID is not registered in your Azure AD tenant. Either:
  - Register the app in your Azure AD tenant (see setup instructions above)
  - Or use demo mode: set `DEMO_MODE=true` in your `.env` file
- **"AADSTS700016" error**: Same as above - application not found in your tenant
- **"AADSTS90112" error**: Application identifier is not a valid GUID format - use a proper GUID from Azure AD
- **Azure AD login not working**: Ensure your Azure AD app has the correct **delegated permissions** (not application permissions)
- **Single-tenant vs Multi-tenant**: If you want general Microsoft login, make sure your app is configured as **multi-tenant** (see setup step 5)
- **Redirect URI mismatch**: Verify your redirect URI in Azure AD matches `http://localhost:3000/api/auth/callback/azure-ad`
- **Invalid credentials**: Double-check your AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (ensure these are from your Azure AD app registration)
- **Permission denied**: Make sure you've granted consent for the required scopes during login
- **Demo mode not showing**: Refresh the page after changing `DEMO_MODE` in your `.env`

### Sync and Delta Issues
- **Sync not working**: Check the sync status in the header - it might show an error message
- **Reset sync**: Use the "Reset Sync" button to clear the delta token and start fresh
- **No new emails**: Delta sync only fetches new/changed emails; use "Reset Sync" for a full refresh
- **Sync stuck**: Check browser console for errors and try resetting the sync

### Database Issues
- **Migration failed**: Run `npx prisma migrate reset` to reset the database
- **Data not showing**: Ensure you're logged in with the correct Microsoft account
- **Corrupted database**: Delete `prisma/dev.db` and run `npx prisma migrate dev --name init`

### Email Fetching Issues
- **No emails found**: Check your date filters and sender filters
- **Access denied**: Ensure your Microsoft account has access to the Outlook mailbox
- **Rate limiting**: Microsoft Graph has rate limits; wait a few minutes between sync attempts
- **Large mailbox**: Try using more specific filters to reduce the number of emails to sync

## Development

### Adding New Features
- Update the Prisma schema in `prisma/schema.prisma`
- Run `npx prisma migrate dev --name your_migration_name`
- Add new API endpoints in `src/app/api/`
- Update the UI components in `src/components/`

### Testing
- Use the built-in Next.js development server
- Check browser console for errors
- Verify API responses in browser dev tools

## License

This project is licensed under the MIT License.