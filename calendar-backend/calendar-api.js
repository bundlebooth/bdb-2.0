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

// Calendar Availability Endpoint (Final Optimized Version)
// In calendar-api.js
app.get('/api/availability', async (req, res) => {
  try {
    const date = req.query.date;
    const accessToken = await getAccessToken();
    
    // Define slots in EST
    const timeSlots = [
      { start: '09:00:00', end: '12:00:00' },
      { start: '12:00:00', end: '15:00:00' },
      // ... other slots
    ];

    // Check availability for each EST slot
    const availability = await Promise.all(timeSlots.map(async (slot) => {
      const startEST = `${date}T${slot.start}-05:00`;
      const endEST = `${date}T${slot.end}-05:00`;
      
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${process.env.CALENDAR_OWNER_UPN}/calendar/events`,
        {
          params: {
            startDateTime: startEST,
            endDateTime: endEST,
            $select: 'start,end'
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        display: `${formatTime(slot.start)} - ${formatTime(slot.end)}`,
        start: startEST,
        end: endEST,
        booked: response.data.value.length > 0
      };
    }));

    res.json({ date, availability });
  } catch (error) {
    console.error('Availability Error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

function formatTime(timeStr) {
  const [hours, minutes] = timeStr.split(':');
  const hourNum = parseInt(hours);
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  const displayHour = hourNum % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

// Booking Endpoint (Unchanged)
// In calendar-api.js
app.post('/api/bookings', async (req, res) => {
  try {
    const { start, end, name, email, eventDetails } = req.body;
    const accessToken = await getAccessToken();

    // EXPLICITLY set timezone for Microsoft Graph
    const response = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${process.env.CALENDAR_OWNER_UPN}/events`,
      {
        subject: `Booking: ${name}`,
        start: { 
          dateTime: start,  // Keep as ISO string but...
          timeZone: 'Eastern Standard Time' // THIS IS CRUCIAL
        },
        end: { 
          dateTime: end,
          timeZone: 'Eastern Standard Time' // MUST specify here too
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
});
