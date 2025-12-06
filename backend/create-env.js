/**
 * Quick script to create .env file for backend
 * Run: node create-env.js
 */

import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createEnv() {
  console.log('=== Backend .env File Setup ===\n');

  // Generate JWT secrets
  const jwtSecret = crypto.randomBytes(64).toString('hex');
  const jwtRefreshSecret = crypto.randomBytes(64).toString('hex');

  // Get user input
  const dbPassword = await question('Enter MySQL root password (or press Enter for empty): ');
  const openaiKey = await question('Enter OpenAI API key (optional, press Enter to skip): ');
  const emailUser = await question('Enter email for sending notifications (optional, press Enter to skip): ');
  const emailPass = emailUser ? await question('Enter email password/app password: ') : '';

  const envContent = `# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=${dbPassword || ''}
DB_NAME=meet_gov

# JWT Configuration (Auto-generated)
JWT_SECRET=${jwtSecret}
JWT_REFRESH_SECRET=${jwtRefreshSecret}
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI API (Optional - for transcription features)
OPENAI_API_KEY=${openaiKey || ''}

# Email Configuration (Optional - for sending emails)
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=${emailUser || ''}
EMAIL_PASSWORD=${emailPass || ''}
EMAIL_FROM=${emailUser || 'noreply@meetgov.com'}

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Admin Seeding (Super Admin account)
ADMIN_EMAIL=admin@meetgov.com
ADMIN_PASSWORD=Admin@123
`;

  fs.writeFileSync('.env', envContent);
  console.log('\n✅ .env file created successfully!');
  console.log('\n⚠️  IMPORTANT: Make sure MySQL is running and the database exists.');
  console.log('   Run: npm run db:sync (to create database tables)');
  console.log('   Then: npm run dev (to start the server)');
  
  rl.close();
}

createEnv().catch(console.error);

