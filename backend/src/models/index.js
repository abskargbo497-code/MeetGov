// Import all models
import User from './User.js';
import Meeting from './Meeting.js';
import Attendance from './Attendance.js';
import Task from './Task.js';
import Transcript from './Transcript.js';
import Analytics from './Analytics.js';
import GuestInvite from './GuestInvite.js';

/**
 * Define all model associations
 * Associations are defined here to avoid circular dependencies
 */

// ===== USER ASSOCIATIONS =====
// User can organize multiple meetings
User.hasMany(Meeting, { foreignKey: 'organizer_id', as: 'organizedMeetings' });

// User can have multiple tasks assigned to them
User.hasMany(Task, { foreignKey: 'assigned_to', as: 'assignedTasks' });

// User can assign multiple tasks to others
User.hasMany(Task, { foreignKey: 'assigned_by', as: 'createdTasks' });

// User can have multiple attendance records
User.hasMany(Attendance, { foreignKey: 'user_id', as: 'attendances' });

// ===== MEETING ASSOCIATIONS =====
// Meeting belongs to a User (organizer)
Meeting.belongsTo(User, { foreignKey: 'organizer_id', as: 'organizer' });

// Meeting can have one transcript
Meeting.belongsTo(Transcript, { foreignKey: 'transcript_id', as: 'transcript' });
Meeting.hasOne(Transcript, { foreignKey: 'meeting_id', as: 'meetingTranscript' });

// Meeting can have multiple attendance records
Meeting.hasMany(Attendance, { foreignKey: 'meeting_id', as: 'attendances' });

// Meeting can have multiple tasks
Meeting.hasMany(Task, { foreignKey: 'meeting_id', as: 'tasks' });

// Meeting can have multiple analytics records
Meeting.hasMany(Analytics, { foreignKey: 'meeting_id', as: 'analytics' });

// ===== ATTENDANCE ASSOCIATIONS =====
// Attendance belongs to a Meeting
Attendance.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });

// Attendance belongs to a User
Attendance.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ===== TASK ASSOCIATIONS =====
// Task belongs to a Meeting
Task.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });

// Task belongs to a User (assigned to)
Task.belongsTo(User, { foreignKey: 'assigned_to', as: 'assignedTo' });

// Task belongs to a User (assigned by)
Task.belongsTo(User, { foreignKey: 'assigned_by', as: 'assignedBy' });

// ===== TRANSCRIPT ASSOCIATIONS =====
// Transcript belongs to a Meeting
Transcript.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });

// ===== ANALYTICS ASSOCIATIONS =====
// Analytics can optionally belong to a Meeting
Analytics.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });

// ===== GUEST INVITE ASSOCIATIONS =====
// GuestInvite belongs to a Meeting
GuestInvite.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });
Meeting.hasMany(GuestInvite, { foreignKey: 'meeting_id', as: 'guestInvites' });

// GuestInvite belongs to a User (inviter)
GuestInvite.belongsTo(User, { foreignKey: 'invited_by', as: 'inviter' });
User.hasMany(GuestInvite, { foreignKey: 'invited_by', as: 'sentInvites' });

// Export all models
export {
  User,
  Meeting,
  Attendance,
  Task,
  Transcript,
  Analytics,
  GuestInvite,
};

export default {
  User,
  Meeting,
  Attendance,
  Task,
  Transcript,
  Analytics,
  GuestInvite,
};
