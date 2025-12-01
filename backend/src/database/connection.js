import { Sequelize } from 'sequelize';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

// Create Sequelize instance
export const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    define: {
      underscored: true, // Use snake_case for column names (created_at instead of createdAt)
      timestamps: true, // Enable createdAt and updatedAt
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

// Test connection
export const connectDatabase = async () => {
  try {
    await sequelize.authenticate();
    log.info('MySQL connection established successfully');
    return true;
  } catch (error) {
    log.error('Unable to connect to MySQL database:', error);
    throw error;
  }
};

// Sync database (use with caution in production)
export const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force, alter: !force });
    log.info('Database synchronized successfully');
    return true;
  } catch (error) {
    log.error('Error synchronizing database:', error);
    throw error;
  }
};

export default sequelize;

