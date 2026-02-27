# SQLite on Railway with a Persistent Volume

Your server is already configured to use a persistent disk when one is available. Follow these steps on Railway.

---

## 1. Create a volume and attach it to your service

1. In the **Railway dashboard**, open your project and select your **backend service** (the one that runs `server.js`).
2. Open the **Command Palette** (`⌘K` on Mac, `Ctrl+K` on Windows) or **right‑click** on the project canvas.
3. Choose **“Add Volume”** (or **“Create volume”**).
4. When prompted, **select the backend service** to attach the volume to.
5. Set the **mount path** to:
   ```text
   /app/data
   ```
   Railway runs your app from `/app`. Using `/app/data` keeps the DB on the volume and your code in `/app`.

---

## 2. (Optional) Set an explicit DB path

The server automatically uses the volume when `RAILWAY_VOLUME_MOUNT_PATH` is set (Railway sets this when a volume is attached). It will store the SQLite file at:

```text
<RAILWAY_VOLUME_MOUNT_PATH>/inventory.db
```

So with mount path `/app/data`, the file is `/app/data/inventory.db`.

If you prefer to set the path yourself, add a **Variable** to the service:

- **Name:** `SQLITE_PATH`
- **Value:** `/app/data/inventory.db`

(Only needed if you use a different mount path.)

---

## 3. Redeploy

After adding the volume and setting the mount path to `/app/data`, **redeploy** the service (e.g. trigger a new deploy from the Railway UI or push to your connected repo). The volume is mounted at **runtime**, so the new deploy will see `/app/data` and create/use `inventory.db` there. Data will persist across restarts and redeploys.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Add Volume → attach to backend service |
| 2 | Mount path: **`/app/data`** |
| 3 | Redeploy |

No code changes are required; the server already uses `RAILWAY_VOLUME_MOUNT_PATH` when present and falls back to a local file when developing locally.
