# Digital Meeting Assistant - Backend

Backend API for the Digital Meeting Assistant application.

## Features

- **Authentication**: JWT-based authentication with role-based access control (admin, official, secretary)
- **Meetings**: Create meetings, generate QR codes, manage attendance
- **Transcription**: Upload audio files and transcribe using OpenAI Whisper API
- **Minutes Generation**: Automatically generate meeting minutes with summaries and action items
- **Tasks**: Manage action items with assignments, deadlines, and reminders
- **Analytics**: Track attendance statistics, task completion, and department performance

## Tech Stack

- Node.js with Express
- MySQL with Sequelize ORM
- JWT for authentication
- OpenAI API (Whisper for transcription, GPT-4 for summarization)
- QR Code generation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up MySQL database:
```bash
# Create database
mysql -u root -p
CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;

# Run schema (optional, Sequelize can auto-create tables)
mysql -u root -p meet_gov < ../database/schema.sql
```

3. Create a `.env` file (see `ENV_SETUP.md` for template):
```bash
# Copy template
cat ENV_SETUP.md
# Create .env with MySQL configuration
```

4. Update `.env` with your configuration:
   - MySQL connection details (host, port, user, password, database)
   - JWT secrets
   - OpenAI API key

5. Start the development server:
```bash
npm run dev
```

The server will run on `http://localhost:3000` by default.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Meetings
- `POST /api/meetings` - Create a new meeting
- `GET /api/meetings` - Get all meetings
- `GET /api/meetings/:id` - Get meeting by ID
- `GET /api/meetings/:id/qr` - Get meeting QR code
- `POST /api/meetings/:id/attendance` - Log attendance
- `GET /api/meetings/:id/attendance` - Get attendance list

### Transcription
- `POST /api/transcription/upload/:meetingId` - Upload and transcribe audio
- `POST /api/transcription/generate-minutes/:meetingId` - Generate meeting minutes
- `GET /api/transcription/:meetingId` - Get transcript

### Tasks
- `POST /api/tasks` - Create a new task
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/:id` - Get task by ID
- `PUT /api/tasks/:id` - Update task
- `POST /api/tasks/:id/reminder` - Send task reminder
- `DELETE /api/tasks/:id` - Delete task (admin only)

### Analytics
- `GET /api/analytics/attendance` - Get attendance statistics
- `GET /api/analytics/tasks` - Get task statistics
- `GET /api/analytics/overdue-tasks` - Get overdue tasks
- `GET /api/analytics/department-performance` - Get department performance (admin only)

## Project Structure

```
backend/
├── src/
│   ├── api/           # API route handlers
│   ├── models/        # Sequelize models
│   ├── database/      # Database connection
│   ├── services/      # Business logic services
│   ├── utils/         # Utility functions
│   ├── config.js      # Configuration
│   └── server.js      # Express server setup
├── package.json
└── ENV_SETUP.md       # Environment variables guide
```

## Development

- Use `npm run dev` for development with auto-reload (nodemon)
- Use `npm start` for production

## Environment Variables

See `ENV_SETUP.md` for all required environment variables.

## Database

The project uses MySQL with Sequelize ORM. The database schema is defined in `../database/schema.sql`.

For development, Sequelize can automatically create tables based on models. For production, use migrations or run the SQL schema manually.

## Migration from MongoDB

If you're migrating from MongoDB, see `MYSQL_MIGRATION.md` for details.
