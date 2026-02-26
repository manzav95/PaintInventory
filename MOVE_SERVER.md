# Move Server Folder to Fix Metro Error

Metro is trying to access files in the `server/` folder, causing errors. The simplest fix is to move the server folder outside the project.

## Quick Fix:

```bash
# Move server folder outside project (one level up)
mv server ../server-backup

# Clear caches
watchman watch-del-all
rm -rf node_modules/.cache .expo

# Restart Metro
npx expo start -c
```

## To Use Server Later:

When you want to switch back to SQL database:

```bash
# Move server back
mv ../server-backup server

# Start the server
cd server && npm start
```

## Alternative: Rename Instead of Move

If you prefer to keep it in the project but hidden:

```bash
# Rename server folder
mv server .server-backup

# Clear and restart
watchman watch-del-all
rm -rf node_modules/.cache .expo
npx expo start -c
```

The dot (.) prefix makes it hidden and Metro won't try to access it.

