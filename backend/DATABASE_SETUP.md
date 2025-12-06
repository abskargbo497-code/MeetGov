# Database Setup Guide - MeetGov

This guide will help you set up the MySQL database and create all required tables for the MeetGov application.

## Prerequisites

- MySQL server installed and running
- Node.js and npm installed
- Environment variables configured in `.env` file

## Database Tables

The application requires the following tables:

1. **users** - User accounts and authentication
2. **meetings** - Meeting information
3. **tasks** - Task assignments and tracking
4. **attendance** - Meeting attendance records
5. **transcripts** - Meeting transcriptions
6. **analytics** - Analytics and statistics data

## Step 1: Configure Environment Variables

Create or update `backend/.env` file with your MySQL credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=meet_gov

# Other environment variables...
NODE_ENV=development
PORT=3000
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
```

## Step 2: Create the Database

Run the database creation script:

```bash
cd backend
node src/scripts/createDatabase.js
```

This will create the `meet_gov` database if it doesn't exist.

**Expected Output:**
```
Connecting to MySQL server...
✓ Connected to MySQL server
Creating database 'meet_gov' if it doesn't exist...
✓ Database 'meet_gov' is ready

✅ Database creation completed successfully!
```

## Step 3: Sync Database Tables

Run the database sync script to create all tables:

```bash
node src/scripts/syncDatabase.js
```

This will:
- Create all tables if they don't exist
- Update existing tables without dropping data (safe mode)
- Set up all foreign key relationships
- Create indexes

**Expected Output:**
```
Starting database synchronization...
✓ Database connection established
Using safe sync mode (alter: true) - existing data will be preserved
✓ Safe sync completed - tables updated without data loss

✓ Successfully synced 6 model(s):
  - users (User)
  - meetings (Meeting)
  - tasks (Task)
  - attendance (Attendance)
  - transcripts (Transcript)
  - analytics (Analytics)

✅ Database synchronization completed successfully!
```

### Force Sync (⚠️ DESTRUCTIVE!)

**WARNING:** This will **DROP ALL TABLES** and delete all data!

```bash
node src/scripts/syncDatabase.js --force
```

Only use this if you want to completely reset the database.

## Step 4: Verify Tables in MySQL

Connect to MySQL and verify tables exist:

```bash
mysql -u root -p
```

Then run:

```sql
USE meet_gov;

-- List all tables
SHOW TABLES;

-- Expected output:
-- +----------------------+
-- | Tables_in_meet_gov   |
-- +----------------------+
-- | analytics            |
-- | attendance           |
-- | meetings             |
-- | tasks                |
-- | transcripts          |
-- | users                |
-- +----------------------+

-- Check table structures
DESCRIBE users;
DESCRIBE meetings;
DESCRIBE tasks;
DESCRIBE attendance;
DESCRIBE transcripts;
DESCRIBE analytics;

-- Check indexes
SHOW INDEXES FROM users;
SHOW INDEXES FROM meetings;
SHOW INDEXES FROM tasks;
SHOW INDEXES FROM attendance;

-- Verify foreign keys
SELECT 
  TABLE_NAME,
  COLUMN_NAME,
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM
  INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE
  REFERENCED_TABLE_SCHEMA = 'meet_gov'
  AND REFERENCED_TABLE_NAME IS NOT NULL;
```

## Step 5: Test Database Connection

Start the backend server to verify the database connection:

```bash
npm run dev
```

**Expected Output:**
```
MySQL connection established successfully
Server running on http://0.0.0.0:3000
```

## Step 6: Test Login

Create a test user and test login:

### Option 1: Using API (Recommended)

```bash
# Register a new user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "role": "admin"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Option 2: Using MySQL (Direct Insert)

```sql
USE meet_gov;

-- Note: Password will be hashed by the model hook
-- This is just for testing - use API registration in production
INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
VALUES ('Admin User', 'admin@example.com', '$2a$10$placeholder_hash_here', 'admin', NOW(), NOW());
```

## Troubleshooting

### Error: "Table 'meet_gov.users' doesn't exist"

**Solution:** Run the sync script:
```bash
node src/scripts/syncDatabase.js
```

### Error: "Access denied for user"

**Solution:** Check your `.env` file credentials match your MySQL user permissions.

### Error: "Can't connect to MySQL server"

**Solution:**
1. Verify MySQL is running: `mysqladmin -u root -p ping`
2. Check DB_HOST and DB_PORT in `.env`
3. Verify firewall settings

### Error: "Database 'meet_gov' doesn't exist"

**Solution:** Run the create database script:
```bash
node src/scripts/createDatabase.js
```

### Foreign Key Constraint Errors

**Solution:** Ensure tables are created in the correct order. The sync script handles this automatically, but if manually creating, order matters:
1. users
2. meetings
3. tasks, attendance, transcripts
4. analytics

## Model Relationships

```
Users (1) ──< (many) Meetings (organizer_id)
Users (1) ──< (many) Tasks (assigned_to)
Users (1) ──< (many) Attendance (user_id)

Meetings (1) ──< (many) Tasks (meeting_id)
Meetings (1) ──< (many) Attendance (meeting_id)
Meetings (1) ──1 (one) Transcript (meeting_id)
Meetings (1) ──< (many) Analytics (meeting_id)
```

## Production Considerations

1. **Backup First:** Always backup your database before running sync
2. **Use Migrations:** For production, consider using Sequelize migrations instead of sync
3. **Environment Variables:** Use strong, unique passwords and secrets
4. **Database Permissions:** Use a dedicated database user with limited permissions
5. **Connection Pooling:** Already configured in `connection.js`

## Next Steps

After database setup:
1. ✅ Database tables created
2. ✅ Test login functionality
3. ✅ Create initial admin user (if needed)
4. ✅ Start frontend and test full application flow

## Additional Commands

### Check Table Row Counts
```sql
SELECT 
  'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'meetings', COUNT(*) FROM meetings
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL
SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL
SELECT 'transcripts', COUNT(*) FROM transcripts
UNION ALL
SELECT 'analytics', COUNT(*) FROM analytics;
```

### Check Recent Users
```sql
SELECT id, name, email, role, created_at 
FROM users 
ORDER BY created_at DESC 
LIMIT 10;
```

---

**Status:** ✅ Database setup complete when all tables are created and verified.

