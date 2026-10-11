# 📝 Notes Management System

> An intelligent, full-stack notes management system built with **Node.js, Express, Native MongoDB driver**, and a sleek, modern UI with **dark/light modes, categorization, AI assistant capabilities, and flashcards**.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Rahul1115-chowdary/Notes-Management-System)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRahul1115-chowdary%2FNotes-Management-System&env=MONGODB_URI,JWT_SECRET)

---

## 🚀 Live Deployment Architecture Options

You can run this project in either of two architectures:

### 🌟 Option A: Render Backend + Vercel Frontend (Recommended for Dedicated Backend)
- **Backend on Render**: Persistent Node.js/Express server with native MongoDB connection pooling and health checks.
- **Frontend on Vercel**: Blazing-fast global CDN for static HTML, CSS, and JS assets.

### ⚡ Option B: Full-Stack on Vercel
- Both frontend and serverless API functions (`/api/*`) deployed together on Vercel.

---

## 🛠️ Step 1: Deploy Backend to Render

1. Click the **[Deploy to Render](https://render.com/deploy?repo=https://github.com/Rahul1115-chowdary/Notes-Management-System)** button or go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your repository: `https://github.com/Rahul1115-chowdary/Notes-Management-System`.
4. Render will auto-detect settings from [`render.yaml`](render.yaml):
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Health Check Path**: `/api/health`
5. Set Environment Variables:
   - `MONGODB_URI`: Your MongoDB Atlas connection string (see Database section below).
   - `JWT_SECRET`: Any secure random key (e.g. `notes_super_secure_jwt_secret_token_key_2026`).
6. Click **Create Web Service**. Render will deploy your backend at a live URL like:
   `https://notes-management-backend-xxxx.onrender.com`

---

## 🍃 Step 2: Cloud Database Setup (MongoDB Atlas)

Since cloud hosts like Render and Vercel cannot reach your local PC (`127.0.0.1`), use a free cloud **MongoDB Atlas** cluster:

1. Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free **M0 Shared Cluster**.
3. Under **Database Access**: Click **Add New Database User** (e.g. `notes_user` and a strong password).
4. Under **Network Access**: Click **Add IP Address** -> select **Allow Access from Anywhere (`0.0.0.0/0`)**.
5. Click **Connect** -> **Drivers** -> Copy the connection URI:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/notes_db?retryWrites=true&w=majority
   ```
6. Paste this URI into:
   - Render's **Environment Variables** (`MONGODB_URI`)
   - Vercel's **Environment Variables** (`MONGODB_URI`)

---

## 🌐 Step 3: Deploy Frontend to Vercel

1. Open [`project/js/config.js`](project/js/config.js).
2. If using Render backend, set your Render URL in `BACKEND_URL`:
   ```javascript
   window.APP_CONFIG = {
     BACKEND_URL: "https://your-render-backend.onrender.com"
   };
   ```
3. Push to GitHub.
4. Go to [vercel.com/new](https://vercel.com/new) and import `Rahul1115-chowdary/Notes-Management-System`.
5. Click **Deploy**. Vercel will generate your live frontend link:
   `https://notes-management-system-xxxx.vercel.app`

---

## 🔑 Access Tokens & Configuration Reference

| Variable | Description | Where to Set | Example Value |
|---|---|---|---|
| `PORT` | Server listening port | `.env` / Render | `5000` |
| `MONGODB_URI` | MongoDB Cloud connection string | `.env` / Render / Vercel | `mongodb+srv://user:pass@cluster0.mongodb.net/notes_db?retryWrites=true&w=majority` |
| `JWT_SECRET` | Secret token used to sign auth tokens | `.env` / Render / Vercel | `notes_super_secure_jwt_secret_token_key_2026` |
| `JWT_EXPIRES_IN` | Session token validity duration | `.env` / Render | `7d` |
| `BACKEND_URL` | Live backend URL for frontend requests | `project/js/config.js` | `https://notes-backend.onrender.com` |

---

## 💻 Running Locally

```bash
# 1. Clone repository
git clone https://github.com/Rahul1115-chowdary/Notes-Management-System.git
cd Notes-Management-System

# 2. Install dependencies
npm install

# 3. Create .env file
# (copy from .env.example)

# 4. Start full-stack server
npm start
```

Visit:
- **Dashboard**: `http://localhost:5000/index.html`
- **Login**: `http://localhost:5000/login.html`
- **Health Check**: `http://localhost:5000/api/health`

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Service and MongoDB status check | No |
| `POST` | `/api/auth/login` | User login (generates JWT token) | No |
| `POST` | `/api/auth/signup` | User signup | No |
| `POST` | `/api/auth/google` | Google / social login | No |
| `GET` | `/api/auth/me` | Current user profile | Bearer Token |
| `GET` | `/api/notes` | Get all notes (filters: `category`, `search`, `userEmail`) | Optional |
| `POST` | `/api/notes` | Create a new note | Optional |
| `PUT` | `/api/notes/:id` | Update note (content, pin, archive, trash, tags) | Optional |
| `DELETE` | `/api/notes/:id` | Permanently delete a note | Optional |
