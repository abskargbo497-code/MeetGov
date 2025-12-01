# Environment Variables Setup

## Backend .env

Create a `.env` file in the `backend` directory with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-mysql-password
DB_NAME=meet_gov

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI API (for Whisper and GPT)
OPENAI_API_KEY=your-openai-api-key-here
```

## Frontend .env.example

Create a `.env` file in the `frontend` directory with the following variables:

```env
# Backend API URL
VITE_API_URL=http://localhost:3000/api
```

## MySQL Setup

### 1. Install MySQL

**macOS (using Homebrew):**
```bash
brew install mysql
brew services start mysql
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install mysql-server
sudo systemctl start mysql
```

**Windows:**
- Download MySQL Installer from https://dev.mysql.com/downloads/installer/
- Follow installation wizard

### 2. Create Database

```bash
# Login to MySQL
mysql -u root -p

# Create database
CREATE DATABASE meet_gov CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Create user (optional, for production)
CREATE USER 'meeting_user'@'localhost' IDENTIFIED BY 'your-password';
GRANT ALL PRIVILEGES ON meet_gov.* TO 'meeting_user'@'localhost';
FLUSH PRIVILEGES;

# Exit
EXIT;
```

### 3. Run Migrations

The database schema is defined in `database/schema.sql`. You can either:

**Option A: Use Sequelize sync (Development only)**
```bash
# This will auto-create tables based on models
# Note: This is for development. Use migrations for production.
```

**Option B: Run SQL schema manually**
```bash
mysql -u root -p meet_gov < database/schema.sql
```

**Option C: Use Sequelize migrations (Recommended for production)**
```bash
# Create migration files and run them
# See Sequelize CLI documentation
```

## Quick Setup

```bash
# Backend
cd backend
# Create .env file with MySQL configuration
npm install

# Frontend (optional)
cd ../frontend
echo "VITE_API_URL=http://localhost:3000/api" > .env
npm install
```

## Connection String Format

If you prefer using a connection string instead of individual variables:

```env
# Alternative format (not currently used, but can be added)
DATABASE_URL=mysql://user:password@host:port/database_name
```

## Production Considerations

- Use strong passwords for database users
- Restrict database access to application server only
- Use connection pooling (already configured in connection.js)
- Enable SSL for database connections in production
- Regular database backups
- Monitor database performance
