import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  meeting_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'meetings',
      key: 'id',
    },
    validate: {
      notNull: {
        msg: 'Meeting ID is required',
      },
    },
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    validate: {
      notNull: {
        msg: 'User ID is required',
      },
    },
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  check_in_method: {
    type: DataTypes.ENUM('qr', 'manual'),
    defaultValue: 'qr',
  },
  status: {
    type: DataTypes.ENUM('present', 'late', 'absent'),
    defaultValue: 'present',
  },
  // createdAt is handled automatically by Sequelize with underscored: true
  // Note: attendance table doesn't have updatedAt column
}, {
  tableName: 'attendance',
  timestamps: true, // Enable createdAt
  updatedAt: false, // Disable updatedAt for attendance table
  indexes: [
    {
      unique: true,
      fields: ['meeting_id', 'user_id'],
      name: 'unique_attendance',
    },
  ],
});

export default Attendance;
