import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

const Transcript = sequelize.define('Transcript', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  meeting_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
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
  raw_text: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Raw transcript text is required',
      },
    },
  },
  summary_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  action_items_json: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },
  minutes_formatted: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  audio_file_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  processing_status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    defaultValue: 'pending',
  },
  // createdAt and updatedAt are handled automatically by Sequelize with underscored: true
}, {
  tableName: 'transcripts',
});

export default Transcript;
