#!/bin/bash

# Fix iOS Build Issues Script
# This script fixes common iOS build problems

echo "🔧 Fixing iOS build issues..."

# Step 1: Clean node modules
echo "📦 Cleaning node modules..."
rm -rf node_modules
if [ -f "yarn.lock" ]; then
    echo "Using Yarn..."
    yarn install
else
    echo "Using npm..."
    npm install
fi

# Step 2: Clean iOS build artifacts
echo "🧹 Cleaning iOS build artifacts..."
cd ios
rm -rf build Pods Podfile.lock

# Step 3: Reinstall CocoaPods
echo "📱 Reinstalling CocoaPods..."
if command -v pod &> /dev/null; then
    pod install
else
    echo "⚠️  CocoaPods not found. Installing..."
    sudo gem install cocoapods
    pod install
fi

cd ..

# Step 4: Clean Xcode derived data (optional, commented out by default)
# echo "🗑️  Cleaning Xcode derived data..."
# rm -rf ~/Library/Developer/Xcode/DerivedData

echo "✅ Done! Now try building in Xcode:"
echo "   1. Open: open ios/PaintInventoryTracker.xcworkspace"
echo "   2. Select your iPhone as the build target"
echo "   3. Go to Signing & Capabilities"
echo "   4. Select your Apple ID team"
echo "   5. Change Bundle Identifier if needed (make it unique)"
echo "   6. Click Play button (▶️) to build"

