# Fix Xcode Sandbox Error

**Error:** `Sandbox: bash(20999) deny(1) file-write-create /Users/zavala/Library/Developer/Xcode/DerivedData/.../ip.txt`

This is a macOS security sandbox issue preventing Xcode from writing build files.

## Solution 1: Disable User Script Sandboxing (Recommended)

1. In Xcode, select the **PaintInventoryTracker** project (blue icon)
2. Select the **PaintInventoryTracker** target
3. Go to **Build Settings** tab
4. Search for "User Script Sandboxing"
5. Set **"Enable User Script Sandboxing"** to **NO**

This allows build scripts to write files during the build process.

## Solution 2: Clean DerivedData

```bash
# Clean Xcode derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Then in Xcode:
# Product → Clean Build Folder (Shift + Cmd + K)
```

## Solution 3: Grant Full Disk Access to Xcode

1. Open **System Settings** (or System Preferences on older macOS)
2. Go to **Privacy & Security** → **Full Disk Access**
3. Click the **+** button
4. Navigate to `/Applications/Xcode.app` and add it
5. Make sure the checkbox is enabled
6. Restart Xcode

## Solution 4: Check Xcode Permissions

1. **System Settings** → **Privacy & Security** → **Developer Tools**
2. Make sure **Xcode** is listed and enabled
3. If not, add it manually

## After Fixing

1. Close Xcode completely (Cmd + Q)
2. Reopen: `open ios/PaintInventoryTracker.xcworkspace`
3. Product → Clean Build Folder (Shift + Cmd + K)
4. Try building again

