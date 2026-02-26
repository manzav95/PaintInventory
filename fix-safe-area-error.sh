#!/bin/bash

# Fix react-native-safe-area-context compilation error
# Error: No member named 'unit' in 'facebook::yoga::StyleLength'

echo "🔧 Fixing react-native-safe-area-context compilation error..."

# Step 1: Clean everything
echo "🧹 Cleaning build artifacts..."
cd ios
rm -rf build Pods Podfile.lock
cd ..
rm -rf node_modules

# Step 2: Reinstall node modules
echo "📦 Reinstalling node modules..."
if [ -f "yarn.lock" ]; then
    yarn install
else
    npm install
fi

# Step 3: Clean Xcode derived data
echo "🗑️  Cleaning Xcode derived data..."
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Step 4: Reinstall pods with clean cache
echo "📱 Reinstalling CocoaPods..."
cd ios
pod cache clean --all 2>/dev/null || true
pod deintegrate 2>/dev/null || true
pod install --repo-update
cd ..

echo "✅ Done! Now:"
echo "   1. Close Xcode completely (Cmd + Q)"
echo "   2. Open: open ios/PaintInventoryTracker.xcworkspace"
echo "   3. Product → Clean Build Folder (Shift + Cmd + K)"
echo "   4. Try building again"
echo ""
echo "If it still fails, try disabling New Architecture:"
echo "   - In Info.plist, set RCTNewArchEnabled to false"
echo "   - Or in Xcode: Build Settings → search 'New Architecture' → set to NO"

