require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: [
    'https://www.bundlebooth.ca',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type']
}));

// Add this handler for preflight requests
app.options('*', cors());

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'BundleBooth Calendar API',
    timestamp: new Date().toISOString()
  });
});

// Microsoft Graph Authentication
const getAccessToken = async () => {
  try {
    const params = new URLSearchParams();
    params.append('client_id', process.env.MICROSOFT_CLIENT_ID);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('client_secret', process.env.MICROSOFT_CLIENT_SECRET);
    params.append('grant_type', 'client_credentials');

    const response = await axios.post(
      `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Token error:', error.response?.data || error.message);
    throw new Error('Failed to get access token');
  }
};

// Get availability for specific date
app.get('/api/availability', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    const accessToken = await getAccessToken();
    
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1); // Next day
    
    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/calendar/getSchedule',
      {
        schedules: ['primary'],
        startTime: { 
          dateTime: startDate.toISOString(),
          timeZone: 'UTC'
        },
        endTime: { 
          dateTime: endDate.toISOString(),
          timeZone: 'UTC'
        },
        availabilityViewInterval: 60 // 60-minute intervals
      },
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data.value || !response.data.value[0]) {
      return res.status(404).json({ error: 'No calendar data found' });
    }

    res.json({
      date: date,
      availability: response.data.value[0].scheduleItems || []
    });
  } catch (error) {
    console.error('Availability error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch availability',
      details: error.response?.data || error.message
    });
  }
});

// Create booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { start, end, name, email, eventDetails } = req.body;
    
    if (!start || !end || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const accessToken = await getAccessToken();
    
    const eventResponse = await axios.post(
      'https://graph.microsoft.com/v1.0/me/events',
      {
        subject: `Booking: ${name}`,
        body: {
          contentType: "HTML",
          content: `
            <p>Client: ${name}</p>
            <p>Email: ${email}</p>
            <p>Event: ${eventDetails?.eventName || 'Not specified'}</p>
            <p>Location: ${eventDetails?.location || 'Not specified'}</p>
            <p>Guests: ${eventDetails?.guestCount || 'Not specified'}</p>
            <p>Notes: ${eventDetails?.notes || 'None'}</p>
          `
        },
        start: { 
          dateTime: start,
          timeZone: 'UTC'
        },
        end: { 
          dateTime: end,
          timeZone: 'UTC'
        }
      },
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ 
      success: true,
      eventId: eventResponse.data.id,
      eventLink: eventResponse.data.webLink
    });
  } catch (error) {
    console.error('Booking error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to create booking',
      details: error.response?.data || error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation:`);
  console.log(`- GET  /               : Health check`);
  console.log(`- GET  /api/availability: Check calendar availability`);
  console.log(`- POST /api/bookings   : Create new booking`);
});
