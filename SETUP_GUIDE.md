# Setup Guide - Digital Meeting Assistant

Complete setup instructions for getting the Digital Meeting Assistant up and running.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **MongoDB** (local or cloud instance) - [Download](https://www.mongodb.com/try/download/community) or use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- **npm** or **yarn** (comes with Node.js)
- **Git** (for version control)

## Quick Start

### 1. Clone or Navigate to Project

```bash
cd digital-meeting-assistant
```

### 2. Initialize Git Repository (if not already done)

```bash
git init
git add .
git commit -m "Initial commit: Digital Meeting Assistant project"
```

### 3. Set Up Backend

```bash
cd backend

# Install dependencies
npm install

# Create .env file
# Copy the content from ENV_SETUP.md or create manually:
cat > .env << EOF
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/digital-meeting-assistant
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
OPENAI_API_KEY=your-openai-api-key-here
EOF

# Edit .env with your actual values
# - Replace JWT secrets with secure random strings
# - Update MONGO_URI if using cloud MongoDB
# - Add your OpenAI API key
```

### 4. Set Up Frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Create .env file (optional)
echo "VITE_API_URL=http://localhost:3000/api" > .env
```

### 5. Start MongoDB

**Option A: Local MongoDB**
```bash
# macOS (using Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Windows
# Start MongoDB from Services or run mongod.exe
```

**Option B: MongoDB Atlas (Cloud)**
- Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- Create a free cluster
- Get your connection string
- Update `MONGO_URI` in backend/.env

### 6. Run the Application

**Option A: Use the startup script**
```bash
# From project root
chmod +x scripts/start-dev.sh
./scripts/start-dev.sh
```

**Option B: Manual start (two terminals)**

Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

### 7. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

## Commands Reference

### Backend Commands

```bash
cd backend

# Development (with auto-reload)
npm run dev

# Production
npm start

# Install dependencies
npm install
```

### Frontend Commands

```bash
cd frontend

# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Install dependencies
npm install
```

## Environment Variables

### Backend (.env)

| Variable | Description | Required | Default |
|----------|-------------|-----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment | No | development |
| `CORS_ORIGIN` | Frontend URL | No | http://localhost:5173 |
| `MONGO_URI` | MongoDB connection | Yes | - |
| `JWT_SECRET` | JWT secret key | Yes | - |
| `JWT_REFRESH_SECRET` | Refresh token secret | Yes | - |
| `JWT_EXPIRES_IN` | Access token expiry | No | 1h |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | No | 7d |
| `OPENAI_API_KEY` | OpenAI API key | Yes | - |

### Frontend (.env)

| Variable | Description | Required | Default |
|----------|-------------|-----------|---------|
| `VITE_API_URL` | Backend API URL | No | http://localhost:3000/api |

## Generate JWT Secrets

For production, generate secure random secrets:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Using OpenSSL
openssl rand -hex 64
```

## First Time Setup Checklist

- [ ] Node.js installed (v18+)
- [ ] MongoDB running (local or cloud)
- [ ] Backend dependencies installed (`cd backend && npm install`)
- [ ] Frontend dependencies installed (`cd frontend && npm install`)
- [ ] Backend `.env` file created with all required variables
- [ ] Frontend `.env` file created (optional)
- [ ] MongoDB connection string configured
- [ ] JWT secrets generated and configured
- [ ] OpenAI API key added
- [ ] Both servers started successfully
- [ ] Application accessible at http://localhost:5173

## Troubleshooting

### Backend won't start

1. **Check MongoDB connection:**
   ```bash
   # Test MongoDB connection
   mongosh "mongodb://localhost:27017/digital-meeting-assistant"
   ```

2. **Check port availability:**
   ```bash
   # Check if port 3000 is in use
   lsof -i :3000
   ```

3. **Verify .env file exists:**
   ```bash
   cd backend
   ls -la .env
   ```

### Frontend won't start

1. **Check port availability:**
   ```bash
   # Check if port 5173 is in use
   lsof -i :5173
   ```

2. **Clear cache and reinstall:**
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   ```

### MongoDB connection issues

1. **Local MongoDB:**
   - Ensure MongoDB service is running
   - Check connection string format
   - Verify database name is correct

2. **MongoDB Atlas:**
   - Whitelist your IP address
   - Check connection string includes credentials
   - Verify network access settings

### CORS errors

- Ensure `CORS_ORIGIN` in backend `.env` matches frontend URL
- Check that backend is running
- Verify API URL in frontend `.env`

## Next Steps

After successful setup:

1. **Create your first user:**
   - Register via the frontend at http://localhost:5173
   - Or use the API: `POST /api/auth/register`

2. **Create a meeting:**
   - Login to the application
   - Navigate to "Create Meeting"
   - Fill out the form and create your first meeting

3. **Test QR code scanning:**
   - Create a meeting
   - Use the QR scanner to test attendance check-in

4. **Test transcription:**
   - Upload an audio file after a meeting
   - Generate meeting minutes

5. **Explore features:**
   - Task management
   - Analytics dashboard
   - Minutes review

## Production Deployment

See [scripts/deploy.sh](./scripts/deploy.sh) for deployment instructions.

For production:
- Use environment-specific `.env` files
- Set `NODE_ENV=production`
- Use secure JWT secrets
- Configure proper CORS origins
- Set up SSL/HTTPS
- Use a process manager (PM2, systemd)
- Set up reverse proxy (Nginx)
- Configure MongoDB for production

## Getting Help

- Check the [README.md](./README.md) for overview
- Review [docs/](./docs/) for detailed documentation
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines
- Open an issue for bugs or questions

---

Happy coding! 🚀


