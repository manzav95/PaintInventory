# Fix Metro "None of these files exist" Error for Server Folder

This error means Metro is trying to access files in the `server/` folder, which should be completely excluded.

## Complete Fix Steps:

### 1. Stop Metro Bundler
Press `Ctrl+C` to stop any running Metro instance.

### 2. Clear Watchman Cache (Important!)
Watchman might be watching the server folder. Clear its cache:

```bash
watchman watch-del-all
```

If you don't have watchman installed, you can skip this step, but it's recommended:
```bash
brew install watchman  # macOS
```

### 3. Clear All Metro and Expo Caches

```bash
# Clear Metro cache
rm -rf node_modules/.cache

# Clear Expo cache
rm -rf .expo

# Clear Metro bundler cache
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-*
```

### 4. Restart Metro with Clean Cache

```bash
npx expo start -c
```

The `-c` flag clears the cache.

## If Error Persists:

### Option A: Move Server Folder Temporarily

If nothing else works, temporarily move the server folder outside the project:

```bash
# Move server folder outside project
mv server ../server-backup

# Start Metro
npx expo start -c

# After testing, move it back
mv ../server-backup server
```

### Option B: Use .metroignore File

Create a `.metroignore` file in the root:

```bash
echo "server/" > .metroignore
echo "server/**" >> .metroignore
```

### Option C: Check for Symlinks

Sometimes symlinks can cause issues:

```bash
# Check if server is a symlink
ls -la | grep server

# If it is, you might need to handle it differently
```

## Why This Happens:

1. **Metro's file watcher** might have cached references to the server folder
2. **Watchman** might be watching the server folder despite .watchmanconfig
3. **Node module resolution** might be traversing into server/node_modules
4. **Symlinks or aliases** might be causing Metro to follow paths into server

## Prevention:

The updated `metro.config.js` now has:
- Multiple blockList patterns
- Explicit watchFolders exclusion
- blacklistRE as backup blocking method

This should prevent Metro from ever accessing the server folder.

