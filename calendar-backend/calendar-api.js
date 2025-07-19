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
app.get('/api/availability', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date parameter (YYYY-MM-DD) is required' });
    }

    const accessToken = await getAccessToken();
    const calendarOwner = process.env.CALENDAR_OWNER_UPN;
    const startTime = `${date}T00:00:00`;
    const endTime = `${date}T23:59:59`;

    // Fetch schedule (free/busy) data
    const scheduleResponse = await axios.post(
      `https://graph.microsoft.com/v1.0/users/${calendarOwner}/calendar/getSchedule`,
      {
        schedules: [calendarOwner],
        startTime: { dateTime: startTime, timeZone: 'UTC' },
        endTime: { dateTime: endTime, timeZone: 'UTC' },
        availabilityViewInterval: 60
      },
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!scheduleResponse.data.value || scheduleResponse.data.value.length === 0) {
      return res.status(404).json({ error: 'No calendar data found' });
    }

    // Merge overlapping slots
    const mergedSlots = mergeTimeSlots(scheduleResponse.data.value[0].scheduleItems || []);

    // Fetch actual events
    const eventsResponse = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${calendarOwner}/calendar/events`,
      {
        params: {
          startDateTime: startTime,
          endDateTime: endTime,
          $select: 'subject,start,end'
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const events = eventsResponse.data.value || [];

    // Map to final availability (with booked status)
    const availability = mergedSlots.map(slot => {
      const slotStart = new Date(slot.start.dateTime);
      const slotEnd = new Date(slot.end.dateTime);
      const isBooked = events.some(event => {
        const eventStart = new Date(event.start.dateTime);
        const eventEnd = new Date(event.end.dateTime);
        return (eventStart < slotEnd && eventEnd > slotStart);
      });

      return {
        start: slot.start.dateTime,
        end: slot.end.dateTime,
        status: slot.status || 'busy', // Default to 'busy' if undefined
        booked: isBooked
      };
    });

    res.json({ 
      date: date,
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

// Booking Endpoint (Unchanged)
// In the booking endpoint, ensure timezone is properly handled:
// Booking Endpoint (Fixed Timezone Handling)
// Booking Endpoint (Fixed Timezone Handling)
app.post('/api/bookings', async (req, res) => {
  try {
    const { startTime, endTime, name, email, eventDetails } = req.body;
    
    // Validate input
    if (!startTime || !endTime || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate date format
    if (isNaN(new Date(startTime).getTime()) {
      return res.status(400).json({ error: 'Invalid start time format' });
    }
    if (isNaN(new Date(endTime).getTime())) {
      return res.status(400).json({ error: 'Invalid end time format' });
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
            <p>Notes: ${eventDetails?.notes || 'None'}</p>
          `
        },
        start: {
          dateTime: startTime,
          timeZone: 'UTC'
        },
        end: {
          dateTime: endTime,
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
});
