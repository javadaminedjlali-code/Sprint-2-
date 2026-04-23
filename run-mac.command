#!/bin/bash
# Sprint 2 Course Registration System - macOS launcher
# Double-click this file to install dependencies (first run only) and start the server.

cd "$(dirname "$0")/backend" || exit 1

echo "================================================================"
echo "  Sprint 2 - Course Registration System"
echo "================================================================"
echo ""

# Check Node.js is installed
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed."
  echo ""
  echo "Please install the LTS version from https://nodejs.org"
  echo "then double-click this file again."
  echo ""
  read -p "Press enter to exit..."
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies for the first time..."
  echo "This takes about 30 seconds. Please wait."
  echo ""
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] npm install failed. See messages above."
    read -p "Press enter to exit..."
    exit 1
  fi
  echo ""
  echo "Dependencies installed."
  echo ""
fi

echo "Starting server..."
echo ""
echo "Your browser will open automatically in a few seconds."
echo ""
echo "Login credentials:"
echo "  Student:    student1 / password123"
echo "  Professor:  prof2    / password123"
echo ""
echo "Press Ctrl+C in this window to stop the server."
echo "================================================================"
echo ""

# Open the browser after a short delay so the server has time to start
(sleep 3 && open http://localhost:3000) &

# Start server (blocks until Ctrl+C)
npm start
