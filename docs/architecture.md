# System Architecture

## Overview

The Digital Meeting Assistant is a full-stack web application designed to streamline meeting management, attendance tracking, transcription, and task assignment. The system follows a modern three-tier architecture with clear separation of concerns.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
│  React + Vite | React Router | Context API | Custom Hooks  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST API
┌──────────────────────────▼──────────────────────────────────┐
│                      Backend Layer                           │
│  Express.js | MySQL | JWT Auth | OpenAI Integration        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   API    │  │ Services │  │  Models  │  │  Utils   │   │
│  │  Routes  │  │  Layer   │  │ (ORM)    │  │  Helpers │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      Data Layer                              │
│  MySQL Database | Sequelize ORM                             │
└──────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend
- **React 18**: UI library
- **Vite**: Build tool and dev server
- **React Router**: Client-side routing
- **Axios**: HTTP client
- **Context API**: State management
- **HTML5 QR Code Scanner**: QR code scanning
- **QRCode.react**: QR code generation

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web framework
- **MySQL**: Relational database
- **Sequelize**: Object-Relational Mapping (ORM)
- **JWT**: Authentication tokens
- **OpenAI API**: Whisper (transcription) and GPT-4 (summarization)
- **bcryptjs**: Password hashing
- **Multer**: File upload handling
- **QRCode**: QR code generation

## System Components

### 1. Frontend Components

#### Pages
- **Login**: User authentication
- **Dashboard**: Overview of meetings and tasks
- **Meeting Creation**: Form to create new meetings
- **QR Scanner**: Camera-based attendance check-in
- **Transcription Viewer**: Upload and view meeting transcripts
- **Minutes Review**: Browse generated meeting minutes
- **Task List**: View and manage assigned tasks

#### Context Providers
- **AuthContext**: Manages authentication state and user session
- **MeetingContext**: Manages meeting-related state

#### Custom Hooks
- **useAuth**: Authentication operations
- **useAPI**: API calls with error handling
- **useUpload**: File upload with progress tracking

### 2. Backend Components

#### API Routes (`/api`)
- **auth.js**: Authentication endpoints (register, login, refresh)
- **meeting.js**: Meeting CRUD operations and attendance
- **transcription.js**: Audio upload and transcription
- **tasks.js**: Task management
- **analytics.js**: Statistics and reporting

#### Services Layer
- **qrService.js**: QR code generation and validation
- **whisperService.js**: OpenAI Whisper API integration
- **minutesService.js**: Transcript summarization and action item extraction
- **notificationService.js**: Email/SMS notifications (placeholder)

#### Models (Sequelize)
- **User**: User accounts and authentication
- **Meeting**: Meeting information
- **Attendance**: Attendance records
- **Task**: Action items and tasks
- **Transcript**: Meeting transcripts and minutes

#### Utilities
- **jwt.js**: JWT token generation and verification
- **logger.js**: Logging utilities
- **helpers.js**: Common helper functions

## Module Interactions

### Authentication Flow
```
User → Frontend (Login) → Backend (/api/auth/login) → MongoDB (User lookup)
                                                      ↓
User ← Frontend (Token) ← Backend (JWT tokens) ← Password verification
```

### Meeting Creation Flow
```
User → Frontend (Form) → Backend (/api/meetings) → QR Service (Generate QR)
                                                    ↓
User ← Frontend (Meeting + QR) ← Backend (Meeting saved) ← MongoDB (Save)
```

### Attendance Flow
```
User → Frontend (QR Scanner) → Backend (/api/meetings/:id/attendance)
                                                      ↓
User ← Frontend (Success) ← Backend (Attendance logged) ← MongoDB (Save)
```

### Transcription Flow
```
User → Frontend (Upload audio) → Backend (/api/transcription/upload)
                                                      ↓
Backend → Whisper Service → OpenAI API (Transcribe)
                                                      ↓
Backend ← OpenAI (Transcript) ← Whisper Service
                                                      ↓
User ← Frontend (Transcript) ← Backend (Save to MongoDB)
```

### Minutes Generation Flow
```
User → Frontend (Generate minutes) → Backend (/api/transcription/generate-minutes)
                                                      ↓
Backend → Minutes Service → OpenAI GPT-4 (Summarize + Extract)
                                                      ↓
Backend ← OpenAI (Summary + Actions) ← Minutes Service
                                                      ↓
User ← Frontend (Minutes) ← Backend (Save to MongoDB)
```

## Data Flow

### Request Flow
1. User interacts with React frontend
2. Frontend makes API call via Axios
3. Request intercepted by Axios interceptor (adds JWT token)
4. Express middleware validates JWT token
5. Route handler processes request
6. Service layer performs business logic
7. Mongoose model interacts with MongoDB
8. Response sent back through layers
9. Frontend updates UI with response data

### State Management
- **Server State**: Managed by MongoDB
- **Client State**: Managed by React Context API
- **Session State**: JWT tokens stored in localStorage

## Security Architecture

### Authentication
- JWT-based authentication
- Access tokens (short-lived: 1 hour)
- Refresh tokens (long-lived: 7 days)
- Password hashing with bcrypt (10 rounds)

### Authorization
- Role-based access control (RBAC)
- Roles: admin, official, secretary
- Middleware checks user roles before allowing actions

### API Security
- CORS configuration
- JWT token validation on protected routes
- Input validation with express-validator
- Error handling without exposing sensitive information

## Deployment Architecture

### Development
```
Frontend (Vite Dev Server: 5173) ←→ Backend (Express: 3000) ←→ MongoDB (Local/Cloud)
```

### Production (Recommended)
```
CDN/Static Hosting (Frontend) ←→ API Gateway ←→ Backend Server ←→ MongoDB Cluster
                                          ↓
                                    Load Balancer
```

## Scalability Considerations

### Frontend
- Code splitting with React Router
- Lazy loading of components
- Optimized bundle size with Vite

### Backend
- Stateless API design (JWT tokens)
- Database indexing for performance
- Service layer separation for horizontal scaling
- File upload handling with memory limits

### Database
- MySQL indexes on frequently queried fields
- Connection pooling (configured in Sequelize)
- Foreign key constraints for data integrity
- Transaction support for complex operations

## Integration Points

### External Services
- **OpenAI API**: Whisper (transcription) and GPT-4 (summarization)
- **Email/SMS Services**: Placeholder for notifications (to be integrated)

### Internal Services
- QR code generation (server-side)
- File storage (currently in-memory, can be extended to S3/cloud storage)

## Error Handling

### Frontend
- Try-catch blocks in async operations
- Error boundaries for React components
- User-friendly error messages

### Backend
- Express error handling middleware
- Structured error responses
- Logging of errors for debugging

## Future Enhancements

1. **Real-time Features**: WebSocket integration for live transcription
2. **File Storage**: Cloud storage integration (AWS S3, Google Cloud Storage)
3. **Notifications**: Email and SMS service integration
4. **Analytics Dashboard**: Advanced reporting and visualization
5. **Mobile App**: React Native mobile application
6. **Caching**: Redis for session and data caching
7. **Search**: Full-text search for transcripts and meetings
