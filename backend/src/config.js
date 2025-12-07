import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'meet_gov',
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  },
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Email configuration
  email: {
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASSWORD || '',
    },
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@meetgov.com',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  // Admin seeding configuration
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@meetgov.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
  },
};
