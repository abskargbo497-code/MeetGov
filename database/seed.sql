-- Digital Meeting Assistant Seed Data
-- Sample data for testing and development
-- Note: IDs are auto-increment, so they will be generated automatically

-- Insert sample users (IDs will be auto-generated: 1, 2, 3, 4, 5)
INSERT INTO users (name, email, password_hash, role, department) VALUES
('John Doe', 'john.doe@example.com', '$2a$10$rK8Q8Q8Q8Q8Q8Q8Q8Q8Q8O8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q', 'admin', 'IT Department'),
('Jane Smith', 'jane.smith@example.com', '$2a$10$rK8Q8Q8Q8Q8Q8Q8Q8Q8O8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q', 'secretary', 'Administration'),
('Bob Johnson', 'bob.johnson@example.com', '$2a$10$rK8Q8Q8Q8Q8Q8Q8Q8Q8O8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q', 'official', 'Finance'),
('Alice Williams', 'alice.williams@example.com', '$2a$10$rK8Q8Q8Q8Q8Q8Q8Q8Q8O8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q', 'official', 'HR Department'),
('Charlie Brown', 'charlie.brown@example.com', '$2a$10$rK8Q8Q8Q8Q8Q8Q8Q8Q8O8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q', 'official', 'Operations');

-- Insert sample meetings (assuming users have IDs 1-5)
INSERT INTO meetings (title, description, datetime, location, organizer_id, qr_code_token, status) VALUES
('Weekly Team Meeting', 'Regular weekly team sync meeting', '2024-01-15 10:00:00', 'Conference Room A', 1, 'qr_token_12345', 'completed'),
('Project Planning Session', 'Planning session for Q1 projects', '2024-01-20 14:00:00', 'Conference Room B', 2, 'qr_token_67890', 'scheduled'),
('Budget Review Meeting', 'Quarterly budget review and planning', '2024-01-25 09:00:00', 'Main Hall', 3, 'qr_token_11111', 'scheduled'),
('Department All-Hands', 'Monthly all-hands meeting for all departments', '2024-02-01 15:00:00', 'Auditorium', 1, 'qr_token_22222', 'scheduled');

-- Insert sample attendance records (assuming meetings have IDs 1-4, users have IDs 1-5)
INSERT INTO attendance (meeting_id, user_id, timestamp, location, check_in_method, status) VALUES
(1, 1, '2024-01-15 09:55:00', 'Conference Room A', 'qr', 'present'),
(1, 2, '2024-01-15 10:05:00', 'Conference Room A', 'qr', 'late'),
(1, 3, '2024-01-15 09:58:00', 'Conference Room A', 'qr', 'present'),
(1, 4, '2024-01-15 10:02:00', 'Conference Room A', 'manual', 'late'),
(2, 1, '2024-01-20 13:55:00', 'Conference Room B', 'qr', 'present'),
(2, 2, '2024-01-20 13:58:00', 'Conference Room B', 'qr', 'present');

-- Insert sample tasks (assuming meetings have IDs 1-4, users have IDs 1-5)
INSERT INTO tasks (meeting_id, assigned_to, assigned_by, title, description, deadline, status, priority) VALUES
(1, 2, 1, 'Prepare Q1 project proposal', 'Draft the proposal document for Q1 projects', '2024-02-01 17:00:00', 'in-progress', 'high'),
(1, 3, 1, 'Review budget allocations', 'Review and approve budget allocations for each department', '2024-01-30 17:00:00', 'pending', 'high'),
(1, 4, 1, 'Update employee handbook', 'Update the employee handbook with new policies', '2024-02-15 17:00:00', 'pending', 'medium'),
(2, 1, 2, 'Schedule follow-up meeting', 'Schedule a follow-up meeting to discuss project details', '2024-01-22 17:00:00', 'completed', 'low'),
(2, 3, 2, 'Prepare financial report', 'Prepare detailed financial report for the planning session', '2024-01-19 17:00:00', 'in-progress', 'medium');

-- Insert sample transcript (assuming meeting has ID 1)
INSERT INTO transcripts (meeting_id, raw_text, summary_text, action_items_json, processing_status) VALUES
(1, 
'John: Good morning everyone. Let''s start with the agenda. First item is the Q1 project proposal. Jane, can you give us an update?

Jane: Yes, I''ve been working on the proposal document. I should have it ready by next week.

John: Great. Next, we need to review the budget allocations. Bob, can you handle that?

Bob: Sure, I''ll review the allocations and get back to you by the end of the month.

John: Perfect. Alice, we also need to update the employee handbook with the new policies.

Alice: I''ll start working on that right away.

John: Excellent. Let''s schedule a follow-up meeting next week to discuss the project details further.',

'The meeting covered Q1 project planning, budget review, and policy updates. Action items were assigned to team members with specific deadlines.',

'[
  {"title": "Prepare Q1 project proposal", "description": "Draft the proposal document for Q1 projects", "assigned_to": "Jane Smith", "suggested_deadline": "2024-02-01"},
  {"title": "Review budget allocations", "description": "Review and approve budget allocations for each department", "assigned_to": "Bob Johnson", "suggested_deadline": "2024-01-30"},
  {"title": "Update employee handbook", "description": "Update the employee handbook with new policies", "assigned_to": "Alice Williams", "suggested_deadline": "2024-02-15"},
  {"title": "Schedule follow-up meeting", "description": "Schedule a follow-up meeting to discuss project details", "assigned_to": "John Doe", "suggested_deadline": "2024-01-22"}
]',

'completed');

-- Note: Password hashes in seed data are placeholders
-- In production, use proper bcrypt hashed passwords
-- Example: password "password123" hashed with bcrypt would be: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
