# Fix AsyncStorage Native Module Error

The error `AsyncStorage is null` means the native module isn't properly linked. You need to rebuild the native app.

## Quick Fix:

### For iOS:
```bash
# 1. Navigate to ios folder
cd ios

# 2. Clean and reinstall pods
rm -rf Pods Podfile.lock
pod install

# 3. Go back to root
cd ..

# 4. Rebuild the app
npx expo run:ios
```

### For Android:
```bash
# 1. Navigate to android folder
cd android

# 2. Clean gradle
./gradlew clean

# 3. Go back to root
cd ..

# 4. Rebuild the app
npx expo run:android
```

## Alternative: Use npx expo prebuild

If the above doesn't work, regenerate native folders:

```bash
# Remove existing native folders (optional, backup first!)
# rm -rf ios android

# Regenerate native code
npx expo prebuild --clean

# Then rebuild
npx expo run:ios  # or npx expo run:android
```

## After Rebuilding:

1. **Start Metro bundler:**
   ```bash
   npx expo start
   ```

2. **Open the rebuilt app** (not Expo Go - use your development build)

3. The AsyncStorage error should be gone!

## Why This Happens:

- Native modules like AsyncStorage need to be compiled into the native app
- If you added AsyncStorage after building, or if the build is outdated, you need to rebuild
- Development builds need to be rebuilt whenever you add/change native dependencies

## Note:

If you're using **Expo Go**, AsyncStorage should work without rebuilding. But if you're using a **development build**, you must rebuild after adding native modules.

