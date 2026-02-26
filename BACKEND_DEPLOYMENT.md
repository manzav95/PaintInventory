# Backend Deployment: Render vs Railway

## ✅ Yes, Your API Will Continue to Work and Can Be Updated!

Both Render and Railway allow you to:
- ✅ Update your code (via Git push)
- ✅ Auto-deploy changes
- ✅ Keep your API running 24/7
- ✅ Access your API from anywhere

---

## How Updates Work

### Option 1: Automatic Deploy (Recommended)

1. **Connect your GitHub repo** to Render/Railway
2. **Push code to GitHub:**
   ```bash
   git add .
   git commit -m "Update API"
   git push
   ```
3. **Platform auto-detects changes** and redeploys
4. **Your API updates automatically** (usually takes 1-3 minutes)

### Option 2: Manual Deploy

- Railway: Click "Redeploy" button in dashboard
- Render: Click "Manual Deploy" in dashboard

---

## Database Persistence ⚠️ IMPORTANT

### Current Setup (SQLite - File-based)

**⚠️ Problem:** SQLite stores data in a file (`inventory.db`). On Render/Railway:
- ✅ **Works for testing/small apps**
- ⚠️ **Data may be lost** if the server restarts (ephemeral filesystem)
- ⚠️ **Not ideal for production** with multiple users

### Solutions

#### Option A: Use Railway (Better for SQLite)
- Railway provides **persistent disk storage**
- Your `inventory.db` file will persist
- ✅ **Easiest - no code changes needed**

#### Option B: Use Render with PostgreSQL (Recommended for Production)
- Render provides **free PostgreSQL database**
- More reliable, scales better
- Requires updating `database.js` to use PostgreSQL

#### Option C: Use External Database
- **Supabase** (free PostgreSQL)
- **MongoDB Atlas** (free tier)
- **PlanetScale** (free MySQL)

---

## Step-by-Step: Deploy to Railway (Easiest)

### 1. Prepare Your Backend

Create `server/package.json` if it doesn't exist (it should already):

```json
{
  "name": "paint-inventory-api",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2",
    "better-sqlite3": "^9.0.0",
    "xlsx": "^0.18.5",
    "node-cron": "^3.0.2"
  }
}
```

### 2. Create `server/railway.json` (Optional)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 3. Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. **New Project** → **Deploy from GitHub repo**
4. Select your repository
5. Railway will detect it's Node.js
6. **Set Root Directory:** `server` (important!)
7. **Add Environment Variable:**
   - `PORT=3000` (usually auto-set, but add it to be safe)
8. Click **Deploy**

### 4. Get Your API URL

After deployment:
- Railway gives you a URL like: `https://your-app-name.up.railway.app`
- This is your backend API URL
- Update `config.js` with this URL

### 5. Update Your Code

1. **Push changes to GitHub**
2. Railway **automatically redeploys**
3. Your API updates in 1-3 minutes

---

## Step-by-Step: Deploy to Render

### 1. Prepare Your Backend

Same as Railway - make sure `server/package.json` exists.

### 2. Deploy to Render

1. Go to [render.com](https://render.com)
2. Sign up
3. **New** → **Web Service**
4. Connect your GitHub repo
5. Settings:
   - **Name:** `paint-inventory-api`
   - **Root Directory:** `server`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Click **Create Web Service**

### 3. Get Your API URL

- Render gives you: `https://your-app-name.onrender.com`
- Update `config.js` with this URL

### 4. Update Your Code

- Push to GitHub → Render auto-deploys

---

## Database Persistence on Each Platform

### Railway
- ✅ **Persistent disk storage** - SQLite will work
- ✅ Your `inventory.db` file persists
- ✅ **Best choice for SQLite**

### Render
- ⚠️ **Ephemeral filesystem** - SQLite data may be lost on restart
- ✅ **Free PostgreSQL available** - better for production
- Consider upgrading to PostgreSQL

---

## Updating Your API Code

### Workflow:

1. **Make changes locally:**
   ```bash
   # Edit server/server.js, database.js, etc.
   ```

2. **Test locally:**
   ```bash
   cd server
   npm start
   # Test at http://localhost:3000
   ```

3. **Commit and push:**
   ```bash
   git add .
   git commit -m "Added new feature"
   git push origin main
   ```

4. **Platform auto-deploys:**
   - Railway/Render detects the push
   - Builds and deploys automatically
   - Your API updates in 1-3 minutes

5. **Verify:**
   - Check your API URL: `https://your-api.railway.app/api/health`
   - Should return: `{"status":"ok"}`

---

## Environment Variables

You can set environment variables in both platforms:

### Railway
- Project → Variables tab
- Add: `PORT=3000`, `NODE_ENV=production`, etc.

### Render
- Service → Environment tab
- Add key-value pairs

---

## Monitoring & Logs

Both platforms provide:
- ✅ **Real-time logs** - see what's happening
- ✅ **Metrics** - CPU, memory usage
- ✅ **Deployment history** - see past deployments
- ✅ **Error tracking** - see if something breaks

---

## Free Tier Limits

### Railway
- ✅ $5 free credit/month
- ✅ Enough for small apps
- ✅ Persistent storage included

### Render
- ✅ Free tier available
- ⚠️ Spins down after 15 min inactivity (wakes on request)
- ✅ Free PostgreSQL database

---

## Recommended Setup

**For Your Use Case (Small Team, Shared Inventory):**

1. **Backend:** Railway (better SQLite support)
2. **Frontend:** Netlify (easiest)
3. **Database:** SQLite (works fine for now)
4. **Future:** Upgrade to PostgreSQL if you grow

---

## Troubleshooting

### API Not Updating?
- Check deployment logs in Railway/Render dashboard
- Verify you pushed to the correct branch
- Check that root directory is set to `server/`

### Database Not Persisting (Render)?
- Consider upgrading to PostgreSQL
- Or switch to Railway (better SQLite support)

### API URL Not Working?
- Check that `PORT` environment variable is set
- Verify the service is running (green status)
- Check logs for errors

---

## Summary

✅ **Yes, your API will continue to work**  
✅ **Yes, you can update it** (just push to GitHub)  
✅ **Yes, changes auto-deploy**  
✅ **Yes, it runs 24/7** (Railway) or on-demand (Render free tier)  
✅ **Database persists** on Railway, may need PostgreSQL on Render

**Recommended:** Start with Railway for easiest SQLite support, then upgrade to PostgreSQL later if needed.

