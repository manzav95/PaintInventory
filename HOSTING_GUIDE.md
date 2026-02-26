# Hosting Guide: Netlify/GitHub Pages + Backend

## Short Answer

**Yes, it will work, but you need TWO separate hosts:**

1. **Frontend (web app)**: Netlify or GitHub Pages ✅
2. **Backend (API server)**: Railway, Render, Heroku, or similar ✅

**Database**: ✅ Will work - all devices will see the same data  
**Camera**: ✅ Will work - HTTPS is required and both Netlify/GitHub Pages provide it

---

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Netlify/      │  HTTPS  │   Railway/Render │
│  GitHub Pages   │ ───────>│   (Backend API)  │
│  (Frontend)     │         │   + SQLite DB    │
└─────────────────┘         └──────────────────┘
```

---

## Step 1: Host the Backend (API Server)

You **cannot** host the Node.js server on Netlify or GitHub Pages (they're static only). Use one of these:

### Option A: Railway (Recommended - Easy & Free)

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repo
5. Railway will auto-detect it's Node.js
6. Set the root directory to `server/`
7. Add environment variable: `PORT=3000`
8. Deploy!

**Your backend URL will be:** `https://your-app-name.railway.app`

### Option B: Render (Free tier available)

1. Go to [render.com](https://render.com)
2. Sign up
3. New → Web Service
4. Connect your GitHub repo
5. Settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
6. Deploy!

**Your backend URL will be:** `https://your-app-name.onrender.com`

### Option C: Heroku (Paid, but reliable)

Similar process to Render.

---

## Step 2: Update config.js for Production

After deploying the backend, update `config.js`:

```javascript
const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Production: Use your hosted backend
    if (hostname.includes('netlify.app') || 
        hostname.includes('github.io') || 
        hostname.includes('yourdomain.com')) {
      return 'https://paintinventory.onrender.com';  // ← Your backend URL
    }
    
    // Localhost development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    
    // IP address (local network)
    if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return `http://${hostname}:3000`;
    }
  }
  
  // Mobile apps - use production backend
  return 'https://paintinventory.onrender.com';  // ← Your backend URL
};
```

---

## Step 3: Hotst the Frontend on Netlify

### Build the Web App

```bash
# Build the web version
npm run build:web
# or
yarn build:web

# This creates a `dist/` folder
```

### Deploy to Netlify

**Option 1: Netlify CLI**
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod --dir=dist
```

**Option 2: Netlify Dashboard**
1. Go to [netlify.com](https://netlify.com)
2. Sign up/login
3. Drag and drop the `dist/` folder
4. Done! Your app is live at `https://your-app-name.netlify.app`

**Option 3: GitHub Integration**
1. Push your code to GitHub
2. In Netlify: New site → Import from Git
3. Select your repo
4. Build settings:
   - **Build command**: `npm run build:web`
   - **Publish directory**: `dist`
5. Deploy!

---

## Step 4: Host on GitHub Pages

1. Build the web app: `npm run build:web`
2. Push `dist/` folder to a `gh-pages` branch
3. In GitHub repo: Settings → Pages
4. Select `gh-pages` branch and `/` (root)
5. Your app will be at: `https://yourusername.github.io/repo-name`

**Note:** You'll need to update `app.json` to set the correct base path if using a subdirectory.

---

## Camera on Web

✅ **Camera WILL work** on Netlify/GitHub Pages because:
- Both provide HTTPS automatically
- Your code already handles web camera access
- The manual entry fallback is available if needed

The camera requires HTTPS, which both platforms provide.

---

## Database Considerations

### Current Setup (SQLite)
- ✅ Works for small teams (< 100 users)
- ✅ Simple, no setup needed
- ⚠️ File-based (backup the `inventory.db` file)
- ⚠️ Single server only (can't scale horizontally)

### For Production (Optional Upgrade)
If you need more reliability, consider:
- **PostgreSQL** (Railway/Render provide this)
- **MongoDB Atlas** (free tier available)
- **Supabase** (free PostgreSQL)

You'd need to update `server/database.js` to use these instead of SQLite.

---

## Environment Variables

For the backend, you might want to set:
- `PORT=3000` (usually auto-set)
- `NODE_ENV=production`
- Database connection strings (if using cloud DB)

---

## Testing Locally Before Deploying

1. **Start your backend locally:**
   ```bash
   cd server
   npm start
   ```

2. **Update `config.js` temporarily** to point to your local backend

3. **Test the web app:**
   ```bash
   npm run build:web
   npx serve dist
   ```

4. **Verify everything works**, then deploy!

---

## Summary

✅ **Database**: Works - all devices share the same data  
✅ **Camera**: Works - HTTPS provided by hosting platforms  
✅ **Multi-device**: Works - frontend on Netlify, backend on Railway  
⚠️ **Backend**: Must be hosted separately (can't use Netlify/GitHub Pages for Node.js)

**Recommended Setup:**
- Frontend: Netlify (easiest)
- Backend: Railway (free tier, easy setup)

