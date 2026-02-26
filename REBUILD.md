# How to Rebuild Development Build

## Option 1: Local Build (Recommended for Quick Testing)

### For iOS:
```bash
# Make sure you have Xcode installed
npx expo run:ios

# Or for a specific device:
npx expo run:ios --device

# To clean and rebuild:
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
npx expo run:ios
```

### For Android:
```bash
# Make sure you have Android Studio and Android SDK installed
npx expo run:android

# To clean and rebuild:
cd android
./gradlew clean
cd ..
npx expo run:android
```

## Option 2: EAS Build (Cloud Build - Recommended for Distribution)

### Prerequisites:
1. Install EAS CLI if not already installed:
   ```bash
   npm install -g eas-cli
   ```

2. Login to your Expo account:
   ```bash
   eas login
   ```

### Build Commands:

#### For iOS:
```bash
# Build for iOS development
eas build --profile development --platform ios

# Build for iOS device (requires Apple Developer account)
eas build --profile development --platform ios --local
```

#### For Android:
```bash
# Build for Android development
eas build --profile development --platform android

# Build locally (faster, but requires Android SDK)
eas build --profile development --platform android --local
```

#### For Both Platforms:
```bash
eas build --profile development --platform all
```

### After Building:

1. **Download the build:**
   - EAS will provide a download link after the build completes
   - Or check: https://expo.dev/accounts/[your-account]/projects/nfc-inventory-tracker/builds

2. **Install on iOS:**
   - Download the `.ipa` file
   - Install via Xcode, TestFlight, or direct install (if using free Apple ID)

3. **Install on Android:**
   - Download the `.apk` file
   - Transfer to your device and install
   - Or use: `adb install path/to/app.apk`

## Troubleshooting:

### If you get "No development build found":
1. Make sure `expo-dev-client` is in your dependencies
2. Rebuild the native app (development builds need native code)
3. Don't use Expo Go - development builds are separate apps

### If Metro bundler won't connect:
1. Make sure your device and computer are on the same Wi-Fi network
2. Check that the Metro bundler is running: `npx expo start`
3. Try restarting Metro: `npx expo start -c`

### Clean Build (if having issues):
```bash
# iOS
cd ios
rm -rf Pods Podfile.lock build
pod install
cd ..

# Android
cd android
./gradlew clean
rm -rf .gradle build app/build
cd ..

# Then rebuild
npx expo run:ios  # or npx expo run:android
```

## Quick Reference:

- **Local iOS build:** `npx expo run:ios`
- **Local Android build:** `npx expo run:android`
- **EAS iOS build:** `eas build --profile development --platform ios`
- **EAS Android build:** `eas build --profile development --platform android`
- **Start Metro:** `npx expo start`
- **Start with cleared cache:** `npx expo start -c`

