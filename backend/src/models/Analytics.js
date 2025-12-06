import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

/**
 * Analytics Model
 * Stores analytics data and statistics for meetings
 * 
 * This model can be used to cache computed analytics or store
 * historical analytics snapshots for reporting purposes.
 */
const Analytics = sequelize.define('Analytics', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  meeting_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'meetings',
      key: 'id',
    },
    comment: 'Optional: Link to specific meeting, or null for global analytics',
  },
  stats: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'JSON object containing analytics statistics (attendance, tasks, etc.)',
  },
  period_start: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Start date of the analytics period',
  },
  period_end: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'End date of the analytics period',
  },
  analytics_type: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'custom', 'meeting'),
    defaultValue: 'custom',
    comment: 'Type of analytics snapshot',
  },
  // createdAt and updatedAt are handled automatically by Sequelize with underscored: true
}, {
  tableName: 'analytics',
  indexes: [
    {
      fields: ['meeting_id'],
      name: 'idx_analytics_meeting_id',
    },
    {
      fields: ['period_start', 'period_end'],
      name: 'idx_analytics_period',
    },
    {
      fields: ['analytics_type'],
      name: 'idx_analytics_type',
    },
  ],
});

export default Analytics;

