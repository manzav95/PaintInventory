# Quick Start Guide

## Starting the App (Easiest Method)

### Option 1: Start Everything at Once (Recommended)

Open Terminal and run:
```bash
cd /Users/zavala/nfc-inventory-tracker
npm run start:all
```

Or if using yarn:
```bash
cd /Users/zavala/nfc-inventory-tracker
yarn start:all
```

This will:
1. Start the backend server on port 3000
2. Start the Expo app (Metro bundler on port 8081)
3. Open automatically in your browser or show QR code for mobile

### Option 2: Start Separately (Two Terminals)

**Terminal 1 - Start Backend Server:**
```bash
cd /Users/zavala/nfc-inventory-tracker/server
npm start
```

Wait until you see: `Paint Inventory API server running on http://0.0.0.0:3000`

**Terminal 2 - Start App:**
```bash
cd /Users/zavala/nfc-inventory-tracker
yarn start
# or
npm start
```

## Accessing the App

### On Web (Browser):
- Open: `http://localhost:8080` or `http://localhost:19006`
- The app will automatically use `localhost:3000` for the API

### On iPhone/iPad:
1. Make sure your phone is on the same WiFi network
2. Scan the QR code shown in Terminal
3. Or open Expo Go app and enter the connection URL

### On Android:
1. Make sure your phone is on the same WiFi network
2. Scan the QR code shown in Terminal
3. Or open Expo Go app and enter the connection URL

## First Time Setup

1. **Login Screen**: Enter your name (or `admin123` for admin access)
2. **Add Items**: Click "Add Item Manually" (admin only) or scan QR codes
3. **View Inventory**: Click "View Inventory" to see all items

## Important Notes

- **IP Address**: If using mobile devices, make sure `config.js` has your computer's current IP address
- **Server Must Be Running**: The app needs the backend server running to save/load data
- **Same Network**: Mobile devices must be on the same WiFi network as your computer

## Troubleshooting

**Can't connect to server?**
- Check server is running: Visit `http://localhost:3000/api/health` in browser
- Update IP in `config.js` if using mobile devices
- Make sure both devices are on the same WiFi network

**No data showing?**
- Check browser console (F12) for errors
- Verify server is running and accessible
- Try refreshing the page

**Port already in use?**
- Server uses port 3000
- Metro bundler uses port 8081
- Close other apps using these ports

