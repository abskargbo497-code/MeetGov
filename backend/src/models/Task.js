import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

const Task = sequelize.define('Task', {
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
  assigned_to: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
    validate: {
      notNull: {
        msg: 'Assigned user is required',
      },
    },
  },
  assigned_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Task title is required',
      },
    },
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  deadline: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      notNull: {
        msg: 'Deadline is required',
      },
    },
  },
  status: {
    type: DataTypes.ENUM('pending', 'in-progress', 'completed', 'overdue', 'cancelled'),
    defaultValue: 'pending',
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    defaultValue: 'medium',
  },
  reminder_sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // createdAt and updatedAt are handled automatically by Sequelize with underscored: true
}, {
  tableName: 'tasks',
  hooks: {
    beforeSave: async (task) => {
      // Auto-update status to overdue if deadline passed
      if (task.deadline && new Date(task.deadline) < new Date() && task.status === 'pending') {
        task.status = 'overdue';
      }
    },
  },
});

export default Task;
