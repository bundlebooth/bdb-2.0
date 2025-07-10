require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// CORS Configuration
app.use(cors({
  origin: [
    'https://bundlebooth.github.io',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health Check Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'BundleBooth Calendar API',
    timestamp: new Date().toISOString(),
    endpoints: {
      availability: '/api/availability?date=YYYY-MM-DD',
      bookings: '/api/bookings'
    }
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
    
    if (!response.data.access_token) {
      throw new Error('No access token received');
    }
    
    return response.data.access_token;
  } catch (error) {
    console.error('Token Error:', {
      message: error.message,
      response: error.response?.data
    });
    throw new Error('Failed to authenticate with Microsoft Graph');
  }
};

// Calendar Availability Endpoint
app.get('/api/availability', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date parameter (YYYY-MM-DD) is required' });
    }

    const accessToken = await getAccessToken();
    
    const response = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${process.env.CALENDAR_OWNER_UPN}/calendar/getSchedule`,
      {
        schedules: [process.env.CALENDAR_OWNER_UPN],
        startTime: { 
          dateTime: `${date}T00:00:00`,
          timeZone: 'UTC'
        },
        endTime: { 
          dateTime: `${date}T23:59:59`, 
          timeZone: 'UTC'
        },
        availabilityViewInterval: 60
      },
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data.value || response.data.value.length === 0) {
      return res.status(404).json({ error: 'No calendar data found' });
    }

    res.json({
      date: date,
      availability: response.data.value[0].scheduleItems || []
    });
  } catch (error) {
    console.error('Availability Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch availability',
      details: error.response?.data || error.message
    });
  }
});

// Booking Endpoint
app.post('/api/bookings', async (req, res) => {
  try {
    const { start, end, name, email, eventDetails } = req.body;
    
    if (!start || !end || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const accessToken = await getAccessToken();
    
    const response = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${process.env.CALENDAR_OWNER_UPN}/events`,
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
      eventId: response.data.id,
      eventLink: response.data.webLink
    });
  } catch (error) {
    console.error('Booking Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to create booking',
      details: error.response?.data || error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Configured for calendar owner:', process.env.CALENDAR_OWNER_UPN);
});
