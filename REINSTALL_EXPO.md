# Reinstall Expo to Fix AppEntry Error

If you're getting an error that AppEntry doesn't exist or can't be found, follow these steps:

## Step 1: Remove node_modules and package-lock.json

```bash
cd /Users/zavala/nfc-inventory-tracker
rm -rf node_modules
rm -f package-lock.json
```

## Step 2: Clear all caches

```bash
# Clear Watchman cache
watchman watch-del-all

# Clear Expo and Metro caches
rm -rf .expo node_modules/.cache
```

## Step 3: Reinstall all dependencies

```bash
npm install
```

## Step 4: Verify AppEntry.js exists

```bash
ls -la node_modules/expo/AppEntry.js
```

You should see the file listed. If it exists, it should contain:
```javascript
import registerRootComponent from 'expo/src/launch/registerRootComponent';
import App from '../../App';
registerRootComponent(App);
```

## Step 5: Restart Metro with cleared cache

```bash
npx expo start -c
```

## If the error persists:

The AppEntry.js file imports from `../../App`, which should resolve to your root `App.js` file. Make sure:
1. `App.js` exists in the project root
2. The file is named exactly `App.js` (case-sensitive)
3. There are no syntax errors in `App.js`

## Alternative: Check if expo package is corrupted

If reinstalling doesn't work, try reinstalling just expo:

```bash
npm uninstall expo
npm install expo@~54.0.0
```

