# Digital Meeting Assistant

A comprehensive full-stack application for managing meetings, tracking attendance, transcribing audio, generating meeting minutes, and managing action items.

## Features

- 🔐 **Authentication**: JWT-based authentication with role-based access control
- 📅 **Meeting Management**: Create meetings, generate QR codes, track attendance
- 📷 **QR Code Scanner**: Camera-based attendance check-in
- 🎤 **Audio Transcription**: Upload audio files and transcribe using OpenAI Whisper
- 📝 **Minutes Generation**: Automatically generate meeting minutes with summaries and action items
- ✅ **Task Management**: Create and manage action items with deadlines and priorities
- 📊 **Analytics**: Track attendance statistics, task completion, and department performance

## Tech Stack

### Frontend
- React 18
- Vite
- React Router
- Axios
- HTML5 QR Code Scanner

### Backend
- Node.js
- Express.js
- MySQL with Sequelize ORM
- JWT Authentication
- OpenAI API (Whisper & GPT-4)

## Project Structure

```
digital-meeting-assistant/
├── backend/          # Express.js API server
│   ├── src/
│   │   ├── api/     # API route handlers
│   │   ├── models/  # Mongoose models
│   │   ├── services/# Business logic services
│   │   ├── utils/   # Utility functions
│   │   ├── config.js
│   │   └── server.js
│   └── package.json
├── frontend/         # React application
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── hooks/
│   │   └── utils/
│   └── package.json
├── database/         # Database schemas and migrations
├── docs/             # Documentation
└── scripts/          # Deployment and utility scripts
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MySQL (v8.0 or higher)
- OpenAI API key (for transcription and summarization)
- npm or yarn

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd digital-meeting-assistant
```

2. **Install backend dependencies:**
```bash
cd backend
npm install
```

3. **Install frontend dependencies:**
```bash
cd ../frontend
npm install
```

### Configuration

1. **Backend Environment Variables:**

Create a `.env` file in the `backend` directory:

```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-password
DB_NAME=meet_gov

JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

OPENAI_API_KEY=your-openai-api-key-here
```

2. **Frontend Environment Variables (Optional):**

Create a `.env` file in the `frontend` directory:

```env
VITE_API_URL=http://localhost:3000/api
```

### Running the Application

#### Development Mode

1. **Start MySQL:**
```bash
# macOS (Homebrew)
brew services start mysql

# Linux
sudo systemctl start mysql

# Windows
# Start MySQL from Services
```

2. **Create database:**
```bash
mysql -u root -p
CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

3. **Start the backend server:**
```bash
cd backend
npm run dev
```

The backend will run on `http://localhost:3000`

4. **Start the frontend development server:**
```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:5173`

#### Production Mode

1. **Build the frontend:**
```bash
cd frontend
npm run build
```

2. **Start the backend:**
```bash
cd backend
npm start
```

## Usage

### Initial Setup

1. Register a new user account (or use the seed data)
2. Login with your credentials
3. Create your first meeting
4. Share the QR code with attendees
5. Upload audio after the meeting
6. Generate meeting minutes
7. Review and manage action items

### User Roles

- **Admin**: Full access to all features
- **Secretary**: Can create meetings, upload transcriptions, generate minutes
- **Official**: Can view meetings, check in, manage assigned tasks

## API Documentation

See [docs/api-spec.md](./docs/api-spec.md) for complete API documentation.

## Documentation

- [Architecture](./docs/architecture.md) - System architecture and design
- [API Specification](./docs/api-spec.md) - Complete API reference
- [UI Wireframes](./docs/ui-wireframes.md) - User interface designs
- [Data Model](./docs/data-model.md) - Database schema and relationships
- [User Workflow](./docs/user-workflow.md) - Complete user workflows
- [Contributing](./CONTRIBUTING.md) - Contribution guidelines

## Development

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Code Style

The project uses ESLint for code linting. Run:

```bash
# Backend
cd backend
npm run lint

# Frontend
cd frontend
npm run lint
```

## Deployment

See [scripts/deploy.sh](./scripts/deploy.sh) for deployment instructions.

## Environment Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | Required |
| `DB_NAME` | Database name | `meet_gov` |
| `JWT_SECRET` | JWT secret key | Required |
| `JWT_REFRESH_SECRET` | JWT refresh secret | Required |
| `OPENAI_API_KEY` | OpenAI API key | Required |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:3000/api` |

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Git Workflow

- **main**: Production branch
- **dev**: Development branch
- **feature/***: Feature branches
- **fix/***: Bug fix branches
- **hotfix/***: Critical production fixes

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed workflow instructions.

## License

This project is licensed under the ISC License.

## Support

For support, please open an issue in the GitHub repository.

## Acknowledgments

- OpenAI for Whisper and GPT-4 APIs
- React and Express.js communities
- All contributors to this project

---

Built with ❤️ for efficient meeting management
