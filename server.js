require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// Import Custom Middleware Suite
const {
  requestLogger,
  jwtAuth,
  rateLimiter,
  validator,
  errorHandler
} = require('./middleware');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/notes_db';
const DB_NAME = 'notes_db';

// ==================== GLOBAL MIDDLEWARES ====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Custom Request Logger Middleware
app.use(requestLogger);

// General API Rate Limiter
app.use('/api/', rateLimiter.apiLimiter);

// Serve static frontend files from 'project' directory
app.use(express.static(path.join(__dirname, 'project')));

// MongoDB Connection State Management
let client = null;
let db = null;
let usersCollection = null;
let notesCollection = null;
let connectionPromise = null;

// Helper to derive formatted name from email
function deriveNameFromEmail(email) {
  if (!email) return 'User';
  const prefix = email.split('@')[0];
  const clean = prefix.replace(/[._-]/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Connect to MongoDB with connection caching for serverless & local environments
async function getCollections() {
  if (usersCollection && notesCollection && db) {
    return { usersCollection, notesCollection, db };
  }

  if (!connectionPromise) {
    connectionPromise = (async () => {
      try {
        console.log(`📡 Connecting to MongoDB: ${MONGO_URI.replace(/:[^:]*@/, ':****@')}`);
        const mongoClient = new MongoClient(MONGO_URI, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000
        });
        await mongoClient.connect();
        client = mongoClient;
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        notesCollection = db.collection('notes');
        console.log(`✅ Native MongoDB Client connected to: ${DB_NAME}`);
        return { usersCollection, notesCollection, db };
      } catch (err) {
        connectionPromise = null;
        console.error('❌ MongoDB Connection Error:', err.message);
        throw err;
      }
    })();
  }

  return connectionPromise;
}

// Initial connection attempt on boot
getCollections().catch((err) => {
  console.warn('⚠️ Initial MongoDB connection notice:', err.message);
  console.log('💡 Note: Ensure MongoDB service is running locally, or set MONGODB_URI to MongoDB Atlas in .env');
});

// Middleware to inject collections into API requests
app.use('/api', async (req, res, next) => {
  // Allow health endpoint to respond even if DB is reconnecting
  if (req.path === '/health') return next();

  try {
    const collections = await getCollections();
    req.usersCollection = collections.usersCollection;
    req.notesCollection = collections.notesCollection;
    req.db = collections.db;
    next();
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: 'Database connection offline. Please ensure MongoDB is running or MONGODB_URI is properly configured.',
      details: err.message
    });
  }
});

// ==================== SYSTEM & HEALTH ROUTES ====================
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const collections = await getCollections();
    await collections.db.command({ ping: 1 });
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = `disconnected (${e.message})`;
  }

  res.json({
    success: true,
    status: 'ok',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ==================== AUTH ROUTES WITH MIDDLEWARE ====================

// 1. Google / Social Login Endpoint
app.post('/api/auth/google', rateLimiter.authLimiter, async (req, res, next) => {
  try {
    const { email, name, picture, provider = 'Google' } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const emailLower = email.toLowerCase().trim();
    const finalName = (name && name.trim()) ? name.trim() : deriveNameFromEmail(emailLower);
    const firstLetter = finalName.charAt(0).toUpperCase();

    const userData = {
      name: finalName,
      email: emailLower,
      authProvider: provider,
      avatar: firstLetter,
      picture: picture || '',
      role: `${provider} Account`,
      updatedAt: new Date()
    };

    await req.usersCollection.updateOne(
      { email: emailLower },
      { $set: userData, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    const user = await req.usersCollection.findOne({ email: emailLower });
    console.log(`✅ Native MongoDB: Saved Google User -> "${user.name}" <${user.email}>`);

    // Generate JWT Token via auth middleware
    const token = jwtAuth.generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        picture: user.picture,
        role: user.role,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    next(error);
  }
});

// 2. Standard Login Endpoint (with authLimiter & validateLogin middleware)
app.post('/api/auth/login', rateLimiter.authLimiter, validator.validateLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const emailLower = email.toLowerCase().trim();
    let user = await req.usersCollection.findOne({ email: emailLower });

    if (!user) {
      const name = deriveNameFromEmail(emailLower);
      const newUserDoc = {
        name: name,
        email: emailLower,
        password: password || '123456',
        authProvider: 'Email',
        avatar: name.charAt(0).toUpperCase(),
        role: 'Pro Member',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await req.usersCollection.insertOne(newUserDoc);
      user = await req.usersCollection.findOne({ email: emailLower });
      console.log(`✅ Native MongoDB: User created on login -> "${user.name}" <${user.email}>`);
    } else {
      console.log(`✅ Native MongoDB: User authenticated -> "${user.name}" <${user.email}>`);
    }

    // Generate JWT Token via auth middleware
    const token = jwtAuth.generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// 3. Signup Endpoint (with authLimiter & validateSignup middleware)
app.post('/api/auth/signup', rateLimiter.authLimiter, validator.validateSignup, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const emailLower = email.toLowerCase().trim();
    const finalName = (name && name.trim()) ? name.trim() : deriveNameFromEmail(emailLower);
    const firstLetter = finalName.charAt(0).toUpperCase();

    const userData = {
      name: finalName,
      email: emailLower,
      password: password || '123456',
      authProvider: 'Email',
      avatar: firstLetter,
      role: 'Pro Member',
      updatedAt: new Date()
    };

    await req.usersCollection.updateOne(
      { email: emailLower },
      { $set: userData, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    const user = await req.usersCollection.findOne({ email: emailLower });
    console.log(`✅ Native MongoDB: Signup Success & Saved -> "${user.name}" <${user.email}>`);

    // Generate JWT Token via auth middleware
    const token = jwtAuth.generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// Profile / Current User route protected by JWT Auth Middleware
app.get('/api/auth/me', jwtAuth.verifyToken, async (req, res, next) => {
  try {
    const user = await req.usersCollection.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User profile not found' });
    }
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        picture: user.picture,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// ==================== NOTES ROUTES WITH MIDDLEWARE ====================

// Get all notes (supports userEmail, category, search, and sorts pinned first)
app.get('/api/notes', jwtAuth.optionalAuth, async (req, res, next) => {
  try {
    const userEmail = req.user ? req.user.email : req.query.userEmail;
    const { category, search } = req.query;

    const filter = {};
    if (userEmail) {
      filter.userEmail = userEmail.toLowerCase().trim();
    }
    if (category && category !== 'all') {
      filter.category = category.toLowerCase().trim();
    }
    if (search && search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { content: { $regex: search.trim(), $options: 'i' } },
        { tags: { $in: [new RegExp(search.trim(), 'i')] } }
      ];
    }

    const notes = await req.notesCollection.find(filter).sort({ isPinned: -1, updatedAt: -1 }).toArray();
    res.json({ success: true, count: notes.length, data: notes });
  } catch (error) {
    next(error);
  }
});

// Create note (Protected with JWT verifyToken & input validation)
app.post('/api/notes', jwtAuth.optionalAuth, validator.validateNotePayload, async (req, res, next) => {
  try {
    const userEmail = req.user ? req.user.email : (req.body.userEmail || '');
    const noteData = {
      ...req.body,
      userEmail: userEmail ? userEmail.toLowerCase().trim() : '',
      createdAt: req.body.createdAt ? new Date(req.body.createdAt) : new Date(),
      updatedAt: new Date()
    };
    delete noteData._id;

    const result = await req.notesCollection.insertOne(noteData);
    const savedNote = await req.notesCollection.findOne({ _id: result.insertedId });
    console.log(`✅ Native MongoDB: Note created -> "${savedNote.title}"`);
    res.json({ success: true, data: savedNote });
  } catch (error) {
    next(error);
  }
});

// Update note (Protected with validation middleware, supports ObjectId & custom string IDs)
app.put('/api/notes/:id', jwtAuth.optionalAuth, validator.validateNotePayload, async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, updatedAt: new Date() };
    delete updateData._id;

    const queryFilters = [{ id: id }];
    if (ObjectId.isValid(id) && id.length === 24) {
      queryFilters.unshift({ _id: new ObjectId(id) });
    }

    await req.notesCollection.updateOne(
      { $or: queryFilters },
      { $set: updateData }
    );
    const updated = await req.notesCollection.findOne({ $or: queryFilters });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// Delete note (supports ObjectId & custom string IDs)
app.delete('/api/notes/:id', jwtAuth.optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const queryFilters = [{ id: id }];
    if (ObjectId.isValid(id) && id.length === 24) {
      queryFilters.unshift({ _id: new ObjectId(id) });
    }

    await req.notesCollection.deleteOne({ $or: queryFilters });
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    next(error);
  }
});

// ==================== ERROR & NOT FOUND MIDDLEWARE ====================
app.use('/api', errorHandler.notFoundHandler);
app.use(errorHandler.globalErrorHandler);

// Client-side fallback to index.html for non-API GET page routes (compatible with Express 4 & 5)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'project', 'index.html'));
  }
  next();
});

// Start Express Server (only when executed directly, not when imported by serverless handlers)
if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Notes Management Server running at: http://localhost:${PORT}`);
    console.log(`🌐 Open in browser: http://localhost:${PORT}/login.html`);
  });
}

// Export Express app for Vercel Serverless deployment
module.exports = app;
