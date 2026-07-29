# 🚀 Deploying CampusGPT (shareable web link)

This guide gets CampusGPT online so anyone can use it from one URL, and so you
can "install" it like an app (PWA). Three free services:

| Piece | Service | Result |
|-------|---------|--------|
| Database | **MongoDB Atlas** | cloud database |
| Backend (FastAPI) | **Render** (or Railway) | `https://your-api.onrender.com` |
| Frontend (React) | **Vercel** | `https://campusgpt.vercel.app` ← the link you share |

> Do the steps in order — the frontend needs the backend URL, and the backend needs the database URL.

---

## 1. Database — MongoDB Atlas (5 min)

1. Create a free account at <https://www.mongodb.com/atlas> and create a **free M0 cluster**.
2. **Database Access** → add a database user (username + password). Save these.
3. **Network Access** → Add IP → allow `0.0.0.0/0` (so cloud hosts can reach it).
4. **Connect → Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<user>`/`<password>` — you'll use this as `MONGODB_URI`.

---

## 2. Backend — Render (10 min)

> ⚠️ The backend imports the sibling `pipeline/` folder, so you must deploy the
> **whole repo** (not just `backend/`) and run uvicorn from inside `backend/`.

1. Push this project to GitHub (see the README's setup section).
2. At <https://render.com> → **New → Web Service** → connect your repo.
3. Configure:
   - **Root Directory:** *(leave blank — use the repo root)*
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Environment** → add these variables:
   | Key | Value |
   |-----|-------|
   | `GOOGLE_API_KEY` | your Gemini key (regenerate before going public) |
   | `MONGODB_URI` | the Atlas string from step 1 |
   | `MONGODB_DB_NAME` | `campusgpt` |
   | `JWT_SECRET` | run `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
   | `JWT_ALGORITHM` | `HS256` |
   | `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` |
   | `REFRESH_TOKEN_EXPIRE_DAYS` | `7` |
5. Deploy. When it's live, copy the URL, e.g. `https://campusgpt-api.onrender.com`.
6. Test it: open `https://campusgpt-api.onrender.com/health` → should return `{"status":"ok"}`.

---

## 3. Frontend — Vercel (5 min)

1. At <https://vercel.com> → **Add New → Project** → import the same repo.
2. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build` · **Output Directory:** `dist`
3. **Environment Variables** → add:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | your Render backend URL (e.g. `https://campusgpt-api.onrender.com`) |
4. Deploy. You now have your shareable link: **`https://campusgpt.vercel.app`** 🎉

Share that URL with anyone — they can register and use it in the browser.

---

## ⚠️ Important caveats (free tier)

- **Backend cold starts:** Render's free tier sleeps after ~15 min idle; the first
  request then takes ~50s to wake. Fine for a demo/portfolio.
- **ChromaDB persistence:** the vector store is written to the backend's local disk,
  which is **ephemeral** on free tiers — uploaded documents reset on redeploy/restart.
  For durable storage, attach a Render **persistent disk** (paid) or move to a hosted
  vector DB. For a portfolio demo, per-session uploads work fine.
- **Gemini quota:** all visitors share your one API key, so heavy use will hit the
  free-tier quota. Keep the key private (it's server-side only).

---

## 📲 Make it installable (PWA) — optional

Once deployed, CampusGPT can be "installed" like an app:
- **Desktop (Chrome/Edge):** click the install icon in the address bar.
- **Phone:** Share → "Add to Home Screen".

To enable a proper install prompt + offline shell, add `vite-plugin-pwa` (a web
app manifest + service worker). Ask and this can be wired up in a few minutes.
