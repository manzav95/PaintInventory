# Running the App on Web (Laptop/Dashboard View)

## Quick Start

1. **Start the backend server** (if not already running):
   ```bash
   cd server
   npm start
   ```

2. **Start the Expo app with web support**:
   ```bash
   yarn web
   # or
   npm run web
   ```

   This will:
   - Start the Metro bundler
   - Open your default web browser automatically
   - Or you can manually open `http://localhost:8081` in your browser

## Alternative: Using Expo Start Menu

1. **Start Expo normally**:
   ```bash
   yarn start
   # or
   npm start
   ```

2. **Press `w`** in the terminal to open in web browser

## Web-Specific Considerations

### What Works on Web:
- ✅ Viewing inventory list
- ✅ Searching items
- ✅ Adding items manually (if admin)
- ✅ Editing items (if admin)
- ✅ Dark mode toggle
- ✅ Settings
- ✅ All data operations (connected to API)

### What May Not Work on Web:
- ⚠️ **QR Code Scanning**: Camera access works differently on web. You may need to use the manual text input option instead.
- ⚠️ **NFC**: Not available on web browsers

### For Dashboard/Viewing Purposes:
The web version is perfect for:
- Large screen viewing
- Dashboard displays
- Quick inventory checks
- Admin management tasks

## Tips for Better Dashboard Experience

1. **Use Full Screen**: Press F11 to go fullscreen in your browser
2. **Multiple Tabs**: Open multiple tabs for different views
3. **Browser Zoom**: Adjust browser zoom (Cmd/Ctrl + +/-) for optimal viewing
4. **Window Size**: Resize your browser window to your preferred dashboard size

## Troubleshooting

If the web version doesn't start:
1. Make sure you have `react-native-web` installed (should be automatic with Expo)
2. Clear cache: `yarn start -c` or `npm start -- --clear`
3. Check that port 8081 is not in use

