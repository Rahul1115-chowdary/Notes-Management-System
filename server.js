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
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
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

let db = null;
let usersCollection = null;
let notesCollection = null;

// Helper to derive formatted name from email
function deriveNameFromEmail(email) {
  if (!email) return 'User';
  const prefix = email.split('@')[0];
  const clean = prefix.replace(/[._-]/g, ' ');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Connect to MongoDB using native MongoClient driver
async function initMongoDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    usersCollection = db.collection('users');
    notesCollection = db.collection('notes');
    console.log(`✅ Native MongoDB Client connected to: ${MONGO_URI}/${DB_NAME}`);
  } catch (err) {
    console.error('❌ Native MongoDB Client connection error:', err.message);
  }
}

initMongoDB();

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

    await usersCollection.updateOne(
      { email: emailLower },
      { $set: userData, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    const user = await usersCollection.findOne({ email: emailLower });
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
    let user = await usersCollection.findOne({ email: emailLower });

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
      await usersCollection.insertOne(newUserDoc);
      user = await usersCollection.findOne({ email: emailLower });
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

    await usersCollection.updateOne(
      { email: emailLower },
      { $set: userData, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    const user = await usersCollection.findOne({ email: emailLower });
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
    const user = await usersCollection.findOne({ email: req.user.email });
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

// Get all notes (supports optional auth or query filter)
app.get('/api/notes', jwtAuth.optionalAuth, async (req, res, next) => {
  try {
    const userEmail = req.user ? req.user.email : req.query.userEmail;
    const filter = userEmail ? { userEmail: userEmail.toLowerCase().trim() } : {};
    const notes = await notesCollection.find(filter).sort({ updatedAt: -1 }).toArray();
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
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await notesCollection.insertOne(noteData);
    const savedNote = await notesCollection.findOne({ _id: result.insertedId });
    console.log(`✅ Native MongoDB: Note created -> "${savedNote.title}"`);
    res.json({ success: true, data: savedNote });
  } catch (error) {
    next(error);
  }
});

// Update note (Protected with validation middleware)
app.put('/api/notes/:id', jwtAuth.optionalAuth, validator.validateNotePayload, async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body, updatedAt: new Date() };
    delete updateData._id;

    let queryId = id;
    try { queryId = new ObjectId(id); } catch(e){}

    await notesCollection.updateOne(
      { _id: queryId },
      { $set: updateData }
    );
    const updated = await notesCollection.findOne({ _id: queryId });
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// Delete note
app.delete('/api/notes/:id', jwtAuth.optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    let queryId = id;
    try { queryId = new ObjectId(id); } catch(e){}

    await notesCollection.deleteOne({ _id: queryId });
    res.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    next(error);
  }
});

// ==================== ERROR & NOT FOUND MIDDLEWARE ====================
app.use('/api', errorHandler.notFoundHandler);
app.use(errorHandler.globalErrorHandler);

// Start Express Server
app.listen(PORT, () => {
  console.log(`🚀 Middleware-Protected Server running at: http://localhost:${PORT}`);
  console.log(`🌐 Open in browser: http://localhost:${PORT}/login.html`);
});
