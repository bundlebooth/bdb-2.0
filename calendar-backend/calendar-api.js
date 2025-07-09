require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const axios = require('axios');

const app = express();

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost',
    'http://127.0.0.1',
    'https://bundlebooth-calendar-backend.onrender.com',
    'https://your-godaddy-domain.com' // UPDATE THIS
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Microsoft OAuth
passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  callbackURL: `${process.env.BACKEND_URL}/api/auth/microsoft/callback`,
  scope: ['openid', 'profile', 'email', 'Calendars.ReadWrite']
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Helper to get Microsoft Graph client
function getGraphClient(accessToken) {
  return axios.create({
    baseURL: 'https://graph.microsoft.com/v1.0',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

// Auth Endpoints
app.get('/api/auth/status', (req, res) => {
  res.json({ authenticated: req.isAuthenticated() });
});

app.get('/api/auth/microsoft', passport.authenticate('microsoft'));

app.get('/api/auth/microsoft/callback',
  passport.authenticate('microsoft', {
    successRedirect: `${process.env.FRONTEND_URL}/Step3.html`,
    failureRedirect: `${process.env.FRONTEND_URL}/Step3.html?auth_error=1`
  })
);

// Calendar Endpoints
app.get('/api/availability', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const graphClient = getGraphClient(req.user.accessToken);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30); // 30 days availability
    
    const response = await graphClient.post('/me/calendar/getSchedule', {
      schedules: ['primary'],
      startTime: { dateTime: startDate.toISOString(), timeZone: 'UTC' },
      endTime: { dateTime: endDate.toISOString(), timeZone: 'UTC' }
    });

    res.json(response.data.value[0].scheduleItems);
  } catch (error) {
    console.error('Calendar error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

app.post('/api/bookings', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { start, end, name, email, eventDetails } = req.body;
    const graphClient = getGraphClient(req.user.accessToken);
    
    const event = {
      subject: `Booking: ${name}`,
      body: {
        contentType: "HTML",
        content: `
          <p>Client: ${name}</p>
          <p>Email: ${email}</p>
          <p>Event: ${eventDetails.eventName}</p>
          <p>Location: ${eventDetails.location}</p>
          <p>Guests: ${eventDetails.guestCount}</p>
          <p>Notes: ${eventDetails.notes}</p>
        `
      },
      start: { dateTime: start, timeZone: 'UTC' },
      end: { dateTime: end, timeZone: 'UTC' }
    };

    await graphClient.post('/me/events', event);
    res.json({ success: true });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
