# User Workflow Documentation

This document describes the complete user workflow from meeting creation through attendance tracking, transcription, minutes generation, and task management.

## Workflow Overview

```
Meeting Creation → QR Generation → Attendance → Transcription → Minutes → Tasks
```

## Detailed Workflows

### 1. Meeting Creation Workflow

**Actor:** Admin or Secretary

**Steps:**
1. User navigates to "Create Meeting" page
2. Fills out meeting form:
   - Title (required)
   - Description (optional)
   - Date & Time (required)
   - Location (optional)
3. Submits form
4. System creates meeting record
5. System generates unique QR code token
6. System generates QR code image
7. System saves meeting with QR code
8. User is redirected to meeting details page
9. QR code is displayed for distribution

**Outcomes:**
- Meeting record created in database
- QR code generated and linked to meeting
- Meeting status set to "scheduled"

**Next Steps:**
- Share QR code with attendees
- Wait for meeting time

---

### 2. Attendance Workflow

**Actor:** Meeting Attendee

**Option A: QR Code Check-in**

1. User opens QR Scanner page
2. User grants camera permission
3. User points camera at meeting QR code
4. System scans and decodes QR code
5. System extracts meeting ID and token
6. System verifies token matches meeting
7. System checks if user already logged attendance
8. System determines if user is late (current time > meeting time)
9. System creates attendance record:
   - Status: "present" or "late"
   - Timestamp: current time
   - Check-in method: "qr"
10. System returns success message
11. User redirected to dashboard

**Option B: Manual Check-in**

1. User navigates to meeting details
2. User clicks "Log Attendance" button
3. System creates attendance record:
   - Status: "present" or "late"
   - Timestamp: current time
   - Check-in method: "manual"
4. System returns success message

**Outcomes:**
- Attendance record created
- User marked as present/late
- Attendance visible in meeting details

**Validation:**
- QR token must match meeting
- User cannot log attendance twice for same meeting
- Meeting must exist

---

### 3. Transcription Workflow

**Actor:** Meeting Organizer or Secretary

**Step 1: Upload Audio**

1. User navigates to Transcription page for meeting
2. User selects audio file (mp3, wav, m4a, webm)
3. User clicks "Upload & Transcribe"
4. System validates file type and size
5. System sets transcript status to "processing"
6. System sends audio to OpenAI Whisper API
7. System receives transcription text
8. System saves raw transcript to database
9. System sets transcript status to "completed"
10. System links transcript to meeting
11. Raw transcript displayed to user

**Step 2: Generate Minutes (Optional)**

1. User clicks "Generate Minutes" button
2. System sends raw transcript to OpenAI GPT-4 for summarization
3. System receives summary text
4. System sends raw transcript to OpenAI GPT-4 for action item extraction
5. System receives action items as JSON
6. System formats meeting minutes:
   - Meeting title, date, location
   - Summary
   - Action items list
   - Full transcript
7. System saves summary, action items, and formatted minutes
8. System displays generated minutes to user

**Outcomes:**
- Raw transcript saved
- Summary generated (if requested)
- Action items extracted (if requested)
- Formatted minutes created (if requested)

**Error Handling:**
- File upload errors
- Transcription API errors
- Processing timeout
- Invalid file format

---

### 4. Minutes Review Workflow

**Actor:** Any Authenticated User

**Steps:**
1. User navigates to "Minutes Review" page
2. System fetches all completed meetings
3. System displays list of meetings in sidebar
4. User clicks on a meeting
5. System fetches transcript for selected meeting
6. System displays:
   - Summary (if available)
   - Action items (if available)
   - Full formatted minutes (if available)
7. User can browse different meetings
8. User can view full transcript if needed

**Outcomes:**
- User can review past meeting minutes
- User can see action items from meetings
- User can access full transcripts

---

### 5. Task Management Workflow

**Actor:** Meeting Organizer or Admin

**Step 1: Task Creation (Automatic from Minutes)**

1. System extracts action items from transcript
2. For each action item:
   - System creates task record
   - Links to meeting
   - Assigns to user (if name matches) or marks as "TBD"
   - Sets deadline from suggested_deadline or defaults
   - Sets status to "pending"
3. System sends notification to assigned user (if implemented)

**Step 2: Task Creation (Manual)**

1. User navigates to meeting details or task list
2. User clicks "Create Task" button
3. User fills out task form:
   - Title (required)
   - Description (optional)
   - Assigned to (required - select user)
   - Deadline (required)
   - Priority (optional, default: medium)
4. User submits form
5. System creates task record
6. System sends notification to assigned user
7. Task appears in task list

**Step 3: Task Management**

1. User navigates to "Tasks" page
2. User can filter tasks:
   - All tasks
   - Pending
   - In Progress
   - Completed
   - Overdue
3. User views task details
4. User can update task:
   - Change status
   - Update title/description
   - Change deadline
   - Change priority
5. User marks task as complete
6. System updates task status to "completed"
7. System records completion timestamp

**Step 4: Task Reminders (Future)**

1. System checks for tasks approaching deadline
2. System sends reminder notification
3. System marks reminder_sent flag

**Outcomes:**
- Tasks created from action items
- Tasks assigned to users
- Tasks tracked and managed
- Task completion recorded

**Auto-Update:**
- Tasks automatically marked as "overdue" if deadline passed and status is pending/in-progress

---

## Complete End-to-End Workflow Example

### Scenario: Weekly Team Meeting

**Day 1: Meeting Preparation**

1. **Secretary creates meeting:**
   - Title: "Weekly Team Meeting"
   - Date: January 15, 2024, 10:00 AM
   - Location: Conference Room A
   - System generates QR code

2. **Secretary shares QR code:**
   - Emails QR code to team
   - Posts QR code in team chat
   - Prints QR code for physical meeting room

**Day 2: Meeting Day**

3. **Attendees check in:**
   - 9:55 AM: John scans QR code → Status: "present"
   - 10:05 AM: Jane scans QR code → Status: "late"
   - 10:00 AM: Bob manually checks in → Status: "present"
   - 10:02 AM: Alice scans QR code → Status: "late"

4. **Meeting occurs:**
   - Secretary records audio of meeting
   - Meeting covers: Q1 planning, budget review, policy updates

**Day 3: Post-Meeting Processing**

5. **Secretary uploads audio:**
   - Navigates to transcription page
   - Uploads meeting audio file
   - System transcribes using Whisper API
   - Raw transcript displayed

6. **Secretary generates minutes:**
   - Clicks "Generate Minutes"
   - System creates summary
   - System extracts action items:
     - "Prepare Q1 project proposal" → Assigned to Jane
     - "Review budget allocations" → Assigned to Bob
     - "Update employee handbook" → Assigned to Alice
   - System formats minutes
   - Minutes displayed and saved

7. **Tasks automatically created:**
   - System creates 3 tasks from action items
   - Tasks assigned to respective users
   - Notifications sent (if implemented)

**Week 2: Task Management**

8. **Users manage tasks:**
   - Jane updates task status to "in-progress"
   - Bob completes budget review task
   - Alice's task deadline approaches → Reminder sent
   - System marks Bob's task as "completed"

**Week 3: Review**

9. **Team reviews minutes:**
   - Team members access "Minutes Review" page
   - View summary and action items
   - Check task completion status
   - Reference full transcript if needed

## User Roles and Permissions

### Admin
- Full access to all features
- Can create/delete meetings
- Can assign tasks to any user
- Can view all analytics
- Can manage users

### Secretary
- Can create meetings
- Can upload transcriptions
- Can generate minutes
- Can create tasks
- Can view all meetings

### Official
- Can view meetings
- Can check in to meetings
- Can view assigned tasks
- Can update own tasks
- Can view minutes

## Error Scenarios and Handling

### QR Code Issues
- **Invalid QR code:** Error message displayed, user can try manual check-in
- **Expired QR code:** System validates token, rejects if invalid
- **Camera permission denied:** User prompted to grant permission

### Transcription Issues
- **File too large:** Error message, user must use smaller file
- **Invalid file format:** Error message, user must use supported format
- **API failure:** Error logged, user notified, can retry

### Task Issues
- **User not found for assignment:** Task created with "TBD" assignment
- **Deadline in past:** System warns user, allows creation
- **Duplicate task:** System prevents or warns user

## Integration Points

### External Services
- **OpenAI Whisper:** Audio transcription
- **OpenAI GPT-4:** Summarization and action item extraction
- **Email/SMS (Future):** Task notifications and reminders

### Internal Services
- **QR Service:** QR code generation and validation
- **Notification Service:** Task and meeting reminders

## Workflow Metrics

### Key Metrics Tracked
- Meeting creation time
- Attendance check-in time
- Transcription processing time
- Minutes generation time
- Task completion rate
- Average time to complete tasks

### Analytics Available
- Attendance statistics
- Task completion rates
- Department performance
- Overdue task tracking
- Meeting frequency analysis
