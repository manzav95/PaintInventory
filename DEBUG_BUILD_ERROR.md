# How to Find the Exact Build Error

The "PhaseScriptExecution failed" error is generic. To find the actual error:

## Step 1: View the Build Log in Xcode

1. In Xcode, go to **View → Navigators → Show Report Navigator** (or press **Cmd + 9**)
2. Click on the **latest build** (it will have a red X icon)
3. Look for the **red error** in the list
4. **Click on the error** to expand it
5. Look for the script name that failed, such as:
   - `Bundle React Native code and images`
   - `[CP] Check Pods Manifest.lock`
   - `[Expo] Configure project`
   - `[CP] Embed Pods Frameworks`

## Step 2: See the Actual Error Message

1. In the build log, scroll down to find the **actual error message**
2. It will show something like:
   - `error: command not found: node`
   - `error: The sandbox is not in sync with the Podfile.lock`
   - `error: Cannot find module...`
   - etc.

## Step 3: Common Errors and Fixes

### Error: "command not found: node" or "NODE_BINARY not found"

**Fix:**
```bash
# Find your Node.js path
which node

# Update .xcode.env.local (replace with your actual path)
echo 'export NODE_BINARY=$(which node)' > /Users/zavala/nfc-inventory-tracker/ios/.xcode.env.local

# If using nvm, use this instead:
cat > /Users/zavala/nfc-inventory-tracker/ios/.xcode.env.local << 'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export NODE_BINARY=$(which node)
EOF
```

### Error: "The sandbox is not in sync with the Podfile.lock"

**Fix:**
```bash
cd ios
pod install
cd ..
```

### Error: "Cannot find module" or missing dependencies

**Fix:**
```bash
# Clean and reinstall
rm -rf node_modules
npm install  # or yarn install
cd ios
pod install
cd ..
```

### Error: Permission denied

**Fix:**
```bash
# Make scripts executable
chmod +x ios/Pods/Target\ Support\ Files/Pods-PaintInventoryTracker/*.sh
```

## Step 4: Complete Clean Build

If you're still not sure, do a complete clean:

```bash
# Clean everything
cd ios
rm -rf Pods Podfile.lock build
cd ..
rm -rf node_modules
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Reinstall
npm install  # or yarn install
cd ios
pod install
cd ..

# In Xcode:
# 1. Close Xcode completely (Cmd + Q)
# 2. Reopen: open ios/PaintInventoryTracker.xcworkspace
# 3. Product → Clean Build Folder (Shift + Cmd + K)
# 4. Try building again
```

## Share the Exact Error

Once you find the exact error message from the build log, share it and I can provide a more specific fix!

