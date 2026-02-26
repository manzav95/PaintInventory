# Fixing iOS Build Errors

## PrivacyInfo.xcprivacy Missing File Error

**Error:** `lstat(/Users/zavala/nfc-inventory-tracker/node_modules/expo/node_modules/expo-file-system/ios/PrivacyInfo.xcprivacy): No such file or directory`

**Solution:**
This is a common issue with Expo SDK 54. Run this fix script:

```bash
./fix-privacy-manifest.sh
```

Or manually:
```bash
# Clean everything
cd ios
rm -rf Pods Podfile.lock build
cd ..
rm -rf node_modules

# Reinstall
npm install  # or yarn install
cd ios
pod install --repo-update
cd ..

# Clean Xcode
rm -rf ~/Library/Developer/Xcode/DerivedData/*
```

Then in Xcode:
1. Close Xcode completely
2. Reopen: `open ios/PaintInventoryTracker.xcworkspace`
3. Product → Clean Build Folder (Shift + Cmd + K)
4. Try building again

## Common Build Errors and Solutions

### 1. Signing/Certificate Errors

**Error:** "No code signing certificates available" or "Signing for 'PaintInventoryTracker' requires a development team"

**Solution:**
1. In Xcode, select the **PaintInventoryTracker** project (blue icon)
2. Select the **PaintInventoryTracker** target
3. Go to **Signing & Capabilities** tab
4. Uncheck "Automatically manage signing" temporarily
5. Check it again and select your Apple ID from the Team dropdown
6. If your Apple ID isn't listed, click "Add Account..." and sign in
7. The Bundle Identifier might need to be changed to something unique like:
   - `com.yourname.paintinventorytracker` (replace "yourname" with your name/username)

### 2. Pod Installation Issues

**Error:** "No such module" or CocoaPods errors

**Solution:**
```bash
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
```

### 3. Bundle Identifier Conflicts

**Error:** "Bundle identifier is already in use" or signing conflicts

**Solution:**
1. In Xcode, go to Signing & Capabilities
2. Change the Bundle Identifier to something unique:
   - Example: `com.yourname.paintinventorytracker`
   - Make sure it matches your Apple ID's capabilities

### 4. Clean Build Issues

**Error:** Build fails with cached errors

**Solution:**
```bash
# Clean everything
cd ios
rm -rf build Pods Podfile.lock
pod install
cd ..

# In Xcode:
# Product → Clean Build Folder (Shift + Cmd + K)
# Then rebuild
```

### 5. Deployment Target Mismatch

**Error:** "iPhone deployment target" errors

**Solution:**
- The project is set to iOS 15.1 minimum
- Make sure your iPhone is running iOS 15.1 or later
- Check in Xcode: Target → General → Minimum Deployments

### 6. Missing Dependencies

**Error:** Module not found or missing files

**Solution:**
```bash
# Reinstall node modules
rm -rf node_modules
npm install
# or
yarn install

# Reinstall pods
cd ios
pod install
cd ..
```

### 7. Xcode Cache Issues

**Error:** Strange build errors that don't make sense

**Solution:**
```bash
# Clean Xcode derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Clean build folder in Xcode
# Product → Clean Build Folder (Shift + Cmd + K)
```

## Quick Fix Script

Run this to fix most common issues:

```bash
# From project root
cd ios
rm -rf Pods Podfile.lock build
cd ..
rm -rf node_modules
npm install
cd ios
pod install
cd ..
```

Then in Xcode:
1. Product → Clean Build Folder (Shift + Cmd + K)
2. Close and reopen Xcode
3. Try building again

## Step-by-Step Build Process

1. **Open Xcode:**
   ```bash
   open ios/PaintInventoryTracker.xcworkspace
   ```

2. **Select your iPhone** as the build target (top toolbar)

3. **Fix Signing:**
   - Click PaintInventoryTracker project (blue icon)
   - Select PaintInventoryTracker target
   - Signing & Capabilities tab
   - Check "Automatically manage signing"
   - Select your Apple ID team
   - Change Bundle Identifier if needed (make it unique)

4. **Build:**
   - Click Play button (▶️) or Cmd + R
   - Wait for build to complete

5. **If build fails:**
   - Check the error message in Xcode
   - Look at the specific error in the Issue Navigator (left sidebar)
   - Follow the solutions above based on the error type

## Getting More Help

If you're still having issues, please share:
1. The exact error message from Xcode
2. Which step it fails at (building, signing, installing)
3. Your Xcode version
4. Your iPhone iOS version

