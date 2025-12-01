#!/bin/bash

# Development startup script for Digital Meeting Assistant
# This script starts both backend and frontend development servers

echo "🚀 Starting Digital Meeting Assistant in development mode..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if MongoDB is running (optional check)
if ! pgrep -x "mongod" > /dev/null; then
    echo "${YELLOW}⚠️  Warning: MongoDB doesn't appear to be running.${NC}"
    echo "   Make sure MongoDB is running or using a cloud instance."
fi

# Start backend server
echo ""
echo "${BLUE}📦 Starting backend server...${NC}"
cd backend

# Check if .env exists
if [ ! -f .env ]; then
    echo "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "${GREEN}✓ Created .env file. Please update it with your configuration.${NC}"
    else
        echo "${YELLOW}⚠️  .env.example not found. Please create .env manually.${NC}"
    fi
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Start backend in background
npm run dev &
BACKEND_PID=$!
echo "${GREEN}✓ Backend server started (PID: $BACKEND_PID)${NC}"
echo "   Backend running on http://localhost:3000"

# Wait a bit for backend to start
sleep 3

# Start frontend server
echo ""
echo "${BLUE}📦 Starting frontend server...${NC}"
cd ../frontend

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Start frontend
npm run dev &
FRONTEND_PID=$!
echo "${GREEN}✓ Frontend server started (PID: $FRONTEND_PID)${NC}"
echo "   Frontend running on http://localhost:5173"

echo ""
echo "${GREEN}✅ Development servers started successfully!${NC}"
echo ""
echo "Backend:  http://localhost:3000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for user interrupt
trap "echo ''; echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# Keep script running
wait
