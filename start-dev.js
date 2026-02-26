#!/usr/bin/env node

/**
 * Development script to start both backend server and Expo app
 * Usage: node start-dev.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Paint Inventory Tracker Development Environment...\n');

// Start backend server
console.log('📡 Starting backend server...');
const server = spawn('npm', ['start'], {
  cwd: path.join(__dirname, 'server'),
  stdio: 'inherit',
  shell: true,
});

server.on('error', (err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

// Wait a bit for server to start, then start Expo
setTimeout(() => {
  console.log('\n📱 Starting Expo app...');
  // Use yarn if available, otherwise fall back to npm
  const packageManager = require('fs').existsSync(path.join(__dirname, 'yarn.lock')) ? 'yarn' : 'npm';
  const expo = spawn(packageManager, ['start'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
  });

  expo.on('error', (err) => {
    console.error('❌ Failed to start Expo:', err);
    process.exit(1);
  });

  // Handle cleanup
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...');
    server.kill();
    expo.kill();
    process.exit(0);
  });
}, 2000);

