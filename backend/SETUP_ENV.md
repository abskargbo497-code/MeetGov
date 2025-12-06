# Backend Environment Setup

## ⚠️ CRITICAL: Create .env File

The backend **requires** a `.env` file to run. Without it, the app will crash.

## Quick Setup

1. **Navigate to backend directory:**
   ```powershell
   cd MeetGov/backend
   ```

2. **Create .env file** (copy this content into a new file named `.env`):

```env
# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD_HERE
DB_NAME=meet_gov

# JWT Configuration (Generate random strings)
JWT_SECRET=change-this-to-a-random-string-at-least-32-characters-long
JWT_REFRESH_SECRET=change-this-to-another-random-string-at-least-32-characters-long
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI API (Optional - for transcription features)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Email Configuration (Optional - for sending emails)
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@meetgov.com

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Admin Seeding (Super Admin account)
ADMIN_EMAIL=admin@meetgov.com
ADMIN_PASSWORD=Admin@123
```

3. **IMPORTANT: Replace these values:**
   - `DB_PASSWORD`: Your actual MySQL root password
   - `JWT_SECRET`: Generate a random string (see below)
   - `JWT_REFRESH_SECRET`: Generate another random string

4. **Generate JWT Secrets:**
   ```powershell
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```
   Run this twice to get two different secrets.

## Database Setup

1. **Make sure MySQL is running**

2. **Create the database:**
   ```sql
   mysql -u root -p
   CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   EXIT;
   ```

3. **Sync database tables:**
   ```powershell
   cd MeetGov/backend
   npm run db:sync
   ```

## Start the Server

After creating `.env` file:

```powershell
cd MeetGov/backend
npm install  # If you haven't already
npm run dev
```

## Verify It's Working

Open another terminal and test:
```powershell
curl http://localhost:3000/health
```

You should see:
```json
{"status":"ok","timestamp":"..."}
```

## Common Issues

- **"Cannot connect to database"**: Check MySQL is running and DB_PASSWORD is correct
- **"Port 3000 already in use"**: Change PORT in .env or kill the process using port 3000
- **"Module not found"**: Run `npm install`

