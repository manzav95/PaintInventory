# Reverted to AsyncStorage

The app has been reverted to use AsyncStorage (local storage) instead of the SQL database backend.

## What Changed:

1. **`services/inventoryService.js`** - Now uses AsyncStorage instead of API calls
2. **`services/auditService.js`** - Now uses AsyncStorage instead of API calls  
3. **`services/idGenerator.js`** - Created as separate file (was inline before)
4. **`App.js`** - Removed API connection test from `loadInventory`
5. **`metro.config.js`** - Simplified to avoid HMR issues (removed custom resolver)

## Server Code Preserved:

The `server/` folder is still in the project but is now completely ignored by Metro bundler. You can:
- Keep it for future use
- Switch back to SQL database later by reverting these service files
- The server code is ready to use when you want to switch back

## To Switch Back to SQL Database Later:

1. Restore the API-based versions of:
   - `services/inventoryService.js` (use API calls)
   - `services/auditService.js` (use API calls)
2. Update `App.js` to restore API connection test
3. Start the backend server: `cd server && npm start`
4. Update `config.js` with correct server IP

## Current Storage:

- **Inventory items**: Stored in AsyncStorage key `@inventory_items`
- **Next ID counter**: Stored in AsyncStorage key `@inventory_next_id`
- **Audit log**: Stored in AsyncStorage key `@inventory_audit_log`
- **User preferences**: Stored in AsyncStorage (dark mode, user name)

All data is now stored locally on the device.

