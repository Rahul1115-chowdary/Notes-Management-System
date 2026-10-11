# 📝 Notes Management System

> An intelligent, full-stack notes management system built with **Node.js, Express, Native MongoDB driver**, and a sleek, modern UI with **dark/light modes, categorization, AI assistant capabilities, and flashcards**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRahul1115-chowdary%2FNotes-Management-System&env=MONGODB_URI,JWT_SECRET)

---

## 🚀 Live Demo & Deployment on Vercel

This repository is pre-configured for **instant 1-click deployment on Vercel** using Vercel Serverless Functions (`api/index.js`) and static frontend routing (`vercel.json`).

### Step-by-Step Vercel Deployment:

1. **Push your code to GitHub** (or fork this repo: `https://github.com/Rahul1115-chowdary/Notes-Management-System`).
2. Go to [Vercel Dashboard](https://vercel.com/new) and click **"Import Repository"**.
3. In the project configuration:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (default)
4. Under **Environment Variables**, add:
   - `MONGODB_URI`: Your MongoDB Atlas connection string (see below).
   - `JWT_SECRET`: A random secure string (e.g. `my_super_secret_jwt_2026`).
5. Click **Deploy**. Vercel will provide your **live link** (e.g. `https://notes-management-system.vercel.app`)!

---

## 🍃 Connecting MongoDB Atlas (Cloud Database for Vercel)

Since Vercel runs in the cloud, it cannot connect to local `127.0.0.1:27017`. You need a free cloud MongoDB Atlas cluster:

1. Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free **M0 Shared Cluster**.
3. Under **Database Access**, create a user with a username and password.
4. Under **Network Access**, click **"Add IP Address"** and choose **"Allow Access from Anywhere (0.0.0.0/0)"** (required for Vercel lambdas).
5. Click **"Connect"** -> **"Connect your application"** -> copy the URI:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/notes_db?retryWrites=true&w=majority
   ```
6. Paste this URI into your Vercel Environment Variables.

---

## 💻 Running Locally

### 1. Prerequisites
- Node.js (v18+ recommended)
- MongoDB running locally on port `27017` (or a MongoDB Atlas URI)

### 2. Setup & Installation
```bash
# Clone the repository
git clone https://github.com/Rahul1115-chowdary/Notes-Management-System.git
cd Notes-Management-System

# Install dependencies
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/notes_db
JWT_SECRET=notes_app_super_secret_jwt_key_2026
```

### 4. Start the Application
```bash
# Start the full-stack server
npm start
```

Visit the application in your browser:
- **Login page**: `http://localhost:5000/login.html`
- **Main dashboard**: `http://localhost:5000/index.html`
- **Health check**: `http://localhost:5000/api/health`

---

## 📂 Repository Structure

```
├── api/
│   └── index.js              # Vercel Serverless Function entry point
├── middleware/
│   ├── errorHandler.js       # Centralized error and 404 handler
│   ├── index.js              # Middleware aggregator
│   ├── jwtAuth.js            # JWT token generation and verification
│   ├── rateLimiter.js        # Sliding-window DDoS/rate limiter
│   ├── requestLogger.js      # Color-coded request duration logger
│   └── validator.js          # Input sanitization and payload validation
├── project/                  # Frontend assets
│   ├── css/
│   │   └── styles.css        # Rich responsive CSS design system
│   ├── js/
│   │   ├── ai-service.js     # AI assistant integration
│   │   ├── app.js            # Main NotesApp state controller & API sync
│   │   └── sample-data.js    # Default sample notes
│   ├── index.html            # Main dashboard & notes workspace
│   └── login.html            # Authentication (Sign In, Sign Up, Demo Login)
├── .env.example              # Sample environment configuration
├── package.json              # Project dependencies & scripts
├── server.js                 # Native MongoDB & Express backend server
├── test-connection.js        # Database connectivity test script
└── vercel.json               # Vercel routing & rewrites configuration
```

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Service and MongoDB health check | No |
| `POST` | `/api/auth/login` | Email/password login | No |
| `POST` | `/api/auth/signup` | Register new account | No |
| `POST` | `/api/auth/google` | Google / social account authentication | No |
| `GET` | `/api/auth/me` | Current authenticated user profile | Bearer Token |
| `GET` | `/api/notes` | Get all notes (filters: `category`, `search`, `userEmail`) | Optional |
| `POST` | `/api/notes` | Create a new note | Optional |
| `PUT` | `/api/notes/:id` | Update note (content, pin, archive, trash, tags) | Optional |
| `DELETE` | `/api/notes/:id` | Permanently delete a note | Optional |

---

## 🛡️ Key Features

- **MongoDB Persistence**: Notes and accounts are automatically synchronized to MongoDB.
- **Offline / Cloud Fallback**: Automatically uploads notes created offline once connectivity resumes.
- **Smart Reminders**: Scans notes for due dates and displays proactive notification alerts.
- **Flashcard Study Mode**: Transforms study notes into interactive flip cards.
- **Secure Middleware Suite**: Includes rate limiting, JWT tokens, XSS payload sanitization, and structured error handling.
- **Vercel Serverless Ready**: Deploy to production with zero configuration.
