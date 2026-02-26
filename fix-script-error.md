# Fix "PhaseScriptExecution failed" Error

This error means one of Xcode's build scripts failed. To find the exact error:

## Step 1: See the Full Error Message

1. In Xcode, look at the **Issue Navigator** (left sidebar, icon with exclamation mark)
2. Click on the red error
3. Expand the error details to see which script failed
4. Look at the **Build Log** (View → Navigators → Show Report Navigator, then click on the latest build)

The error will show something like:
- `Bundle React Native code and images` failed
- `[CP] Check Pods Manifest.lock` failed
- `[Expo] Configure project` failed
- etc.

## Step 2: Common Fixes

### If it's "Bundle React Native code and images":

**Problem:** Node.js not found or wrong path

**Fix:**
```bash
# Check if Node.js is installed
which node
node --version

# If not found, install Node.js 20+
# Then create/update .xcode.env file:
cd /Users/zavala/nfc-inventory-tracker/ios
echo 'export NODE_BINARY=$(command -v node)' > .xcode.env
```

### If it's "[CP] Check Pods Manifest.lock":

**Problem:** Podfile.lock out of sync

**Fix:**
```bash
cd ios
pod install
cd ..
```

### If it's "[Expo] Configure project":

**Problem:** Expo configuration script failed

**Fix:**
```bash
# Clean and reinstall
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..

# Make sure node_modules are installed
npm install  # or yarn install
```

### If it's a permission error:

**Fix:**
```bash
# Make scripts executable
chmod +x ios/Pods/Target\ Support\ Files/Pods-PaintInventoryTracker/*.sh
```

## Step 3: General Clean Build

If you're not sure which script failed, try a complete clean:

```bash
# Clean everything
cd ios
rm -rf build Pods Podfile.lock
cd ..
rm -rf node_modules

# Reinstall
npm install  # or yarn install
cd ios
pod install
cd ..

# Clean Xcode
rm -rf ~/Library/Developer/Xcode/DerivedData/*
```

Then in Xcode:
1. Product → Clean Build Folder (Shift + Cmd + K)
2. Close and reopen Xcode
3. Try building again

## Step 4: Check Node.js Path

The most common issue is Xcode can't find Node.js. Create/update the `.xcode.env` file:

```bash
cd /Users/zavala/nfc-inventory-tracker/ios
echo 'export NODE_BINARY=$(command -v node)' > .xcode.env
cat .xcode.env  # Should show: export NODE_BINARY=/path/to/node
```

Make sure the path is correct. If you're using `nvm`, you might need:
```bash
echo 'export NODE_BINARY=$(which node)' > .xcode.env
```

