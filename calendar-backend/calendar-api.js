require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// CORS Configuration
app.use(cors({
  origin: [
    'https://your-godaddy-domain.com', // UPDATE THIS
    'http://localhost'
  ],
  methods: ['GET', 'POST']
}));

app.use(express.json());

// Microsoft Graph Authentication (Service Account)
const getAccessToken = async () => {
  const params = new URLSearchParams();
  params.append('client_id', process.env.MICROSOFT_CLIENT_ID);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('client_secret', process.env.MICROSOFT_CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');

  const response = await axios.post(
    `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
    params
  );
  return response.data.access_token;
};

// Get availability
app.get('/api/availability', async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30); // 30 days ahead
    
    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/calendar/getSchedule',
      {
        schedules: ['primary'],
        startTime: { dateTime: startDate.toISOString(), timeZone: 'UTC' },
        endTime: { dateTime: endDate.toISOString(), timeZone: 'UTC' }
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    res.json(response.data.value[0].scheduleItems);
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Create booking (called after Stripe payment)
app.post('/api/bookings', async (req, res) => {
  try {
    const { start, end, name, email, eventDetails } = req.body;
    const accessToken = await getAccessToken();
    
    await axios.post(
      'https://graph.microsoft.com/v1.0/me/events',
      {
        subject: `Booking: ${name}`,
        body: {
          contentType: "HTML",
          content: `
            <p>Client: ${name}</p>
            <p>Email: ${email}</p>
            <p>Event: ${eventDetails.eventName}</p>
            <p>Location: ${eventDetails.location}</p>
          `
        },
        start: { dateTime: start, timeZone: 'UTC' },
        end: { dateTime: end, timeZone: 'UTC' }
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
