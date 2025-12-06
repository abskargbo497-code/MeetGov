/**
 * GuestInvite Model
 * Stores guest invitation records for meetings
 * Guests don't need accounts - they access meetings via email links
 */

import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';
import Meeting from './Meeting.js';
import User from './User.js';

const GuestInvite = sequelize.define('GuestInvite', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: {
        msg: 'Please provide a valid email address',
      },
      notEmpty: {
        msg: 'Email is required',
      },
    },
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
  invited_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    validate: {
      notNull: {
        msg: 'Invited by user ID is required',
      },
    },
  },
  unique_token: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Unique token for guest access link',
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'delivered', 'opened', 'failed'),
    defaultValue: 'pending',
    allowNull: false,
    validate: {
      isIn: {
        args: [['pending', 'sent', 'delivered', 'opened', 'failed']],
        msg: 'Status must be pending, sent, delivered, opened, or failed',
      },
    },
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when invitation email was sent',
  },
  opened_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when guest accessed the meeting via link',
  },
}, {
  tableName: 'guest_invites',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['meeting_id', 'email'],
      name: 'unique_meeting_guest',
    },
    {
      fields: ['email'],
    },
    {
      fields: ['meeting_id'],
    },
    {
      fields: ['unique_token'],
    },
  ],
});

// Note: Associations are defined in models/index.js to avoid circular dependencies
// Do not define associations here

export default GuestInvite;

