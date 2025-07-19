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
app.get('/api/availability', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date parameter (YYYY-MM-DD) is required' });
    }

    const accessToken = await getAccessToken();
    const calendarOwner = process.env.CALENDAR_OWNER_UPN;

    // Define time slots
    const timeSlots = [
      { start: '09:00:00', end: '12:00:00', display: '9:00 AM - 12:00 PM' },
      { start: '12:00:00', end: '15:00:00', display: '12:00 PM - 3:00 PM' },
      { start: '15:00:00', end: '18:00:00', display: '3:00 PM - 6:00 PM' },
      { start: '18:00:00', end: '21:00:00', display: '6:00 PM - 9:00 PM' },
      { start: '21:00:00', end: '00:00:00', display: '9:00 PM - 12:00 AM' }
    ];

    // Get all events for the day
    const startTime = DateTime.fromISO(`${date}T00:00:00`, { zone: TIMEZONE }).toISO();
    const endTime = DateTime.fromISO(`${date}T23:59:59`, { zone: TIMEZONE }).toISO();

    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${calendarOwner}/calendar/events`,
      {
        params: {
          startDateTime: startTime,
          endDateTime: endTime,
          $select: 'start,end'
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const events = response.data.value || [];

    // Check availability for each slot
    const availability = timeSlots.map(slot => {
      const slotStart = DateTime.fromISO(`${date}T${slot.start}`, { zone: TIMEZONE }).toISO();
      const slotEnd = DateTime.fromISO(`${date}T${slot.end}`, { zone: TIMEZONE }).toISO();

      const isBooked = events.some(event => {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        return (eventStart < new Date(slotEnd)) && (eventEnd > new Date(slotStart));
      });

      return {
        display: slot.display,
        start: slotStart,
        end: slotEnd,
        booked: isBooked
      };
    });

    res.json({ 
      date: date,
      timezone: TIMEZONE,
      availability: availability 
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
          timeZone: TIMEZONE
        },
        end: { 
          dateTime: end,
          timeZone: TIMEZONE
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
  console.log(`Using timezone: ${TIMEZONE}`);
});
