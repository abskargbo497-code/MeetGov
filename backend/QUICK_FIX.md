# 🚨 QUICK FIX: Backend Crash

## The Problem
The backend is crashing because the **`.env` file is missing**.

## Solution (Choose One)

### Option 1: Quick Setup Script (Recommended)
```powershell
cd MeetGov/backend
node create-env.js
```
Follow the prompts to create your `.env` file.

### Option 2: Manual Setup

1. **Create `.env` file** in `MeetGov/backend/` directory with this content:

```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=meet_gov

JWT_SECRET=change-this-to-random-string-32-chars-minimum
JWT_REFRESH_SECRET=change-this-to-another-random-string-32-chars-minimum
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

OPENAI_API_KEY=
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=noreply@meetgov.com

FRONTEND_URL=http://localhost:5173

ADMIN_EMAIL=admin@meetgov.com
ADMIN_PASSWORD=Admin@123
```

2. **Replace `YOUR_MYSQL_PASSWORD`** with your actual MySQL root password

3. **Generate JWT secrets** (run this twice):
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

4. **Create database** (if it doesn't exist):
```sql
mysql -u root -p
CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

5. **Sync database tables:**
```powershell
cd MeetGov/backend
npm run db:sync
```

6. **Start the server:**
```powershell
npm run dev
```

## Verify It Works

Open another terminal:
```powershell
curl http://localhost:3000/health
```

Should return: `{"status":"ok","timestamp":"..."}`

## Still Crashing?

1. Check MySQL is running
2. Verify DB_PASSWORD in `.env` is correct
3. Make sure database `meet_gov` exists
4. Check console for specific error messages

