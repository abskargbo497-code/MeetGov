# Digital Meeting Assistant - Frontend

Frontend application for the Digital Meeting Assistant built with React and Vite.

## Features

- **Authentication**: Login and registration with JWT tokens
- **Dashboard**: Overview of meetings and tasks
- **Meeting Management**: Create meetings, view QR codes, log attendance
- **QR Scanner**: Scan QR codes to check in to meetings
- **Transcription**: Upload audio files and view transcripts
- **Minutes Review**: View generated meeting minutes and action items
- **Task Management**: View and manage assigned tasks

## Tech Stack

- React 18
- Vite
- React Router
- Axios for API calls
- HTML5 QR Code Scanner
- QRCode.react for QR code generation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The app will run on `http://localhost:5173` by default.

## Build

To build for production:
```bash
npm run build
```

The built files will be in the `dist` directory.

## Project Structure

```
frontend/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Page components
│   ├── context/        # React Context providers
│   ├── hooks/          # Custom React hooks
│   ├── utils/          # Utility functions
│   ├── App.jsx         # Main app component
│   └── main.jsx        # Entry point
├── package.json
└── vite.config.js
```

## Environment Variables

Create a `.env` file in the frontend directory:

```
VITE_API_URL=http://localhost:3000/api
```

## Pages

- `/login` - Login page
- `/dashboard` - Dashboard with overview
- `/meetings/create` - Create a new meeting
- `/qr-scanner` - QR code scanner for attendance
- `/transcription/:meetingId` - Upload and view transcriptions
- `/minutes` - Review meeting minutes
- `/tasks` - View and manage tasks

## Components

- **Navbar**: Top navigation bar
- **Sidebar**: Side navigation menu
- **MeetingCard**: Display meeting information
- **TaskCard**: Display task information
- **QRDisplay**: Display QR codes
- **SummaryPanel**: Display meeting summaries and action items

## Hooks

- **useAuth**: Authentication hook
- **useAPI**: API call hook with loading/error states
- **useUpload**: File upload hook with progress tracking
