# Database Schema

This directory contains the database schema and migration files for the Digital Meeting Assistant application.

## Database

The backend application uses **MySQL with Sequelize ORM** for data storage. The SQL schema files in this directory define the database structure.

## Files

- `schema.sql` - Complete database schema with table definitions
- `seed.sql` - Sample data for testing and development
- `migrations/` - Database migration files

## Schema Overview

### Users
- Stores user accounts with authentication information
- Roles: admin, official, secretary
- Fields: id (INT AUTO_INCREMENT), name, email, password_hash, role, department

### Meetings
- Stores meeting information
- Fields: id (INT AUTO_INCREMENT), title, description, datetime, location, organizer_id (FK), qr_code_token, status

### Attendance
- Tracks meeting attendance
- Fields: id (INT AUTO_INCREMENT), meeting_id (FK), user_id (FK), timestamp, location, check_in_method, status
- Unique constraint on (meeting_id, user_id) to prevent duplicate attendance

### Tasks
- Manages action items and tasks
- Fields: id (INT AUTO_INCREMENT), meeting_id (FK), assigned_to (FK), assigned_by (FK), title, description, deadline, status, priority

### Transcripts
- Stores meeting transcripts and generated minutes
- Fields: id (INT AUTO_INCREMENT), meeting_id (FK, unique), raw_text, summary_text, action_items_json (JSON), minutes_formatted, processing_status

## Setup

### 1. Create Database

```bash
mysql -u root -p
CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### 2. Run Schema

**Option A: Run SQL file directly**
```bash
mysql -u root -p meet_gov < schema.sql
```

**Option B: Use Sequelize sync (Development only)**
```javascript
// In your code, use syncDatabase() from connection.js
// WARNING: This will drop existing tables in development
```

**Option C: Run migrations**
```bash
mysql -u root -p meet_gov < migrations/001_initial_schema.sql
mysql -u root -p meet_gov < migrations/002_add_indexes.sql
```

### 3. Seed Data (Optional)

```bash
mysql -u root -p meet_gov < seed.sql
```

## Sequelize Models

The Sequelize models are defined in:
- `backend/src/models/User.js`
- `backend/src/models/Meeting.js`
- `backend/src/models/Attendance.js`
- `backend/src/models/Task.js`
- `backend/src/models/Transcript.js`

These models match the SQL schema and use Sequelize ORM for database operations.

## Key Features

- **Auto-increment IDs**: All tables use INTEGER AUTO_INCREMENT primary keys
- **Foreign Keys**: Proper referential integrity with CASCADE deletes
- **Indexes**: Optimized indexes for common queries
- **ENUM Types**: Status and role fields use MySQL ENUM
- **JSON Support**: action_items_json uses MySQL JSON type
- **UTF8MB4**: Full Unicode support for international characters

## Table Relationships

- Users (1) → (N) Meetings (organizer)
- Users (1) → (N) Attendance
- Users (1) → (N) Tasks (assigned_to)
- Users (1) → (N) Tasks (assigned_by)
- Meetings (1) → (N) Attendance
- Meetings (1) → (N) Tasks
- Meetings (1) → (1) Transcripts

## Migration Notes

If migrating from MongoDB:
- ObjectIds are replaced with INTEGER auto-increment IDs
- References use foreign keys instead of ObjectId references
- Queries use Sequelize instead of Mongoose
- See `backend/MYSQL_MIGRATION.md` for details
