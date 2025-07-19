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

// Helper: Merge overlapping time slots
const mergeTimeSlots = (slots) => {
  if (slots.length === 0) return [];

  // Sort by start time
  const sortedSlots = [...slots].sort((a, b) => 
    new Date(a.start.dateTime) - new Date(b.start.dateTime)
  );

  const merged = [];
  let currentSlot = { ...sortedSlots[0] };

  for (let i = 1; i < sortedSlots.length; i++) {
    const nextSlot = sortedSlots[i];
    const currentEnd = new Date(currentSlot.end.dateTime);
    const nextStart = new Date(nextSlot.start.dateTime);

    // Merge if overlapping or adjacent
    if (nextStart <= currentEnd) {
      currentSlot.end.dateTime = new Date(
        Math.max(currentEnd, new Date(nextSlot.end.dateTime))
      ).toISOString();
    } else {
      merged.push(currentSlot);
      currentSlot = { ...nextSlot };
    }
  }
  merged.push(currentSlot); // Add the last slot
  return merged;
};

// Configure axios to always use ET timezone
const axios = require('axios');
const { DateTime } = require('luxon');

// AVAILABILITY ENDPOINT
app.get('/api/availability', async (req, res) => {
  try {
    const date = req.query.date;
    const timezone = 'America/New_York'; // Correct ET timezone
    
    // Define slots in ET
    const slots = [
      { start: '09:00', end: '12:00', display: '9:00 AM - 12:00 PM' },
      { start: '12:00', end: '15:00', display: '12:00 PM - 3:00 PM' },
      { start: '15:00', end: '18:00', display: '3:00 PM - 6:00 PM' },
      { start: '18:00', end: '21:00', display: '6:00 PM - 9:00 PM' },
      { start: '21:00', end: '00:00', display: '9:00 PM - 12:00 AM' }
    ];

    // Convert to proper ET datetime strings
    const availability = slots.map(slot => {
      const startET = DateTime.fromISO(`${date}T${slot.start}`, { zone: timezone });
      const endET = DateTime.fromISO(`${date}T${slot.end}`, { zone: timezone });
      
      return {
        display: slot.display,
        start: startET.toISO(),
        end: endET.toISO(),
        startET: startET.toFormat('h:mm a'),
        endET: endET.toFormat('h:mm a')
      };
    });

    res.json({ date, availability });
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// BOOKING ENDPOINT
app.post('/api/bookings', async (req, res) => {
  try {
    const { start, end, name, email } = req.body;
    const timezone = 'America/New_York';
    
    // Convert to ET explicitly
    const startET = DateTime.fromISO(start, { zone: timezone });
    const endET = DateTime.fromISO(end, { zone: timezone });

    const response = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${process.env.CALENDAR_OWNER_UPN}/events`,
      {
        subject: `Booking: ${name}`,
        start: {
          dateTime: startET.toISO(),
          timeZone: timezone
        },
        end: {
          dateTime: endET.toISO(),
          timeZone: timezone
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MICROSOFT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ 
      success: true,
      eventId: response.data.id,
      startET: startET.toFormat('h:mm a'),
      endET: endET.toFormat('h:mm a')
    });
  } catch (error) {
    console.error('Booking error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
