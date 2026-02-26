#!/bin/bash

# Fix "Internal inconsistency error: never received target ended message"
# This is an Xcode/CocoaPods build system error

echo "🔧 Fixing Xcode internal inconsistency error..."

# Step 1: Clean Xcode derived data
echo "🧹 Cleaning Xcode derived data..."
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Step 2: Clean CocoaPods
echo "📱 Cleaning CocoaPods..."
cd ios
rm -rf Pods Podfile.lock build
pod cache clean --all 2>/dev/null || true
cd ..

# Step 3: Clean node modules (optional but recommended)
echo "📦 Cleaning node modules..."
rm -rf node_modules

# Step 4: Reinstall
echo "📥 Reinstalling dependencies..."
if [ -f "yarn.lock" ]; then
    yarn install
else
    npm install
fi

# Step 5: Reinstall pods
echo "📱 Reinstalling CocoaPods..."
cd ios
pod deintegrate 2>/dev/null || true
pod install --repo-update
cd ..

echo "✅ Done! Now:"
echo "   1. Close Xcode completely (Cmd + Q)"
echo "   2. Wait 5 seconds"
echo "   3. Open: open ios/PaintInventoryTracker.xcworkspace"
echo "   4. Product → Clean Build Folder (Shift + Cmd + K)"
echo "   5. In Xcode: File → Workspace Settings → Build System → Legacy Build System (if available)"
echo "   6. Or: Xcode → Settings → Locations → Derived Data → click arrow, delete all"
echo "   7. Try building again"

