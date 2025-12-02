MASTER PROMPT (CURSOR AI PROJECT BOOTSTRAP)
You are my development assistant.
Create and initialize a full-stack project called “digital-meeting-assistant” with the architecture and folder structure below.
Use this exact structure and generate starter boilerplate in all files.
▶ 1. Project Structure
Create the following folder and file structure:
digital-meeting-assistant/
│
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── auth.js
│   │   │   ├── meeting.js
│   │   │   ├── transcription.js
│   │   │   ├── tasks.js
│   │   │   └── analytics.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Meeting.js
│   │   │   ├── Attendance.js
│   │   │   └── Task.js
│   │   ├── services/
│   │   │   ├── qrService.js
│   │   │   ├── whisperService.js
│   │   │   ├── minutesService.js
│   │   │   └── notificationService.js
│   │   ├── utils/
│   │   │   ├── jwt.js
│   │   │   ├── logger.js
│   │   │   └── helpers.js
│   │   ├── server.js
│   │   └── config.js
│   ├── package.json
│   ├── README.md
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
│
├── database/
│   ├── schema.sql
│   ├── migrations/
│   └── seed.sql
│
├── docs/
│   ├── architecture.md
│   ├── api-spec.md
│   ├── ui-wireframes.md
│   ├── data-model.md
│   └── user-workflow.md
│
├── scripts/
│   ├── deploy.sh
│   └── start-dev.sh
│
├── .gitignore
├── README.md
└── CONTRIBUTING.md
▶ 2. Backend Requirements
Use Node.js (Express).
Generate boilerplate for:
(1) Authentication API (JWT)
register user
login
refresh token
role-based access (admin, official, secretary)
(2) Meeting API
create meeting
generate dynamic QR
fetch meetings
log attendance
(3) Transcription API
endpoint to upload audio
call Whisper API
save transcript
(4) Minutes Generator
summarize transcript
extract action items
format into structured meeting minutes
(5) Tasks / Action Items
assign to user
deadlines
status update
reminders
(6) Analytics
attendance stats
overdue action items
department performance trends
Also generate:
Express app setup
MongoDB connection using Mongoose
Folder-based routing
Error handling middleware
▶ 3. Frontend Requirements
Use React + Vite.
Generate boilerplate for:
Pages
Login
Dashboard
Meeting Creation
QR Scanner (camera access)
Live Transcription Viewer
Minutes Review Page
Task List Page
Components
Navbar
Sidebar
MeetingCard
TaskCard
QRDisplay
SummaryPanel
Context
AuthContext
MeetingContext
Hooks
useAuth
useAPI
useUpload
Make all pages connect to backend placeholder endpoints.
▶ 4. Database Schema
Fill database/schema.sql with models for:
Users
id, name, email, password_hash, role
Meetings
id, title, datetime, organizer_id, qr_code_token
Attendance
id, meeting_id, user_id, timestamp, location
Tasks
id, meeting_id, assigned_to, title, deadline, status
Transcript
id, meeting_id, raw_text, summary_text, action_items_json
▶ 5. Documentation
Fill each docs file:
architecture.md
full system architecture
module interactions
api-spec.md
list of all backend routes
request/response examples
ui-wireframes.md
describe layout for all pages
data-model.md
class diagrams
relationships
user-workflow.md
full workflow from attendance → transcription → minutes → tasks
▶ 6. Add Git Workflow Guides
Create CONTRIBUTING.md with:
Branch naming:
- feature/*
- fix/*
- hotfix/*
- chore/*

Main branches:
- main
- dev

Workflow:
1. Create feature branch
2. Commit changes
3. Push branch
4. Open Pull Request
5. Review
6. Merge into dev
▶ 7. Additional Instructions
Auto-generate example environment variables in .env.example
Add simple logging
Add CORS config
Add error handler middleware
Add basic frontend routing using React Router
▶ 8. After Generating the Project
Cursor must also:
✔ Initialize a Git repository
✔ Create the project README
✔ Provide commands to run frontend and backend
✔ Suggest next steps