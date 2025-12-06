# MeetGov - Complete Hackathon Implementation

## Overview

This document describes the complete implementation of MeetGov, a digital meeting assistant system with authentication, roles, guest invitations, and automated email delivery.

---

## PART 1 — ROLES & AUTHENTICATION

### Roles

The system supports three roles:
- **super_admin**: Full system access, cannot register via normal registration
- **secretary**: Can create/edit meetings, manage tasks, invite guests, upload audio
- **official**: Can scan QR codes, attend meetings, view own meetings and tasks

### Registration Rules

1. Users can register only as "official" or "secretary"
2. "super_admin" cannot register via normal registration; it must be seeded in the database
3. Registration form dropdown shows only Official and Secretary options

### Backend Implementation

- **Password Hashing**: Uses `bcryptjs` to hash passwords during registration (10 rounds)
- **Password Validation**: On login, validates password using `bcrypt.compare`
- **JWT Tokens**: Include user role, signed with `JWT_SECRET` environment variable
- **Admin Seeding**: On server startup, checks if a Super Admin exists. If not, creates one using:
  - `ADMIN_EMAIL` environment variable
  - `ADMIN_PASSWORD` environment variable

### Super Admin Credentials

**Default Admin Account:**
- **Email**: `admin@meetgov.com` (or value from `ADMIN_EMAIL` env var)
- **Password**: `Admin@123` (or value from `ADMIN_PASSWORD` env var)

**⚠️ IMPORTANT**: Change the default password after first login!

### Frontend

- Registration page dropdown shows only "Official" and "Secretary"
- Dropdown text color is readable on white background
- Professional, clean UI without emojis

---

## PART 2 — GUEST INVITATION (NO ACCOUNT REQUIRED)

### Backend

1. **GuestInvites Table/Model**:
   - `id`: Primary key
   - `email`: Guest email address
   - `meeting_id`: Foreign key to meetings
   - `invited_by`: Foreign key to users (who sent the invitation)
   - `unique_token`: Unique token for guest access link
   - `status`: ENUM('pending', 'sent', 'delivered', 'opened', 'failed')
   - `sent_at`: Timestamp when invitation email was sent
   - `opened_at`: Timestamp when guest accessed the meeting via link
   - Unique constraint on `(meeting_id, email)` to prevent duplicates

2. **API Route**: `POST /api/meetings/:id/invite-guest`
   - Only Super Admin or Secretary can access
   - Accepts array of email addresses
   - Validates email format
   - Creates GuestInvite records
   - Sends invitation emails with unique access links
   - Returns list of successfully invited guests and any errors

3. **API Route**: `GET /api/meetings/:id/guests`
   - Get all guest invites for a meeting
   - Accessible by Super Admin, Secretary, or meeting organizer

### Frontend

- Input field on Create/Edit Meeting page for guest emails
- Button to add multiple guests
- Shows guest list with status
- Validates email format
- Clean, responsive UI

---

## PART 3 — AUTOMATIC EMAIL DELIVERY AFTER MEETING

### Implementation

1. **Trigger**: Email sending is triggered when a meeting status is changed to "completed"

2. **Recipients**: Email is sent to:
   - All guests of the meeting (from GuestInvites table)
   - All participants (Official, Secretary, Admin) who:
     - Are the meeting organizer
     - Have attendance records for the meeting
     - Are in the meeting's participants array

3. **Email Content**:
   - Meeting minutes (if available)
   - Full transcription (if available)
   - Summary (if available)
   - Assigned tasks with deadlines and descriptions

4. **Email Service**: Uses Nodemailer
   - Supports Gmail, SendGrid, and other SMTP providers
   - Configured via environment variables:
     - `EMAIL_SERVICE`: Email service (default: 'gmail')
     - `EMAIL_HOST`: SMTP host (default: 'smtp.gmail.com')
     - `EMAIL_PORT`: SMTP port (default: 587)
     - `EMAIL_USER`: Email username
     - `EMAIL_PASSWORD`: Email password or app password
     - `EMAIL_FROM`: From address

5. **Error Handling**:
   - Backend handles duplicates gracefully
   - Errors are logged but don't fail the meeting status update
   - Email sending failures are tracked in GuestInvite status

---

## PART 4 — FRONTEND & UI FIXES

### Design Principles

1. **Professional, Modern UI**: Clean design without emojis
2. **Readable Text**: All inputs, dropdowns, and forms have readable text colors
3. **Role-Based Access**:
   - **Super Admin & Secretary**: Create/edit meetings, manage tasks, invite guests, upload audio
   - **Official**: Scan QR, attend meeting, view own meetings and tasks
   - **Guests**: View meeting info via email only (no login required)

4. **Responsive Design**: Works on desktop, tablet, and mobile devices
5. **Accessible**: Proper labels, ARIA attributes, keyboard navigation

---

## PART 5 — BACKEND ROUTES & PERMISSIONS

### Middleware

1. **allowOnlyAdminOrSecretary**: 
   - Allows Super Admin and Secretary
   - Used for: create/edit meetings, invite guests, manage tasks

2. **allowAuthenticatedUsers**: 
   - Allows all authenticated users
   - Used for: view own meetings, scan QR, view tasks

3. **allowMeetingParticipants**: 
   - Allows meeting organizer, participants, and Admin/Secretary
   - Used for: view meeting details, view attendance

4. **allowOrganizerOrAdmin**: 
   - Allows meeting organizer, Super Admin, or Secretary
   - Used for: update/delete meetings, view guest list

### Protected Routes

All routes are protected with appropriate middleware based on functionality:
- Meeting creation/editing: `allowOnlyAdminOrSecretary`
- Guest invitations: `allowOnlyAdminOrSecretary`
- Meeting viewing: `allowMeetingParticipants` or `allowAuthenticatedUsers`
- Task management: Role-based access

---

## PART 6 — DATABASE & SEED

### Database Schema

1. **Users Table**:
   - `role`: ENUM('super_admin', 'secretary', 'official')
   - Other fields: id, name, email, password_hash, department

2. **Meetings Table**:
   - `status`: ENUM('scheduled', 'in-progress', 'completed', 'rescheduled', 'cancelled')
   - Other fields: id, title, description, datetime, location, organizer_id, qr_code_token, etc.

3. **GuestInvites Table**:
   - Links guests to meetings
   - Tracks invitation status and access tokens

4. **Super Admin Seeding**:
   - Automatically creates Super Admin on server startup if one doesn't exist
   - Uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment variables

---

## Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=meet_gov

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Admin Seeding
ADMIN_EMAIL=admin@meetgov.com
ADMIN_PASSWORD=Admin@123

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com

# Frontend URL
FRONTEND_URL=http://localhost:5173

# OpenAI (for transcription)
OPENAI_API_KEY=your-openai-api-key

# Server
PORT=3000
NODE_ENV=development
```

---

## Setup Instructions

### 1. Backend Setup

```bash
cd MeetGov/backend
npm install

# Create .env file with variables above
# Update ADMIN_EMAIL and ADMIN_PASSWORD

# Create database
mysql -u root -p
CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;

# Start server (will auto-seed admin)
npm run dev
```

### 2. Frontend Setup

```bash
cd MeetGov/frontend
npm install
npm run dev
```

### 3. First Login

1. Open frontend at `http://localhost:5173`
2. Login with Super Admin credentials:
   - Email: `admin@meetgov.com` (or your `ADMIN_EMAIL`)
   - Password: `Admin@123` (or your `ADMIN_PASSWORD`)
3. **Change password immediately** (if password change feature is implemented)

---

## API Endpoints Summary

### Authentication
- `POST /api/auth/register` - Register (official/secretary only)
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Meetings
- `POST /api/meetings` - Create meeting (admin/secretary)
- `GET /api/meetings` - List meetings
- `GET /api/meetings/:id` - Get meeting details
- `PUT /api/meetings/:id` - Update meeting (organizer/admin/secretary)
- `PATCH /api/meetings/:id/status` - Update status (admin/secretary)
- `POST /api/meetings/:id/invite-guest` - Invite guests (admin/secretary)
- `GET /api/meetings/:id/guests` - Get guest list (organizer/admin/secretary)
- `POST /api/meetings/:id/attendance` - Log attendance

### Tasks
- `POST /api/tasks` - Create task
- `GET /api/tasks` - List tasks
- `PUT /api/tasks/:id` - Update task

---

## Code Comments

All code is thoroughly commented for clarity:
- Backend routes include JSDoc comments
- Models have field descriptions
- Middleware functions are documented
- Complex logic includes inline comments

---

## Testing Checklist

- [ ] Super Admin can login with seeded credentials
- [ ] Registration only allows official/secretary roles
- [ ] Admin role cannot be registered
- [ ] Guest invitations can be sent from meeting creation
- [ ] Guest invitation emails are sent successfully
- [ ] Meeting completion triggers email to all participants and guests
- [ ] Email includes minutes, transcription, summary, and tasks
- [ ] Role-based access control works correctly
- [ ] Frontend UI is readable and professional
- [ ] All dropdowns have readable text colors

---

## Production Deployment Notes

1. **Change Default Admin Password**: Update `ADMIN_PASSWORD` in production
2. **Use Strong JWT Secrets**: Generate strong random strings for JWT secrets
3. **Configure Email Service**: Set up proper SMTP credentials
4. **Database Security**: Use strong database passwords and restrict access
5. **HTTPS**: Use HTTPS in production
6. **Environment Variables**: Never commit `.env` files to version control

---

## Support

For issues or questions, refer to:
- Backend API documentation: `backend/API_DOCUMENTATION.md`
- Database setup: `database/README.md`
- Environment setup: `backend/ENV_SETUP.md`

---

## License

This project is part of a hackathon implementation.

