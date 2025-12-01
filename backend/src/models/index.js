// Import all models
import User from './User.js';
import Meeting from './Meeting.js';
import Attendance from './Attendance.js';
import Task from './Task.js';
import Transcript from './Transcript.js';

// Define all associations (avoiding circular dependencies)
Meeting.belongsTo(User, { foreignKey: 'organizer_id', as: 'organizer' });
Meeting.belongsTo(Transcript, { foreignKey: 'transcript_id', as: 'transcript' });

Attendance.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });
Attendance.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Task.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });
Task.belongsTo(User, { foreignKey: 'assigned_to', as: 'assignedTo' });
Task.belongsTo(User, { foreignKey: 'assigned_by', as: 'assignedBy' });

Transcript.belongsTo(Meeting, { foreignKey: 'meeting_id', as: 'meeting' });

// Export all models
export {
  User,
  Meeting,
  Attendance,
  Task,
  Transcript,
};

export default {
  User,
  Meeting,
  Attendance,
  Task,
  Transcript,
};
