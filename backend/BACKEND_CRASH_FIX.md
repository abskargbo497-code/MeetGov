# Backend Crash Fix Guide

## Common Causes and Solutions

### 1. ❌ Missing .env File

**Error:** App crashes immediately on startup

**Solution:**
1. Copy the `.env.example` file to `.env`:
   ```powershell
   cd MeetGov/backend
   copy .env.example .env
   ```

2. Edit `.env` and fill in your actual values:
   - `DB_PASSWORD`: Your MySQL root password
   - `JWT_SECRET`: Generate a random string (see below)
   - `JWT_REFRESH_SECRET`: Generate another random string
   - `OPENAI_API_KEY`: Your OpenAI API key (optional for basic functionality)
   - `EMAIL_USER` and `EMAIL_PASSWORD`: For email features (optional)

3. Generate JWT secrets:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

### 2. ❌ Database Connection Error

**Error:** `Unable to connect to MySQL database`

**Solution:**
1. Make sure MySQL is running:
   ```powershell
   # Check if MySQL service is running
   Get-Service MySQL*
   ```

2. Verify database exists:
   ```sql
   mysql -u root -p
   SHOW DATABASES;
   ```

3. Create database if it doesn't exist:
   ```sql
   CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   EXIT;
   ```

4. Check `.env` file has correct credentials:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_actual_password
   DB_NAME=meet_gov
   ```

### 3. ❌ Missing Dependencies

**Error:** `Cannot find module 'xxx'`

**Solution:**
```powershell
cd MeetGov/backend
npm install
```

### 4. ❌ Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3000`

**Solution:**
1. Find process using port 3000:
   ```powershell
   netstat -ano | findstr :3000
   ```

2. Kill the process or change PORT in `.env`:
   ```env
   PORT=3001
   ```

### 5. ❌ Missing Database Tables

**Error:** `Table 'meet_gov.users' doesn't exist`

**Solution:**
```powershell
cd MeetGov/backend
npm run db:sync
```

## Quick Setup Steps

1. **Create .env file:**
   ```powershell
   cd MeetGov/backend
   copy .env.example .env
   # Edit .env with your actual values
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Create database:**
   ```sql
   mysql -u root -p
   CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   EXIT;
   ```

4. **Sync database tables:**
   ```powershell
   npm run db:sync
   ```

5. **Start server:**
   ```powershell
   npm run dev
   ```

## Verify Server is Running

1. Check health endpoint:
   ```powershell
   curl http://localhost:3000/health
   ```

2. Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "2024-12-20T12:00:00.000Z"
   }
   ```

## Still Having Issues?

1. Check the console output for specific error messages
2. Verify all environment variables are set correctly
3. Make sure MySQL is running and accessible
4. Check that port 3000 is not already in use
5. Ensure all dependencies are installed (`npm install`)

