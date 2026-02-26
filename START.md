# How to Start the Development Build

You need to run **two things**:
1. The backend server (handles database and API)
2. The Expo app (the mobile app)

## Option 1: Start Both Together (Easiest)

```bash
npm run start:all
```

This starts both the backend server and Expo app in one command.

**Or use the shell script:**
```bash
./start-dev.sh
```

## Option 2: Two Separate Terminals (Recommended for Debugging)

### Terminal 1: Start Backend Server
```bash
cd server
npm install  # Only needed first time
npm start
```

You should see:
```
Connected to SQLite database
Paint Inventory API server running on http://0.0.0.0:3000
```

### Terminal 2: Start Expo App
```bash
# In the project root (nfc-inventory-tracker folder)
npm start
# or
npx expo start
```

Then:
- Press `i` to open in iOS simulator
- Press `a` to open in Android emulator
- Scan the QR code with Expo Go app on your phone
- Or press `w` to open in web browser

## Important Notes

1. **Server must be running first** - The app needs the API to work
2. **Check your IP address** - Make sure `config.js` has the correct server IP
   - Find your Mac's IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - Update `config.js`: `const API_URL = 'http://YOUR_IP:3000';`
3. **Same Wi-Fi network** - Your phone and Mac must be on the same network
4. **Port 3000** - Make sure nothing else is using port 3000

## Testing the Server

**Test the root endpoint:**
- Open browser: `http://10.0.0.232:3000/`
- Should show API information and available endpoints

**Test the health endpoint:**
- Open browser: `http://10.0.0.232:3000/api/health`
- Should show: `{"status":"ok","timestamp":"..."}`

## Troubleshooting

**"Cannot GET /" when accessing root**
- This is normal! The root `/` now shows API info
- Use `/api/health` for the health check endpoint

**"Cannot connect to server"**
- Make sure backend is running
- Check IP address in `config.js` matches your Mac's IP
- Try accessing `http://YOUR_IP:3000/api/health` in a browser
- Make sure you're using `/api/health` not just `/`

**"Port 3000 already in use"**
- Find what's using it: `lsof -i :3000`
- Kill it: `kill -9 <PID>`
- Or change port in `server/server.js`

**Metro bundler errors**
- Clear cache: `npx expo start -c`
- Delete `.expo` folder and restart

