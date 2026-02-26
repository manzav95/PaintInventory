#!/bin/bash

# Start both backend server and Expo app
# Usage: ./start-dev.sh

echo "🚀 Starting Paint Inventory Tracker Development Environment..."
echo ""

# Start backend server in background
echo "📡 Starting backend server..."
cd server
npm start &
SERVER_PID=$!
cd ..

# Wait for server to start
sleep 3

# Start Expo app (use yarn if available, otherwise npm)
echo "📱 Starting Expo app..."
if [ -f "yarn.lock" ]; then
    yarn start &
else
    npm start &
fi
EXPO_PID=$!

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $SERVER_PID 2>/dev/null
    kill $EXPO_PID 2>/dev/null
    exit 0
}

# Trap SIGINT (Ctrl+C) and cleanup
trap cleanup SIGINT

# Wait for processes
wait

