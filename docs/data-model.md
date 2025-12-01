# Data Model Documentation

## Overview

The Digital Meeting Assistant uses MySQL with Sequelize ORM. This document describes the data models, their relationships, and structure.

## Entity Relationship Diagram

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│   User   │────────<│ Meeting  │────────>│Transcript│
└──────────┘         └──────────┘         └──────────┘
     │                     │                     │
     │                     │                     │
     │                     │                     │
     │                     ▼                     │
     │              ┌──────────┐                │
     │              │Attendance│                │
     │              └──────────┘                │
     │                     │                     │
     │                     │                     │
     ▼                     ▼                     │
┌──────────┐         ┌──────────┐                │
│   Task   │<────────│ Meeting  │───────────────┘
└──────────┘         └──────────┘
```

## Models

### User Model

**Table:** `users`

**Schema:**
```javascript
{
  id: INTEGER (AUTO_INCREMENT, PRIMARY KEY),
  name: STRING (required),
  email: STRING (required, unique),
  password_hash: STRING (required, minlength: 6),
  role: ENUM ['admin', 'official', 'secretary'] (default: 'official'),
  department: STRING,
  createdAt: DATE (default: NOW),
  updatedAt: DATE (default: NOW)
}
```

**Indexes:**
- `email`: Unique index
- `role`: Index for role-based queries

**Relationships:**
- One-to-Many with Meetings (as organizer)
- One-to-Many with Attendance
- One-to-Many with Tasks (as assigned_to)
- One-to-Many with Tasks (as assigned_by)

**Methods:**
- `comparePassword(candidatePassword)`: Compare password with hash
- `toJSON()`: Remove password_hash from JSON output

### Meeting Model

**Table:** `meetings`

**Schema:**
```javascript
{
  id: INTEGER (AUTO_INCREMENT, PRIMARY KEY),
  title: STRING (required),
  description: TEXT,
  datetime: DATE (required),
  location: STRING,
  organizer_id: INTEGER (FK to users.id, required),
  qr_code_token: STRING (unique),
  qr_code_url: TEXT,
  status: ENUM ['scheduled', 'in-progress', 'completed', 'cancelled'] (default: 'scheduled'),
  transcript_id: INTEGER (FK to transcripts.id),
  createdAt: DATE (default: NOW),
  updatedAt: DATE (default: NOW)
}
```

**Indexes:**
- `organizer_id`: Index for organizer queries
- `datetime`: Index for date-based queries
- `status`: Index for status filtering
- `qr_code_token`: Unique index

**Relationships:**
- Many-to-One with User (organizer)
- One-to-One with Transcript
- One-to-Many with Attendance
- One-to-Many with Tasks

**Associations:**
- `organizer`: Belongs to User
- `transcript`: Belongs to Transcript

### Attendance Model

**Collection:** `attendance`

**Schema:**
```javascript
{
  meeting_id: ObjectId (ref: 'Meeting', required),
  user_id: ObjectId (ref: 'User', required),
  timestamp: Date (default: Date.now),
  location: String,
  check_in_method: Enum ['qr', 'manual'] (default: 'qr'),
  status: Enum ['present', 'late', 'absent'] (default: 'present'),
  createdAt: Date (default: Date.now)
}
```

**Indexes:**
- `meeting_id`: Index for meeting queries
- `user_id`: Index for user queries
- `timestamp`: Index for time-based queries
- Compound unique: `(meeting_id, user_id)` - prevents duplicate attendance

**Relationships:**
- Many-to-One with Meeting
- Many-to-One with User

**Constraints:**
- Unique constraint on (meeting_id, user_id) prevents duplicate attendance records

### Task Model

**Collection:** `tasks`

**Schema:**
```javascript
{
  meeting_id: ObjectId (ref: 'Meeting', required),
  assigned_to: ObjectId (ref: 'User', required),
  assigned_by: ObjectId (ref: 'User'),
  title: String (required),
  description: String,
  deadline: Date (required),
  status: Enum ['pending', 'in-progress', 'completed', 'overdue', 'cancelled'] (default: 'pending'),
  priority: Enum ['low', 'medium', 'high'] (default: 'medium'),
  reminder_sent: Boolean (default: false),
  completed_at: Date,
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `meeting_id`: Index for meeting queries
- `assigned_to`: Index for user task queries
- `deadline`: Index for deadline queries
- `status`: Index for status filtering

**Relationships:**
- Many-to-One with Meeting
- Many-to-One with User (assigned_to)
- Many-to-One with User (assigned_by)

**Hooks:**
- Pre-save hook: Auto-updates status to 'overdue' if deadline passed and status is 'pending'

### Transcript Model

**Collection:** `transcripts`

**Schema:**
```javascript
{
  meeting_id: ObjectId (ref: 'Meeting', required, unique),
  raw_text: String (required),
  summary_text: String,
  action_items_json: Mixed (default: []),
  minutes_formatted: String,
  audio_file_url: String,
  processing_status: Enum ['pending', 'processing', 'completed', 'failed'] (default: 'pending'),
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Indexes:**
- `meeting_id`: Unique index (one transcript per meeting)
- `processing_status`: Index for status queries

**Relationships:**
- One-to-One with Meeting

**Data Types:**
- `action_items_json`: JSON array of action items with structure:
  ```json
  [
    {
      "title": "String",
      "description": "String",
      "assigned_to": "String",
      "suggested_deadline": "Date String"
    }
  ]
  ```

## Class Diagram

```
┌─────────────────────────────────────────────────────────┐
│                         User                             │
├─────────────────────────────────────────────────────────┤
│ - _id: ObjectId                                         │
│ - name: String                                         │
│ - email: String                                         │
│ - password_hash: String                                 │
│ - role: Enum                                            │
│ - department: String                                    │
│ - createdAt: Date                                      │
│ - updatedAt: Date                                      │
├─────────────────────────────────────────────────────────┤
│ + comparePassword(candidatePassword): Boolean           │
│ + toJSON(): Object                                      │
└─────────────────────────────────────────────────────────┘
           │                    │
           │                    │
           │                    │
           ▼                    ▼
┌──────────────────┐   ┌──────────────────┐
│     Meeting      │   │      Task        │
├──────────────────┤   ├──────────────────┤
│ - _id: ObjectId  │   │ - _id: ObjectId  │
│ - title: String  │   │ - title: String  │
│ - datetime: Date │   │ - deadline: Date│
│ - organizer_id   │   │ - assigned_to    │
│ - qr_code_token  │   │ - status: Enum   │
│ - status: Enum   │   │ - priority: Enum │
└──────────────────┘   └──────────────────┘
           │                    │
           │                    │
           ▼                    │
┌──────────────────┐            │
│   Attendance     │            │
├──────────────────┤            │
│ - _id: ObjectId  │            │
│ - meeting_id     │            │
│ - user_id        │            │
│ - timestamp: Date│            │
│ - status: Enum   │            │
└──────────────────┘            │
           │                    │
           │                    │
           ▼                    │
┌──────────────────┐            │
│   Transcript     │            │
├──────────────────┤            │
│ - _id: ObjectId  │            │
│ - meeting_id     │            │
│ - raw_text       │            │
│ - summary_text   │            │
│ - action_items   │────────────┘
└──────────────────┘
```

## Relationships Summary

### One-to-Many Relationships

1. **User → Meetings**
   - One user can organize many meetings
   - Foreign key: `meetings.organizer_id`

2. **User → Attendance**
   - One user can have many attendance records
   - Foreign key: `attendance.user_id`

3. **User → Tasks (assigned_to)**
   - One user can be assigned many tasks
   - Foreign key: `tasks.assigned_to`

4. **User → Tasks (assigned_by)**
   - One user can assign many tasks
   - Foreign key: `tasks.assigned_by`

5. **Meeting → Attendance**
   - One meeting can have many attendance records
   - Foreign key: `attendance.meeting_id`

6. **Meeting → Tasks**
   - One meeting can have many tasks
   - Foreign key: `tasks.meeting_id`

### One-to-One Relationships

1. **Meeting ↔ Transcript**
   - One meeting has one transcript
   - Foreign key: `meetings.transcript_id` and `transcripts.meeting_id` (unique)

## Data Validation

### User
- Email must be valid format
- Password minimum 6 characters
- Role must be one of: admin, official, secretary

### Meeting
- Title required
- Datetime required and must be valid date
- Organizer must exist

### Attendance
- Meeting must exist
- User must exist
- Unique constraint on (meeting_id, user_id)

### Task
- Title required
- Deadline required and must be valid date
- Assigned user must exist
- Meeting must exist

### Transcript
- Meeting must exist
- Raw text required
- Unique constraint on meeting_id

## Indexes Strategy

### Performance Indexes

1. **User.email**: Unique index for fast login lookups
2. **Meeting.organizer_id**: Index for user's meetings queries
3. **Meeting.datetime**: Index for date range queries
4. **Attendance(meeting_id, user_id)**: Compound unique index
5. **Task.assigned_to**: Index for user's tasks queries
6. **Task.deadline**: Index for overdue task queries
7. **Task.status**: Index for status filtering

### Query Patterns

**Common Queries:**
- Find user by email (login)
- Find meetings by organizer
- Find upcoming meetings (datetime > now)
- Find attendance by meeting
- Find tasks by assigned user
- Find overdue tasks (deadline < now AND status != completed)
- Find transcript by meeting

## Data Flow

### Creation Flow
1. User created → Password hashed
2. Meeting created → QR token generated
3. Attendance logged → Timestamp recorded
4. Task created → Linked to meeting and user
5. Transcript created → Linked to meeting

### Update Flow
1. User updates → Password re-hashed if changed
2. Meeting updates → Status can change workflow
3. Task updates → Status auto-updates to overdue if deadline passed
4. Transcript updates → Processing status tracks workflow

### Deletion Flow
- Cascade deletes: Deleting a meeting deletes related attendance and tasks
- Soft deletes: Consider adding `deletedAt` field for soft deletion

## MySQL Considerations

### Table Structure
- All tables use INTEGER AUTO_INCREMENT for primary keys
- Foreign keys use INTEGER references
- Proper referential integrity with CASCADE deletes
- Normalized relational structure

### Query Patterns
- Attendance statistics by meeting/user
- Task statistics by status/priority
- Department performance metrics
- JOIN queries for related data

### Scalability
- Indexes optimized for common queries
- Composite indexes for multi-field queries
- Foreign key indexes for join performance
- Connection pooling configured
