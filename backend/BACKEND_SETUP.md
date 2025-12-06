# MeetGov Backend Setup Guide

Quick setup guide for running the MeetGov backend API server.

---

## 🚀 Quick Start

### 1. Prerequisites

Install the following on your system:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **MySQL** (v8.0 or higher) - [Download](https://dev.mysql.com/downloads/)
- **OpenAI API Key** - [Get from OpenAI](https://platform.openai.com/)

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Database Setup

**Create the database:**
```bash
mysql -u root -p
```

```sql
CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

**Run schema (optional - Sequelize can auto-create):**
```bash
mysql -u root -p meet_gov < ../database/schema.sql
```

### 4. Environment Configuration

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=meet_gov

# JWT Configuration
JWT_SECRET=your_secret_key_change_in_production
JWT_REFRESH_SECRET=your_refresh_secret_key_change_in_production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI API (Required for transcription and summarization)
OPENAI_API_KEY=sk-your-openai-api-key-here
```

**Generate secure JWT secrets:**
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Using OpenSSL
openssl rand -hex 64
```

### 5. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

---

## ✅ Verification

### Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-20T12:00:00.000Z"
}
```

### Test Authentication
```bash
# Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123",
    "role": "secretary"
  }'
```

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── api/              # API route handlers
│   │   ├── auth.js       # Authentication endpoints
│   │   ├── meeting.js    # Meeting CRUD operations
│   │   ├── transcription.js  # Audio upload, transcription, summarization
│   │   ├── tasks.js      # Task management
│   │   └── analytics.js  # Analytics endpoints
│   ├── models/           # Sequelize database models
│   ├── services/         # Business logic services
│   │   ├── whisperService.js    # OpenAI Whisper integration
│   │   ├── minutesService.js    # GPT-4o-mini summarization
│   │   └── qrService.js         # QR code generation
│   ├── database/         # Database connection
│   ├── utils/            # Utility functions
│   │   ├── fileStorage.js      # File upload configuration
│   │   ├── jwt.js              # JWT helpers
│   │   └── helpers.js          # General helpers
│   ├── config.js         # Configuration
│   └── server.js         # Express server
├── uploads/              # Audio file storage (created automatically)
│   └── audio/
├── .env                  # Environment variables (create this)
├── package.json
└── README.md
```

---

## 🔑 API Endpoints

### Meeting Management
- `POST /api/meetings` - Create meeting
- `GET /api/meetings` - List meetings
- `GET /api/meetings/:id` - Get meeting
- `PUT /api/meetings/:id` - Update meeting
- `DELETE /api/meetings/:id` - Delete meeting

### Audio & Transcription
- `POST /api/meetings/:id/audio` - Upload audio file
- `POST /api/meetings/:id/transcribe` - Transcribe audio
- `GET /api/meetings/:id/transcript` - Get transcript

### Summarization
- `POST /api/meetings/:id/summarize` - Generate summary with GPT-4o-mini
- `GET /api/meetings/:id/summary` - Get summary and minutes

For complete API documentation, see `API_DOCUMENTATION.md`.

---

## 🐛 Troubleshooting

### Database Connection Error
- Verify MySQL is running: `mysql -u root -p`
- Check database credentials in `.env`
- Ensure database `meet_gov` exists

### OpenAI API Errors
- Verify `OPENAI_API_KEY` is set in `.env`
- Check API key is valid and has credits
- Review OpenAI API rate limits

### File Upload Errors
- Check `uploads/audio/` directory permissions
- Verify file size is under 100MB
- Ensure file format is supported (MP3, WAV, M4A, etc.)

### Port Already in Use
- Change `PORT` in `.env`
- Or kill process using port 3000:
  ```bash
  # Find process
  lsof -i :3000
  # Kill process
  kill -9 <PID>
  ```

---

## 📚 Additional Resources

- **API Documentation:** `API_DOCUMENTATION.md`
- **Implementation Summary:** `IMPLEMENTATION_SUMMARY.md`
- **Environment Setup:** `ENV_SETUP.md`
- **Database Schema:** `../database/schema.sql`

---

## 🎯 Next Steps

1. ✅ Backend is ready
2. ✅ Connect frontend to API endpoints
3. ✅ Test audio upload and transcription
4. ✅ Test summarization with GPT-4o-mini
5. ✅ Deploy to production

---

**Happy Coding! 🚀**

