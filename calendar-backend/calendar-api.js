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
          timeZone: 'Eastern Standard Time' // Explicitly set timezone
        },
        end: { 
          dateTime: end,
          timeZone: 'Eastern Standard Time' // Explicitly set timezone
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
