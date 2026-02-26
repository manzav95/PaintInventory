# Quick Fix for "PhaseScriptExecution failed"

This error means a build script failed. Here's the fastest way to fix it:

## Step 1: Update Node.js Path (Most Common Fix)

I've updated your `.xcode.env.local` file to properly find Node.js with nvm.

**Verify it works:**
```bash
cd /Users/zavala/nfc-inventory-tracker/ios
source .xcode.env.local
echo $NODE_BINARY
# Should show: /Users/zavala/.nvm/versions/node/v20.19.4/bin/node
```

## Step 2: Clean and Rebuild

```bash
# Clean Xcode cache
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Clean iOS build
cd /Users/zavala/nfc-inventory-tracker/ios
rm -rf build Pods Podfile.lock
pod install
cd ..
```

## Step 3: In Xcode

1. **Close Xcode completely** (Cmd + Q)
2. **Reopen:**
   ```bash
   open ios/PaintInventoryTracker.xcworkspace
   ```
3. **Clean Build Folder:** Product → Clean Build Folder (Shift + Cmd + K)
4. **Try building again**

## Step 4: If Still Failing - Find the Exact Error

1. In Xcode: **View → Navigators → Show Report Navigator** (Cmd + 9)
2. Click the **latest build** (red X icon)
3. Find the **red error** and click it
4. Look for which script failed:
   - `Bundle React Native code and images` → Node.js issue
   - `[CP] Check Pods Manifest.lock` → Run `pod install`
   - `[Expo] Configure project` → Dependencies issue
5. **Share the exact error message** and I can help fix it!

## Alternative: Use Absolute Node Path

If the above doesn't work, try this in Terminal:

```bash
# Find your exact node path
which node

# Then update .xcode.env.local with the absolute path:
echo 'export NODE_BINARY=/Users/zavala/.nvm/versions/node/v20.19.4/bin/node' > /Users/zavala/nfc-inventory-tracker/ios/.xcode.env.local
```

Replace the path with what `which node` shows you.

