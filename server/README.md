# Paint Inventory Tracker - Backend Server

This is the backend API server for the Paint Inventory Tracker app.

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Configuration

The server runs on port 3000 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Database

The server uses SQLite and creates a database file `inventory.db` in the server directory.

## API Endpoints

- `GET /api/items` - Get all items
- `GET /api/items/:id` - Get single item
- `POST /api/items` - Add new item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item
- `POST /api/items/:id/change-id` - Change item ID (admin only)
- `GET /api/settings/next-id` - Get next ID number
- `POST /api/settings/next-id` - Set next ID number (admin only)
- `GET /api/audit` - Get audit logs
- `GET /api/health` - Health check

## Running on Raspberry Pi

1. Copy the `server` folder to your Raspberry Pi
2. Install Node.js on the Pi (if not already installed)
3. Run `npm install` in the server folder
4. Start the server: `npm start`
5. Find your Pi's IP address: `hostname -I`
6. Update the API_URL in the app config to point to `http://YOUR_PI_IP:3000`

