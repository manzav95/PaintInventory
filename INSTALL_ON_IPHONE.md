# How to Install Paint Inventory Tracker on iPhone

## Prerequisites
- Mac with Xcode installed (free from Mac App Store)
- iPhone connected to your Mac via USB cable
- Both devices on the same WiFi network (for the backend server)
- Free Apple ID (no paid developer account needed)

## Step-by-Step Instructions

### 1. Open the Project in Xcode

```bash
cd /Users/zavala/nfc-inventory-tracker
open ios/PaintInventoryTracker.xcworkspace
```

**Important:** Always open the `.xcworkspace` file, NOT the `.xcodeproj` file!

### 2. Connect Your iPhone

1. Connect your iPhone to your Mac using a USB cable
2. Unlock your iPhone
3. If prompted, tap "Trust This Computer" on your iPhone

### 3. Select Your iPhone as the Build Target

1. In Xcode, look at the top toolbar
2. Click on the device selector (next to the Play button)
3. Select your iPhone from the list of devices

### 4. Configure Signing (Free Apple ID)

1. In Xcode, click on **"PaintInventoryTracker"** in the left sidebar (blue icon at the top)
2. Select the **"PaintInventoryTracker"** target (under TARGETS)
3. Click on the **"Signing & Capabilities"** tab
4. Check **"Automatically manage signing"**
5. Under **"Team"**, select your Apple ID
   - If you don't see your Apple ID, click "Add Account..." and sign in
   - This is FREE - you don't need a paid developer account

### 5. Update Bundle Identifier (if needed)

If you get a signing error:
1. In the same "Signing & Capabilities" tab
2. Change the **Bundle Identifier** to something unique like:
   - `com.yourname.paintinventorytracker`
   - Make sure it's unique to your Apple ID

### 6. Build and Install

1. Click the **Play button** (▶️) in the top-left of Xcode, OR
2. Press `Cmd + R` on your keyboard
3. Xcode will:
   - Build the app (this may take a few minutes the first time)
   - Install it on your iPhone
   - Launch it automatically

### 7. Trust the Developer Certificate (First Time Only)

On your iPhone:
1. Go to **Settings** → **General** → **VPN & Device Management** (or **Profiles & Device Management**)
2. Tap on your Apple ID under "Developer App"
3. Tap **"Trust [Your Apple ID]"**
4. Tap **"Trust"** in the popup
5. Return to the home screen and open the app

### 8. Configure the App

1. Make sure your backend server is running:
   ```bash
   cd server
   npm start
   ```

2. Update `config.js` with your Mac's IP address:
   - Find your Mac's IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - Update the IP in `config.js` (line 23)

3. Open the app on your iPhone
4. The app should connect to your backend server automatically

## Troubleshooting

### "No code signing certificates available"
- Make sure you've selected your Apple ID in Xcode's Signing & Capabilities
- Try clicking "Download Manual Profiles" in Xcode

### "Unable to install app"
- Make sure your iPhone is unlocked
- Check that you've trusted the computer on your iPhone
- Make sure both devices are on the same WiFi network

### "App installation failed"
- Try cleaning the build: In Xcode, go to **Product** → **Clean Build Folder** (Shift + Cmd + K)
- Then rebuild: **Product** → **Build** (Cmd + B)
- Try again

### App crashes on launch
- Make sure the backend server is running
- Check that the IP address in `config.js` is correct
- Check Xcode console for error messages

### Camera doesn't work
- The native app should have full camera access
- If it doesn't work, check Settings → Privacy → Camera on your iPhone
- Make sure "Paint Inventory Tracker" has camera permission

## Alternative: Using Expo Development Build

If Xcode installation doesn't work, you can also use Expo's development build:

```bash
# Install Expo Go on your iPhone from the App Store
# Then run:
npx expo start --dev-client
# Scan the QR code with your iPhone camera
```

However, the Xcode method gives you the full native app with all features.

## Notes

- The app will expire after 7 days (free Apple ID limitation)
- To keep it working, rebuild and reinstall every 7 days, OR
- Upgrade to a paid Apple Developer account ($99/year) for apps that don't expire

