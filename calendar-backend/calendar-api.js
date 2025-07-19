require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { DateTime } = require('luxon');

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

// Constants
const TIMEZONE = 'America/New_York';
const SLOT_DURATION = 180; // 3 hours in minutes

// Health Check Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'BundleBooth Calendar API',
    timestamp: DateTime.now().setZone(TIMEZONE).toISO(),
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
// In your availability endpoint
app.get('/api/availability', async (req, res) => {
  try {
    const date = req.query.date;
    const accessToken = await getAccessToken();
    
    // Use America/New_York which automatically handles EST/EDT
    const timezone = 'America/New_York';
    
    // Define your desired time slots (will auto-adjust for DST)
    const timeSlots = [
      { display: '9:00 AM - 12:00 PM', start: '09:00', end: '12:00' },
      { display: '12:00 PM - 3:00 PM', start: '12:00', end: '15:00' },
      { display: '3:00 PM - 6:00 PM', start: '15:00', end: '18:00' },
      { display: '6:00 PM - 9:00 PM', start: '18:00', end: '21:00' },
      { display: '9:00 PM - 12:00 AM', start: '21:00', end: '00:00' }
    ];

    // Get events using the correct timezone
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${process.env.CALENDAR_OWNER_UPN}/calendar/events`,
      {
        params: {
          startDateTime: new Date(`${date}T00:00:00`).toLocaleString('en-US', { timeZone: timezone }),
          endDateTime: new Date(`${date}T23:59:59`).toLocaleString('en-US', { timeZone: timezone }),
          $select: 'start,end'
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const events = response.data.value || [];

    // Check availability
    const availability = timeSlots.map(slot => {
      const slotStart = new Date(`${date}T${slot.start}:00`);
      const slotEnd = new Date(`${date}T${slot.end}:00`);
      
      const isBooked = events.some(event => {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        return eventStart < slotEnd && eventEnd > slotStart;
      });

      return {
        display: slot.display,
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        booked: isBooked
      };
    });

    res.json({ date, availability });
  } catch (error) {
    console.error('Availability Error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});
// Booking Endpoint
app.post('/api/bookings', async (req, res) => {
  try {
    const { start, end, name, email, eventDetails } = req.body;
    const accessToken = await getAccessToken();

    // Use the correct timezone identifier that handles DST
    const timezone = 'America/New_York';

    const response = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${process.env.CALENDAR_OWNER_UPN}/events`,
      {
        subject: `Booking: ${name}`,
        start: {
          dateTime: start,
          timeZone: timezone // Using correct timezone
        },
        end: {
          dateTime: end,
          timeZone: timezone // Using correct timezone
        },
        body: {
          contentType: "HTML",
          content: `...your event details...`
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, eventId: response.data.id });
  } catch (error) {
    console.error('Booking Error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using timezone: ${TIMEZONE}`);
});
