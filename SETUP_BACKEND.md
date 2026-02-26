# Backend Setup Instructions

The Paint Inventory Tracker now uses a SQL database backend so data can be shared across multiple devices.

## Quick Start

### 1. Install Backend Dependencies

```bash
cd server
npm install
```

### 2. Start the Server

```bash
npm start
```

The server will run on port 3000 by default.

### 3. Find Your Server's IP Address

**On Mac:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```
Look for something like `192.168.1.100` or `10.0.0.5`

**On Raspberry Pi:**
```bash
hostname -I
```

### 4. Update App Configuration

Edit `config.js` in the project root and change:

```javascript
const API_URL = 'http://YOUR_SERVER_IP:3000';
```

Replace `YOUR_SERVER_IP` with the IP address from step 3.

**Example:**
- If your Mac's IP is `192.168.1.100`: `'http://192.168.1.100:3000'`
- If your Raspberry Pi's IP is `192.168.1.50`: `'http://192.168.1.50:3000'`

### 5. Make Sure Devices Are on Same Network

- Your server (Mac/Pi) and all phones/laptops must be on the **same Wi-Fi network**
- The server must be running when you use the app

## Running on Raspberry Pi

1. Copy the entire `server` folder to your Raspberry Pi
2. SSH into the Pi or use a terminal
3. Install Node.js (if not already installed):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. Navigate to the server folder and install dependencies:
   ```bash
   cd server
   npm install
   ```
5. Start the server:
   ```bash
   npm start
   ```
6. Find the Pi's IP: `hostname -I`
7. Update `config.js` in the app to point to the Pi's IP

## Database

The database file `inventory.db` is created automatically in the `server` folder. This is a SQLite database - no additional setup needed!

## Troubleshooting

**"Network request failed" or "Cannot connect to server"**
- Make sure the server is running (`npm start` in the server folder)
- Check that the IP address in `config.js` is correct
- Ensure all devices are on the same Wi-Fi network
- Try pinging the server IP from your phone/device

**"Port 3000 already in use"**
- Change the port in `server/server.js`: `const PORT = process.env.PORT || 8080;`
- Update `config.js` to match: `const API_URL = 'http://YOUR_IP:8080';`

**Data not syncing between devices**
- Make sure all devices have the same `API_URL` in their `config.js`
- Restart the app after changing `config.js`
- Check that the server is accessible from all devices

