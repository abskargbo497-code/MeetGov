import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';
import User from './User.js';

const Meeting = sequelize.define('Meeting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Meeting title is required',
      },
    },
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  datetime: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      notNull: {
        msg: 'Meeting datetime is required',
      },
    },
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  organizer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    validate: {
      notNull: {
        msg: 'Organizer is required',
      },
    },
  },
  qr_code_token: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  qr_code_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'in-progress', 'completed', 'rescheduled', 'cancelled'),
    defaultValue: 'scheduled',
    allowNull: false,
    validate: {
      isIn: {
        args: [['scheduled', 'in-progress', 'completed', 'rescheduled', 'cancelled']],
        msg: 'Status must be scheduled, in-progress, completed, rescheduled, or cancelled',
      },
    },
  },
  transcript_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'transcripts',
      key: 'id',
    },
  },
  participants: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Array of participant user IDs or email addresses',
  },
  audio_file_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to uploaded audio file',
  },
  // createdAt and updatedAt are handled automatically by Sequelize with underscored: true
}, {
  tableName: 'meetings',
});

// Define associations (will be set up in index.js to avoid circular dependencies)
export default Meeting;
