require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const MicrosoftStrategy = require('passport-microsoft').Strategy;

const app = express();

// Enhanced CORS Configuration
app.use(cors({
  origin: [
    'http://localhost',
    'http://127.0.0.1',
    'https://bdb-2-0-calendar-api-backend.onrender.com',
    'https://bundlebooth-calendar-backend.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Microsoft OAuth Configuration
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: `${process.env.BACKEND_URL}/api/auth/microsoft/callback`,
  scope: ['openid', 'profile', 'email', 'Calendars.ReadWrite']
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Health Check Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'BundleBooth Calendar API',
    timestamp: new Date()
  });
});

// Auth Endpoints
app.get('/api/auth/status', (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.user || null
  });
});

app.get('/api/auth/microsoft', passport.authenticate('microsoft'));

app.get('/api/auth/microsoft/callback',
  passport.authenticate('microsoft', {
    successRedirect: process.env.FRONTEND_URL,
    failureRedirect: `${process.env.FRONTEND_URL}?auth_error=1`
  })
);

app.get('/api/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect(process.env.FRONTEND_URL);
  });
});

// Calendar API Endpoints
app.get('/api/calendar/busy-times', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Add your actual calendar availability logic here
  res.json([]); // Return empty array for now
});

app.post('/api/calendar/book', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Add your actual booking logic here
  res.json({ success: true }); // Return success for now
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS-enabled for origins: ${process.env.FRONTEND_URL}`);
});
