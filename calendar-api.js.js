require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const MicrosoftStrategy = require('passport-microsoft').Strategy;

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.use(passport.initialize());
app.use(passport.session());

// Microsoft OAuth Setup
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: `${process.env.BACKEND_URL}/api/auth/microsoft/callback`,
  scope: ['openid', 'profile', 'email', 'Calendars.ReadWrite']
}, (accessToken, refreshToken, profile, done) => {
  return done(null, { 
    id: profile.id, 
    email: profile._json.email,
    accessToken 
  });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Routes
app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: req.isAuthenticated(), user: req.user || null });
});

app.get('/api/auth/microsoft', passport.authenticate('microsoft'));

app.get('/api/auth/microsoft/callback', 
  passport.authenticate('microsoft', { 
    successRedirect: process.env.FRONTEND_URL,
    failureRedirect: '/api/auth/failed'
  })
);

app.get('/api/auth/logout', (req, res) => {
  req.logout(() => res.redirect(process.env.FRONTEND_URL));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));