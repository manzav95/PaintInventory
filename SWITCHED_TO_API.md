# Switched Back to API (SQL Database)

The app has been switched back to use the SQL database backend API instead of AsyncStorage.

## What Changed:

1. **`services/inventoryService.js`** - Now uses API calls to `/api/items` endpoints
2. **`services/auditService.js`** - Now uses API calls to `/api/audit` endpoint
3. **`App.js`** - Added API connection test in `loadInventory` function
4. **`metro.config.js`** - Updated to block `server/` folder from Metro bundler
5. **`server/` folder** - Restored from `.server-backup`

## Server Setup:

1. **Install server dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   The server will run on port 3000 by default.

3. **Update API URL in `config.js`:**
   - For local development: `http://localhost:3000`
   - For iPhone testing (same WiFi): `http://YOUR_MAC_IP:3000`
   - Find your Mac IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`

## API Endpoints:

- `GET /api/items` - Get all items
- `GET /api/items/:id` - Get single item
- `POST /api/items` - Add new item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item
- `POST /api/items/:id/change-id` - Change item ID (admin only)
- `GET /api/settings/next-id` - Get next ID counter
- `POST /api/settings/next-id` - Set next ID counter (admin only)
- `GET /api/audit` - Get audit logs
- `GET /api/health` - Health check

## Database:

- SQLite database stored in `server/inventory.db`
- Tables: `items`, `settings`, `audit_log`
- Data persists across app restarts
- Data is shared across all devices connected to the same server

## Starting Both Server and App:

You can use the provided scripts:

```bash
# Using Node.js script
npm run start:all

# Or manually in two terminals:
# Terminal 1:
cd server && npm start

# Terminal 2:
yarn start
```

## Troubleshooting:

1. **"Cannot connect to server" error:**
   - Make sure the server is running: `cd server && npm start`
   - Check `config.js` has the correct IP address
   - Verify server is accessible: Open `http://YOUR_IP:3000/api/health` in browser

2. **Metro bundler errors about server folder:**
   - The `metro.config.js` should block the server folder
   - Clear caches: `watchman watch-del-all && rm -rf .expo node_modules/.cache`
   - Restart Metro: `yarn start -c`

3. **Data not syncing:**
   - Ensure all devices are using the same server IP in `config.js`
   - Check server logs for errors
   - Use the refresh button in the app to manually sync

