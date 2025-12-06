# Quick Start - Database Setup

## Fast Setup (3 Steps)

### 1. Configure Environment
Create `backend/.env` file:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=meet_gov
```

### 2. Create Database & Tables
```bash
cd backend
npm run db:setup
```

This runs both:
- Creates the database
- Syncs all tables

### 3. Start Backend
```bash
npm run dev
```

## Individual Commands

```bash
# Create database only
npm run db:create

# Sync tables (safe - preserves data)
npm run db:sync

# Force sync (⚠️ DROPS ALL DATA!)
npm run db:sync:force
```

## Verify Setup

```bash
# In MySQL
mysql -u root -p
USE meet_gov;
SHOW TABLES;
```

Should show:
- analytics
- attendance
- meetings
- tasks
- transcripts
- users

## Test Login

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@test.com","password":"password123","role":"admin"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}'
```

---

For detailed instructions, see `DATABASE_SETUP.md`

