#!/bin/bash

# Fix PrivacyInfo.xcprivacy Missing File Error
# This error occurs when CocoaPods can't find privacy manifest files

echo "🔧 Fixing PrivacyInfo.xcprivacy error..."

# Step 1: Clean iOS build
echo "🧹 Cleaning iOS build artifacts..."
cd ios
rm -rf build Pods Podfile.lock
cd ..

# Step 2: Clean node_modules (optional but recommended)
echo "📦 Reinstalling node modules..."
rm -rf node_modules
if [ -f "yarn.lock" ]; then
    echo "Using Yarn..."
    yarn install
else
    echo "Using npm..."
    npm install
fi

# Step 3: Reinstall CocoaPods
echo "📱 Reinstalling CocoaPods dependencies..."
cd ios
pod deintegrate 2>/dev/null || true
pod install --repo-update
cd ..

# Step 4: Clean Xcode derived data
echo "🗑️  Cleaning Xcode derived data..."
rm -rf ~/Library/Developer/Xcode/DerivedData/*

echo "✅ Done! Now try:"
echo "   1. Close Xcode completely"
echo "   2. Open: open ios/PaintInventoryTracker.xcworkspace"
echo "   3. Product → Clean Build Folder (Shift + Cmd + K)"
echo "   4. Try building again"

