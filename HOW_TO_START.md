# How to Start Both App and Server

You have several options to start both the app and server together:

## Option 1: Using the Node.js Script (Recommended)

```bash
npm run start:all
```

Or if you're using yarn:
```bash
yarn start:all
```

This will:
1. Start the backend server (using npm in the server folder)
2. Wait 2 seconds for the server to start
3. Start the Expo app (using yarn if `yarn.lock` exists, otherwise npm)

## Option 2: Using the Shell Script

```bash
chmod +x start-dev.sh
./start-dev.sh
```

This does the same thing but uses a bash script.

## Option 3: Manual (Two Terminals)

**Terminal 1 - Start Server:**
```bash
cd server
npm install  # First time only
npm start
```

**Terminal 2 - Start App:**
```bash
yarn start
# or
npm start
```

## Option 4: Using a Process Manager (Advanced)

If you want more control, you can use `concurrently`:

```bash
# Install concurrently globally
npm install -g concurrently

# Then run:
concurrently "cd server && npm start" "yarn start"
```

## Stopping

- **If using Option 1 or 2:** Press `Ctrl+C` to stop both processes
- **If using Option 3:** Press `Ctrl+C` in each terminal
- **If using Option 4:** Press `Ctrl+C` once

## Troubleshooting

1. **Server won't start:**
   - Make sure you've installed server dependencies: `cd server && npm install`
   - Check if port 3000 is already in use

2. **App can't connect to server:**
   - Verify server is running: Open `http://localhost:3000/api/health` in browser
   - Check `config.js` has the correct IP address
   - For iPhone testing, use your Mac's IP address, not `localhost`

3. **Port conflicts:**
   - Server uses port 3000 by default
   - Metro bundler uses port 8081 by default
   - Change server port in `server/server.js` if needed

