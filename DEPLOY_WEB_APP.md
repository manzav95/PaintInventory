# Deploy as Web App (PWA)

This guide will help you deploy the Paint Inventory Tracker as a web app that users can access via URL and save to their home screens.

## Prerequisites

1. A server/hosting solution (options below)
2. Node.js installed on the server
3. Your backend API server running

## Step 1: Build the Web App

```bash
# Build the web version
yarn build:web
# or
npm run build:web
```

This creates a `dist/` folder with all the static files needed.

## Step 2: Update API Configuration

Before building, make sure `config.js` has the correct API URL for production:

```javascript
// config.js
const API_URL = 'http://YOUR_SERVER_IP:3000';  // Your production server IP
// or
const API_URL = 'https://your-domain.com/api';  // If using a domain
```

**Important**: The API URL must be accessible from all devices that will use the web app.

## Step 3: Deploy Options

### Option A: Simple Static Hosting (Recommended for Internal Use)

#### Using a Raspberry Pi or Local Server:

1. **Build the app:**
   ```bash
   yarn build:web
   ```

2. **Install a simple web server:**
   ```bash
   npm install -g serve
   # or
   npm install -g http-server
   ```

3. **Start the web server:**
   ```bash
   cd dist
   serve -p 8080
   # or
   http-server -p 8080
   ```

4. **Access from any device on your network:**
   - Open browser: `http://YOUR_SERVER_IP:8080`
   - Users can bookmark it or "Add to Home Screen"

#### Using nginx (More Professional):

1. Install nginx on your server
2. Copy `dist/` contents to `/var/www/paint-inventory/`
3. Configure nginx:
   ```nginx
   server {
       listen 80;
       server_name your-server-ip;
       
       root /var/www/paint-inventory;
       index index.html;
       
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

### Option B: Cloud Hosting (Free Options)

#### Netlify:
1. Build: `yarn build:web`
2. Drag and drop `dist/` folder to Netlify
3. Configure redirects: Create `dist/_redirects` with:
   ```
   /*    /index.html   200
   ```

#### Vercel:
1. Install Vercel CLI: `npm i -g vercel`
2. Build: `yarn build:web`
3. Deploy: `cd dist && vercel`

#### GitHub Pages:
1. Build: `yarn build:web`
2. Push `dist/` to a `gh-pages` branch
3. Enable GitHub Pages in repository settings

## Step 4: Start Backend API Server

Make sure your backend server is running and accessible:

```bash
cd server
npm start
```

The server should be accessible at the URL you configured in `config.js`.

## Step 5: "Add to Home Screen" Instructions

### For Users (iPhone/iPad):
1. Open the web app in Safari
2. Tap the Share button (square with arrow)
3. Tap "Add to Home Screen"
4. Name it "Paint Tracker" (or your preference)
5. Tap "Add"

### For Users (Android):
1. Open the web app in Chrome
2. Tap the menu (three dots)
3. Tap "Add to Home Screen" or "Install App"
4. Confirm

### For Users (Desktop):
- Chrome/Edge: Look for install icon in address bar
- Or bookmark the page

## Step 6: Update API URL for Production

**Important**: Before deploying, update `config.js` with your production API URL:

```javascript
// For same server, different port:
const API_URL = 'http://YOUR_SERVER_IP:3000';

// For same domain, different path:
const API_URL = 'https://your-domain.com/api';

// For CORS issues, you may need to update server/server.js to allow your domain
```

## Troubleshooting

### CORS Errors:
If you get CORS errors, update `server/server.js`:

```javascript
app.use(cors({
  origin: ['http://your-web-app-url', 'https://your-domain.com'],
  credentials: true
}));
```

### Camera Not Working:
- On web, camera access requires HTTPS (except localhost)
- Use manual input mode as fallback
- Or deploy with HTTPS (Let's Encrypt is free)

### API Connection Issues:
- Make sure backend server is running
- Check firewall allows port 3000 (or your API port)
- Verify `config.js` has correct IP/URL
- Test API directly: `http://YOUR_IP:3000/api/health`

## Quick Start (Local Network)

For quick internal deployment:

```bash
# Terminal 1: Start backend
cd server
npm start

# Terminal 2: Build and serve web app
yarn build:web
cd dist
npx serve -p 8080
```

Then access from any device: `http://YOUR_COMPUTER_IP:8080`

## Production Checklist

- [ ] Update `config.js` with production API URL
- [ ] Build web app: `yarn build:web`
- [ ] Deploy `dist/` folder to hosting
- [ ] Start backend API server
- [ ] Test on mobile device
- [ ] Test "Add to Home Screen" functionality
- [ ] Verify API connection works
- [ ] Test QR code scanning (may need HTTPS)
- [ ] Share URL with users

