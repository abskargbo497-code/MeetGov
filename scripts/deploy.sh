#!/bin/bash

# Deployment script for Digital Meeting Assistant
# This script builds and prepares the application for production deployment

echo "🚀 Deploying Digital Meeting Assistant..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check environment
if [ -z "$NODE_ENV" ]; then
    export NODE_ENV=production
    echo "${YELLOW}⚠️  NODE_ENV not set, defaulting to production${NC}"
fi

echo ""
echo "${BLUE}📦 Building frontend...${NC}"
cd frontend

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Build frontend
npm run build

if [ $? -ne 0 ]; then
    echo "${RED}❌ Frontend build failed!${NC}"
    exit 1
fi

echo "${GREEN}✓ Frontend built successfully${NC}"

echo ""
echo "${BLUE}📦 Preparing backend...${NC}"
cd ../backend

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install --production
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "${RED}❌ .env file not found in backend directory!${NC}"
    echo "   Please create .env file with production configuration."
    exit 1
fi

echo "${GREEN}✓ Backend prepared${NC}"

echo ""
echo "${GREEN}✅ Deployment preparation complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Review backend/.env configuration"
echo "2. Ensure MongoDB is accessible"
echo "3. Start the backend server: cd backend && npm start"
echo "4. Serve the frontend build from frontend/dist"
echo ""
echo "For production deployment:"
echo "- Use a process manager like PM2: pm2 start backend/src/server.js"
echo "- Use a reverse proxy like Nginx for frontend"
echo "- Set up SSL certificates"
echo "- Configure environment variables securely"
