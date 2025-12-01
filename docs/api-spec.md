# API Specification

## Base URL
```
http://localhost:3000/api
```

## Authentication

Most endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

## Endpoints

### Authentication (`/api/auth`)

#### Register User
```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "password123",
  "role": "official",
  "department": "IT Department"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "official",
      "department": "IT Department"
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

#### Login
```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "official"
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

#### Refresh Token
```http
POST /api/auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "new_jwt_access_token"
  }
}
```

#### Get Current User
```http
GET /api/auth/me
```

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "official"
    }
  }
}
```

### Meetings (`/api/meetings`)

#### Create Meeting
```http
POST /api/meetings
```

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "title": "Weekly Team Meeting",
  "description": "Regular weekly sync",
  "datetime": "2024-01-15T10:00:00Z",
  "location": "Conference Room A"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Meeting created successfully",
  "data": {
    "meeting": {
      "id": "meeting_id",
      "title": "Weekly Team Meeting",
      "datetime": "2024-01-15T10:00:00Z",
      "qr_code_token": "qr_token_string",
      "qr_code_url": "data:image/png;base64,..."
    },
    "qrCodeUrl": "data:image/png;base64,..."
  }
}
```

#### Get All Meetings
```http
GET /api/meetings?status=scheduled&organizer_id=user_id
```

**Query Parameters:**
- `status` (optional): Filter by status (scheduled, in-progress, completed, cancelled)
- `organizer_id` (optional): Filter by organizer

**Response (200):**
```json
{
  "success": true,
  "data": {
    "meetings": [
      {
        "id": "meeting_id",
        "title": "Weekly Team Meeting",
        "datetime": "2024-01-15T10:00:00Z",
        "organizer_id": {
          "id": "user_id",
          "name": "John Doe",
          "email": "john.doe@example.com"
        }
      }
    ]
  }
}
```

#### Get Meeting by ID
```http
GET /api/meetings/:id
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "meeting": {
      "id": "meeting_id",
      "title": "Weekly Team Meeting",
      "datetime": "2024-01-15T10:00:00Z",
      "location": "Conference Room A",
      "organizer_id": {
        "id": "user_id",
        "name": "John Doe"
      },
      "qr_code_token": "qr_token_string"
    }
  }
}
```

#### Get Meeting QR Code
```http
GET /api/meetings/:id/qr
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "qrCodeUrl": "data:image/png;base64,...",
    "qrToken": "qr_token_string"
  }
}
```

#### Log Attendance
```http
POST /api/meetings/:id/attendance
```

**Request Body:**
```json
{
  "qrToken": "qr_token_string",
  "location": "Conference Room A"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Attendance logged successfully",
  "data": {
    "attendance": {
      "id": "attendance_id",
      "meeting_id": "meeting_id",
      "user_id": "user_id",
      "timestamp": "2024-01-15T10:00:00Z",
      "status": "present"
    }
  }
}
```

#### Get Attendance List
```http
GET /api/meetings/:id/attendance
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "attendance": [
      {
        "id": "attendance_id",
        "user_id": {
          "id": "user_id",
          "name": "John Doe",
          "email": "john.doe@example.com"
        },
        "timestamp": "2024-01-15T10:00:00Z",
        "status": "present"
      }
    ]
  }
}
```

#### Update Meeting
```http
PUT /api/meetings/:id
```

**Request Body:**
```json
{
  "title": "Updated Meeting Title",
  "status": "in-progress"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Meeting updated successfully",
  "data": {
    "meeting": { ... }
  }
}
```

### Transcription (`/api/transcription`)

#### Upload Audio and Transcribe
```http
POST /api/transcription/upload/:meetingId
Content-Type: multipart/form-data
```

**Form Data:**
- `audio`: Audio file (mp3, wav, m4a, webm)

**Response (200):**
```json
{
  "success": true,
  "message": "Audio transcribed successfully",
  "data": {
    "transcript": {
      "id": "transcript_id",
      "meeting_id": "meeting_id",
      "raw_text": "Full transcript text...",
      "processing_status": "completed"
    }
  }
}
```

#### Generate Meeting Minutes
```http
POST /api/transcription/generate-minutes/:meetingId
```

**Response (200):**
```json
{
  "success": true,
  "message": "Meeting minutes generated successfully",
  "data": {
    "transcript": {
      "id": "transcript_id",
      "summary": "Meeting summary...",
      "actionItems": [
        {
          "title": "Task title",
          "description": "Task description",
          "assigned_to": "John Doe",
          "suggested_deadline": "2024-02-01"
        }
      ],
      "minutes": "Formatted meeting minutes..."
    }
  }
}
```

#### Get Transcript
```http
GET /api/transcription/:meetingId
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transcript": {
      "id": "transcript_id",
      "meeting_id": "meeting_id",
      "raw_text": "Full transcript...",
      "summary_text": "Summary...",
      "action_items_json": [...],
      "minutes_formatted": "Formatted minutes..."
    }
  }
}
```

### Tasks (`/api/tasks`)

#### Create Task
```http
POST /api/tasks
```

**Request Body:**
```json
{
  "meeting_id": "meeting_id",
  "assigned_to": "user_id",
  "title": "Complete project proposal",
  "description": "Draft the proposal document",
  "deadline": "2024-02-01T17:00:00Z",
  "priority": "high"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Task created successfully",
  "data": {
    "task": {
      "id": "task_id",
      "title": "Complete project proposal",
      "deadline": "2024-02-01T17:00:00Z",
      "status": "pending",
      "priority": "high"
    }
  }
}
```

#### Get All Tasks
```http
GET /api/tasks?status=pending&assigned_to=user_id&overdue=true
```

**Query Parameters:**
- `status` (optional): Filter by status
- `assigned_to` (optional): Filter by assigned user
- `meeting_id` (optional): Filter by meeting
- `overdue` (optional): true to get overdue tasks

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "task_id",
        "title": "Complete project proposal",
        "deadline": "2024-02-01T17:00:00Z",
        "status": "pending",
        "assigned_to": {
          "id": "user_id",
          "name": "John Doe"
        }
      }
    ]
  }
}
```

#### Get Task by ID
```http
GET /api/tasks/:id
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "task": { ... }
  }
}
```

#### Update Task
```http
PUT /api/tasks/:id
```

**Request Body:**
```json
{
  "status": "completed",
  "title": "Updated title"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Task updated successfully",
  "data": {
    "task": { ... }
  }
}
```

#### Send Task Reminder
```http
POST /api/tasks/:id/reminder
```

**Response (200):**
```json
{
  "success": true,
  "message": "Reminder sent successfully"
}
```

#### Delete Task
```http
DELETE /api/tasks/:id
```

**Response (200):**
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

### Analytics (`/api/analytics`)

#### Get Attendance Statistics
```http
GET /api/analytics/attendance?userId=user_id&startDate=2024-01-01&endDate=2024-01-31
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 50,
      "present": 40,
      "late": 8,
      "absent": 2
    },
    "byUser": [...],
    "byMeeting": [...],
    "attendance": [...]
  }
}
```

#### Get Task Statistics
```http
GET /api/analytics/tasks?assigned_to=user_id&overdue=true
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 25,
      "pending": 10,
      "inProgress": 5,
      "completed": 8,
      "overdue": 2
    },
    "byUser": [...],
    "byPriority": {
      "low": 5,
      "medium": 15,
      "high": 5
    },
    "tasks": [...]
  }
}
```

#### Get Overdue Tasks
```http
GET /api/analytics/overdue-tasks
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "count": 5,
    "tasks": [...]
  }
}
```

#### Get Department Performance
```http
GET /api/analytics/department-performance
```

**Requires:** Admin role

**Response (200):**
```json
{
  "success": true,
  "data": {
    "attendance": [
      {
        "department": "IT Department",
        "totalMeetings": 10,
        "totalAttendance": 50,
        "present": 45,
        "late": 5,
        "attendanceRate": 100
      }
    ],
    "tasks": [
      {
        "department": "IT Department",
        "totalTasks": 20,
        "completed": 15,
        "overdue": 2,
        "completionRate": 75
      }
    ]
  }
}
```

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error message",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (missing/invalid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `500`: Internal Server Error
