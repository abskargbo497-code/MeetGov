# MeetGov Backend API Documentation

Complete API endpoint documentation for the MeetGov Digital Meeting Assistant backend.

**Base URL:** `http://localhost:3000/api`

**Authentication:** Most endpoints require JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## Table of Contents

1. [Authentication Endpoints](#authentication-endpoints)
2. [Meeting Management](#meeting-management)
3. [Audio Upload & Transcription](#audio-upload--transcription)
4. [Summarization & Minutes](#summarization--minutes)
5. [Tasks](#tasks)
6. [Analytics](#analytics)

---

## Authentication Endpoints

### POST /api/auth/register
Register a new user.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "official",
  "department": "IT"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "official"
    },
    "accessToken": "jwt_token_here",
    "refreshToken": "refresh_token_here"
  }
}
```

### POST /api/auth/login
Login user.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {...},
    "accessToken": "jwt_token_here",
    "refreshToken": "refresh_token_here"
  }
}
```

---

## Meeting Management

### POST /api/meetings
Create a new meeting.

**Request Body:**
```json
{
  "title": "Team Sync Meeting",
  "datetime": "2024-12-20T14:00:00Z",
  "location": "Conference Room A",
  "description": "Weekly team synchronization",
  "participants": ["user@example.com", "user2@example.com"]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Meeting created successfully",
  "data": {
    "meeting": {
      "id": 1,
      "title": "Team Sync Meeting",
      "datetime": "2024-12-20T14:00:00.000Z",
      "location": "Conference Room A",
      "description": "Weekly team synchronization",
      "participants": ["user@example.com"],
      "organizer_id": 1,
      "qr_code_token": "token_here",
      "qr_code_url": "data:image/png;base64,...",
      "status": "scheduled"
    },
    "qrCodeUrl": "data:image/png;base64,..."
  }
}
```

### GET /api/meetings
Get all meetings with optional filters.

**Query Parameters:**
- `status` (optional): Filter by status (scheduled, in-progress, completed, cancelled)
- `organizer_id` (optional): Filter by organizer ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "meetings": [
      {
        "id": 1,
        "title": "Team Sync Meeting",
        "datetime": "2024-12-20T14:00:00.000Z",
        "location": "Conference Room A",
        "status": "scheduled",
        "organizer": {
          "id": 1,
          "name": "John Doe",
          "email": "john@example.com"
        }
      }
    ]
  }
}
```

### GET /api/meetings/:id
Get a specific meeting by ID.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "meeting": {
      "id": 1,
      "title": "Team Sync Meeting",
      "datetime": "2024-12-20T14:00:00.000Z",
      "location": "Conference Room A",
      "participants": ["user@example.com"],
      "audio_file_path": "uploads/audio/meeting-1/audio-1234567890.mp3",
      "transcript": {...}
    }
  }
}
```

### PUT /api/meetings/:id
Update meeting details.

**Request Body:**
```json
{
  "title": "Updated Meeting Title",
  "datetime": "2024-12-21T14:00:00Z",
  "location": "New Location",
  "description": "Updated description",
  "status": "in-progress",
  "participants": ["user@example.com", "user2@example.com"]
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Meeting updated successfully",
  "data": {
    "meeting": {...}
  }
}
```

### DELETE /api/meetings/:id
Delete a meeting.

**Response (200):**
```json
{
  "success": true,
  "message": "Meeting deleted successfully",
  "data": {
    "meetingId": 1
  }
}
```

---

## Audio Upload & Transcription

### POST /api/meetings/:id/audio
Upload audio file for a meeting (saves to disk).

**Request:** `multipart/form-data`
- Field name: `audio`
- File types: `.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`, `.aac`
- Max size: 100MB

**Response (200):**
```json
{
  "success": true,
  "message": "Audio file uploaded successfully",
  "data": {
    "meeting": {
      "id": 1,
      "audio_file_path": "uploads/audio/meeting-1/audio-1234567890.mp3",
      "audio_file_name": "audio-1234567890.mp3",
      "audio_file_size": 5242880
    }
  }
}
```

### POST /api/meetings/:id/transcribe
Transcribe the uploaded audio file using OpenAI Whisper.

**Response (200):**
```json
{
  "success": true,
  "message": "Audio transcribed successfully",
  "data": {
    "transcript": {
      "id": 1,
      "meeting_id": 1,
      "raw_text": "This is the transcribed text from the audio file...",
      "processing_status": "completed"
    }
  }
}
```

### GET /api/meetings/:id/transcript
Get the raw transcript for a meeting.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transcript": {
      "id": 1,
      "meeting_id": 1,
      "raw_text": "Full transcript text here...",
      "processing_status": "completed",
      "created_at": "2024-12-20T14:00:00.000Z",
      "updated_at": "2024-12-20T14:05:00.000Z"
    }
  }
}
```

### POST /api/transcription/upload/:meetingId
Upload and immediately transcribe audio (uses memory storage).

**Request:** `multipart/form-data`
- Field name: `audio`

**Response (200):**
```json
{
  "success": true,
  "message": "Audio transcribed successfully",
  "data": {
    "transcript": {
      "id": 1,
      "meeting_id": 1,
      "raw_text": "Transcribed text...",
      "processing_status": "completed"
    }
  }
}
```

---

## Summarization & Minutes

### POST /api/meetings/:id/summarize
Generate structured summary and meeting minutes using GPT-4o-mini.

**Response (200):**
```json
{
  "success": true,
  "message": "Meeting summary generated successfully",
  "data": {
    "summary": {
      "abstract": "Brief 2-3 sentence overview of the meeting",
      "key_points": [
        "Key discussion point 1",
        "Key discussion point 2"
      ],
      "decisions": [
        "Decision made during meeting"
      ],
      "action_items": [
        {
          "title": "Action item title",
          "description": "Detailed description",
          "assigned_to": "John Doe",
          "deadline": "2024-12-25"
        }
      ]
    },
    "minutes": "# MEETING MINUTES\n\n**Title:** ..."
  }
}
```

### GET /api/meetings/:id/summary
Get the generated summary and minutes for a meeting.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "abstract": "Brief summary",
      "key_points": [...],
      "decisions": [...],
      "action_items": [...]
    },
    "minutes": "Formatted meeting minutes markdown",
    "transcript_id": 1
  }
}
```

---

## Tasks

### POST /api/tasks
Create a new task.

**Request Body:**
```json
{
  "title": "Complete project documentation",
  "description": "Write comprehensive documentation",
  "meeting_id": 1,
  "assigned_to": 2,
  "priority": "high",
  "deadline": "2024-12-25T00:00:00Z"
}
```

### GET /api/tasks
Get all tasks with optional filters.

### PUT /api/tasks/:id
Update a task.

### DELETE /api/tasks/:id
Delete a task (admin only).

---

## Analytics

### GET /api/analytics/attendance
Get attendance statistics.

### GET /api/analytics/tasks
Get task statistics.

### GET /api/analytics/overdue-tasks
Get overdue tasks.

### GET /api/analytics/department-performance
Get department performance metrics (admin only).

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "success": false,
  "message": "Error message here",
  "errors": [...] // Optional validation errors
}
```

**Common HTTP Status Codes:**
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## Example Usage with cURL

### Create Meeting
```bash
curl -X POST http://localhost:3000/api/meetings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team Meeting",
    "datetime": "2024-12-20T14:00:00Z",
    "location": "Conference Room A",
    "participants": ["user@example.com"]
  }'
```

### Upload Audio
```bash
curl -X POST http://localhost:3000/api/meetings/1/audio \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "audio=@meeting-recording.mp3"
```

### Transcribe Audio
```bash
curl -X POST http://localhost:3000/api/meetings/1/transcribe \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Generate Summary
```bash
curl -X POST http://localhost:3000/api/meetings/1/summarize \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Summary
```bash
curl -X GET http://localhost:3000/api/meetings/1/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Notes

- All datetime values should be in ISO 8601 format (UTC)
- File uploads use `multipart/form-data`
- Audio files are stored in `uploads/audio/meeting-{id}/` directory
- Transcription uses OpenAI Whisper API
- Summarization uses GPT-4o-mini for cost-effective processing
- Maximum audio file size: 100MB
- Supported audio formats: MP3, WAV, M4A, WebM, OGG, AAC

