# MeetGov - Digital Meeting Assistant Platform

<div align="center">

![MeetGov](https://img.shields.io/badge/MeetGov-Digital%20Meeting%20Assistant-2979FF?style=for-the-badge)
![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-v24.11.1-green?style=for-the-badge)
![React](https://img.shields.io/badge/React-18.2-blue?style=for-the-badge)

**A comprehensive platform for managing meetings, tracking attendance, generating transcripts, and automating meeting minutes with AI-powered summarization.**

[Features](#-key-features) • [Setup](#-setup-instructions) • [API Documentation](#-api-endpoints) • [Tech Stack](#-tech-stack)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Setup Instructions](#-setup-instructions)
- [Admin Credentials](#-admin-credentials)
- [API Endpoints](#-api-endpoints)
- [Usage Examples](#-usage-examples)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

MeetGov is a full-stack digital meeting assistant platform that automates meeting management, attendance tracking, transcription, and minutes generation. It leverages AI (OpenAI Whisper and GPT-4o-mini) to provide intelligent meeting summaries and action items.

---

## ✨ Key Features

### 🔐 Authentication & Authorization
- **Role-Based Access Control (RBAC)**
  - `super_admin` - Full system access
  - `secretary` - Meeting management and guest invitations
  - `official` - View meetings and scan QR codes
- JWT-based authentication with refresh tokens
- Secure password hashing with bcrypt
- Auto-seeded Super Admin on server startup

### 📅 Meeting Management
- Create, update, and delete meetings
- QR code generation for attendance
- Real-time attendance tracking
- Meeting status management (scheduled, in-progress, completed, etc.)
- Guest invitations via email (no account required)

### 🎤 Live Audio Transcription
- Real-time audio streaming
- OpenAI Whisper API integration
- Live transcript display
- Real-time AI summary generation
- Continuous key points and insights extraction

### 🤖 AI-Powered Features
- **Whisper AI** - Audio transcription (file upload & live streaming)
- **GPT-4o-mini** - Meeting summarization
  - Structured summaries (abstract, key points, decisions)
  - Action items extraction
  - Meeting minutes formatting
  - Sentiment analysis

### 📧 Email & Notifications
- Automated email delivery after meeting completion
- Guest invitation emails with unique access links
- Task assignment notifications
- Meeting reminders
- Bulk notifications

### 📊 Reports & Analytics
- PDF report generation for meetings
- Summary reports (multiple meetings)
- User-specific reports
- JSON format support
- Dashboard analytics
- Task analytics
- Attendance statistics

### ✅ Task Management
- Create and assign tasks
- Task status tracking
- Priority management
- Deadline tracking
- Task reminders

### 🔄 Real-Time Updates
- WebSocket integration (Socket.IO)
- Live attendance updates
- Real-time task status changes
- Live transcription updates
- Meeting status notifications

---

## 🛠 Tech Stack

### Backend
- **Runtime:** Node.js v24.11.1
- **Framework:** Express.js
- **Database:** MySQL 8.0+ with Sequelize ORM
- **Authentication:** JWT (jsonwebtoken)
- **AI Integration:**
  - OpenAI Whisper API (audio transcription)
  - OpenAI GPT-4o-mini (summarization & insights)
- **Real-Time:** Socket.IO
- **Email:** Nodemailer
- **PDF Generation:** PDFKit
- **File Upload:** Multer

### Frontend
- **Framework:** React 18.2
- **Build Tool:** Vite
- **Routing:** React Router DOM
- **HTTP Client:** Axios
- **Styling:** CSS with custom design system
- **Real-Time:** Socket.IO Client
- **QR Code:** html5-qrcode, qrcode.react
- **Charts:** Recharts

---

## 📁 Project Structure

```
MeetGov/
├── backend/                    # Backend API server
│   ├── src/
│   │   ├── api/               # API route handlers
│   │   │   ├── auth.js        # Authentication endpoints
│   │   │   ├── meeting.js     # Meeting management
│   │   │   ├── transcription.js # Audio transcription
│   │   │   ├── liveTranscription.js # Live transcription
│   │   │   ├── tasks.js       # Task management
│   │   │   ├── analytics.js   # Analytics endpoints
│   │   │   ├── notifications.js # Notifications API
│   │   │   └── reports.js     # Reports API (PDF/JSON)
│   │   ├── models/            # Sequelize database models
│   │   │   ├── User.js
│   │   │   ├── Meeting.js
│   │   │   ├── Attendance.js
│   │   │   ├── Task.js
│   │   │   ├── Transcript.js
│   │   │   ├── Analytics.js
│   │   │   ├── GuestInvite.js
│   │   │   └── index.js       # Model associations
│   │   ├── services/          # Business logic services
│   │   │   ├── whisperService.js    # OpenAI Whisper integration
│   │   │   ├── liveTranscriptionService.js # Live transcription
│   │   │   ├── minutesService.js    # GPT-4o-mini integration
│   │   │   ├── qrService.js         # QR code generation
│   │   │   ├── emailService.js      # Email sending (Nodemailer)
│   │   │   ├── notificationService.js # Notifications
│   │   │   ├── reportService.js    # PDF generation (PDFKit)
│   │   │   └── socketService.js     # WebSocket server
│   │   ├── database/          # Database configuration
│   │   │   └── connection.js
│   │   ├── utils/             # Utility functions
│   │   │   ├── jwt.js         # JWT helpers
│   │   │   ├── authorization.js # RBAC middleware
│   │   │   ├── logger.js      # Logging utilities
│   │   │   ├── helpers.js     # General helpers
│   │   │   └── fileStorage.js # File upload handling
│   │   ├── scripts/           # Utility scripts
│   │   │   ├── seedAdmin.js   # Admin seeding
│   │   │   ├── syncDatabase.js # Database sync
│   │   │   ├── createDatabase.js
│   │   │   └── testRegistration.js
│   │   ├── config.js          # Configuration
│   │   └── server.js          # Express server entry point
│   ├── package.json
│   ├── create-env.js          # Interactive .env setup
│   └── README.md
│
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── Navbar.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── MeetingCard.jsx
│   │   │   ├── TaskCard.jsx
│   │   │   ├── QRDisplay.jsx
│   │   │   ├── SummaryPanel.jsx
│   │   │   ├── LiveTranscript.jsx
│   │   │   ├── ThemeToggle.jsx
│   │   │   └── icons.jsx      # SVG icon components
│   │   ├── pages/             # Page components
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── MeetingCreation.jsx
│   │   │   ├── MeetingDetail.jsx
│   │   │   ├── MeetingList.jsx
│   │   │   ├── MeetingQR.jsx
│   │   │   ├── QRScanner.jsx
│   │   │   ├── Transcription.jsx
│   │   │   ├── TranscriptionViewer.jsx
│   │   │   ├── MinutesReview.jsx
│   │   │   ├── TaskList.jsx
│   │   │   ├── TaskCreation.jsx
│   │   │   ├── TaskDetail.jsx
│   │   │   ├── Analytics.jsx
│   │   │   └── NotFound.jsx
│   │   ├── context/           # React Context providers
│   │   │   ├── AuthContext.jsx
│   │   │   ├── MeetingContext.jsx
│   │   │   ├── SidebarContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   ├── hooks/             # Custom React hooks
│   │   │   ├── useAPI.js
│   │   │   ├── useSocket.js   # WebSocket hook
│   │   │   └── useUpload.js
│   │   ├── utils/             # Frontend utilities
│   │   │   └── api.js         # Axios API client
│   │   ├── App.jsx            # Main app component
│   │   ├── App.css            # Global app styles
│   │   ├── main.jsx           # Entry point
│   │   └── index.css          # Global styles
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
│
├── database/                   # Database schema and migrations
│   ├── schema.sql             # Complete database schema
│   ├── seed.sql               # Sample data
│   └── migrations/            # Database migration scripts
│       ├── 001_initial_schema.sql
│       └── 002_add_indexes.sql
│
├── docs/                       # Documentation
│   ├── api-spec.md            # Complete API documentation
│   ├── architecture.md        # System architecture
│   ├── data-model.md          # Database schema documentation
│   ├── ui-wireframes.md       # UI/UX designs
│   └── user-workflow.md       # User journey documentation
│
├── scripts/                    # Utility scripts
│   ├── start-dev.sh           # Start development servers
│   └── deploy.sh              # Deployment script
│
├── HACKATHON_IMPLEMENTATION_README.md # Hackathon implementation guide
└── README.md                   # This file
```

---

## 🚀 Setup Instructions

### Prerequisites

- **Node.js** v24.11.1 or higher - [Download](https://nodejs.org/)
- **MySQL** v8.0 or higher - [Download](https://dev.mysql.com/downloads/)
- **OpenAI API Key** - [Get from OpenAI](https://platform.openai.com/)
- **Git** - For version control
- **npm** - Package manager

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd MeetGov
```

### Step 2: Database Setup

1. **Start MySQL service**

```bash
# Windows
net start MySQL80

# macOS (Homebrew)
brew services start mysql

# Linux (systemd)
sudo systemctl start mysql
```

2. **Create the database**

```bash
mysql -u root -p
```

```sql
CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### Step 3: Backend Setup

1. **Navigate to backend directory**

```bash
cd backend
```

2. **Install dependencies**

```bash
npm install
```

3. **Create `.env` file**

**Option A: Use interactive setup script (Recommended)**
```bash
node create-env.js
```

**Option B: Create manually**

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-password
DB_NAME=meet_gov

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Admin Seeding
ADMIN_EMAIL=admin@meetgov.com
ADMIN_PASSWORD=Admin@123

# OpenAI API (for Whisper & GPT-4o-mini)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Email Configuration (Optional - for notifications)
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@meetgov.com
```

**Generate secure JWT secrets:**

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run this twice to generate both `JWT_SECRET` and `JWT_REFRESH_SECRET`.

4. **Setup database tables**

```bash
npm run db:sync
```

This will:
- Create all database tables
- Seed the Super Admin user (if not exists)

5. **Start the backend server**

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The backend will run on `http://localhost:3000`

**Verify:** Visit `http://localhost:3000/health` - should return `{"status":"ok","timestamp":"..."}`

### Step 4: Frontend Setup

1. **Open a new terminal and navigate to frontend directory**

```bash
cd frontend
```

2. **Install dependencies**

```bash
npm install
```

3. **Create `.env` file (optional)**

Create a `.env` file in the `frontend` directory:

```env
VITE_API_URL=http://localhost:3000/api
```

4. **Start the frontend development server**

```bash
npm run dev
```

The frontend will run on `http://localhost:5173` (or another port if 5173 is in use)

### ✅ Verification

1. **Backend Health Check**: Visit `http://localhost:3000/health`
   - Should return: `{"status":"ok","timestamp":"..."}`

2. **Frontend**: Visit `http://localhost:5173`
   - Should show the login page

3. **Database Connection**: Check backend logs for successful database connection

---

## 👤 Admin Credentials

**Default Super Admin Account:**
- **Email:** `admin@meetgov.com`
- **Password:** `Admin@123`

**Note:** The Super Admin is automatically created on server startup if it doesn't exist. You can change these credentials by setting `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your `.env` file.

**⚠️ Security:** Change the default password after first login, especially in production!

---

## 📡 API Endpoints

### Base URL
```
http://localhost:3000/api
```

### Authentication Headers
Most endpoints require authentication:
```
Authorization: Bearer <access_token>
```

### Endpoints Overview

#### 🔐 Authentication (`/api/auth`)
- `POST /api/auth/register` - Register new user (official/secretary only)
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info

#### 📅 Meetings (`/api/meetings`)
- `POST /api/meetings` - Create new meeting (admin/secretary only)
- `GET /api/meetings` - Get all meetings (role-filtered)
- `GET /api/meetings/:id` - Get meeting by ID
- `PATCH /api/meetings/:id` - Update meeting
- `DELETE /api/meetings/:id` - Delete meeting
- `GET /api/meetings/:id/qr` - Get meeting QR code
- `POST /api/meetings/:id/attendance` - Log attendance
- `GET /api/meetings/:id/attendance` - Get attendance list
- `PATCH /api/meetings/:id/status` - Update meeting status
- `POST /api/meetings/:id/invite-guest` - Invite guest via email
- `GET /api/meetings/:id/guests` - Get guest list

#### 🎤 Transcription (`/api/meetings/:id` or `/api/transcription`)
- `POST /api/meetings/:id/transcribe` - Upload audio and transcribe
- `GET /api/meetings/:id/transcript` - Get transcript
- `POST /api/meetings/:id/summarize` - Generate AI summary (GPT-4o-mini)
- `GET /api/meetings/:id/summary` - Get meeting summary

#### 🔴 Live Transcription (`/api/meetings/:id`)
- `POST /api/meetings/:id/live-audio` - Stream live audio
- `POST /api/meetings/:id/live-transcription/start` - Start live transcription
- `POST /api/meetings/:id/live-transcription/stop` - Stop live transcription
- `POST /api/meetings/:id/live-transcription/chunk` - Send audio chunk

#### ✅ Tasks (`/api/tasks`)
- `POST /api/tasks` - Create task
- `GET /api/tasks` - Get all tasks (with filters)
- `GET /api/tasks/:id` - Get task by ID
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/reminder` - Send task reminder

#### 🔔 Notifications (`/api/notifications`)
- `POST /api/notifications/send` - Send custom notification
- `POST /api/notifications/task/:id/reminder` - Send task reminder
- `POST /api/notifications/meeting/:id/reminder` - Send meeting reminder
- `GET /api/notifications/history` - Get notification history
- `POST /api/notifications/bulk` - Send bulk notifications

#### 📊 Reports (`/api/reports`)
- `GET /api/reports/meeting/:id?format=pdf|json` - Generate meeting report
- `GET /api/reports/meetings?format=pdf|json` - Generate summary report
- `GET /api/reports/user/:id` - Generate user report

#### 📈 Analytics (`/api/analytics`)
- `GET /api/analytics/dashboard` - Get dashboard analytics
- `GET /api/analytics/meetings` - Get meeting analytics
- `GET /api/analytics/tasks` - Get task analytics

### Example API Requests

#### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "official",
    "department": "IT"
  }'
```

#### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@meetgov.com",
    "password": "Admin@123"
  }'
```

#### Create Meeting
```bash
curl -X POST http://localhost:3000/api/meetings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "title": "Team Meeting",
    "description": "Weekly team sync",
    "datetime": "2024-12-20T10:00:00Z",
    "location": "Conference Room A"
  }'
```

For complete API documentation, see [`docs/api-spec.md`](docs/api-spec.md).

---

## 💡 Usage Examples

### Typical Workflow

1. **Login/Register**
   - Login with admin credentials: `admin@meetgov.com` / `Admin@123`
   - Or register as Official/Secretary

2. **Create a Meeting**
   - Navigate to "Create Meeting"
   - Fill in meeting details (title, date, time, location)
   - Add participants and guest emails
   - System generates a unique QR code

3. **Share QR Code**
   - Display QR code at the meeting venue
   - Attendees scan with their mobile devices
   - Attendance is automatically logged in real-time

4. **Live Transcription (During Meeting)**
   - Start live transcription for in-progress meetings
   - Real-time transcript appears on screen
   - AI generates live summaries and key points

5. **Upload Audio (Post-Meeting)**
   - After the meeting, upload the audio recording
   - System transcribes using OpenAI Whisper
   - Review and edit transcript if needed

6. **Generate Minutes**
   - Click "Generate Minutes"
   - AI (GPT-4o-mini) creates structured summary with:
     - Abstract
     - Key points
     - Decisions made
     - Action items
   - Review and approve the generated minutes

7. **Manage Tasks**
   - Action items from minutes are converted to tasks
   - Assign tasks to team members
   - Track progress and deadlines
   - Send reminders

8. **Generate Reports**
   - Generate PDF or JSON reports for meetings
   - View analytics and statistics
   - Export meeting summaries

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Write meaningful commit messages
- Add comments for complex logic
- Update documentation as needed
- Test your changes thoroughly

---

## 📄 License

This project is licensed under the **ISC License**.

```
ISC License

Copyright (c) 2024 MeetGov Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## 🙏 Acknowledgments

- **OpenAI** - For Whisper and GPT-4o-mini APIs
- **React Community** - For excellent documentation and tools
- **Express.js** - For the robust web framework
- **All Contributors** - Thank you for your contributions!

---

## 📞 Support

For questions, issues, or suggestions:

- Check the [Documentation](docs/)
- Review [Hackathon Implementation Guide](HACKATHON_IMPLEMENTATION_README.md)
- Open an issue on GitHub

---

<div align="center">

**Built with ❤️ for efficient meeting management**

[⬆ Back to Top](#meetgov---digital-meeting-assistant-platform)

</div>
