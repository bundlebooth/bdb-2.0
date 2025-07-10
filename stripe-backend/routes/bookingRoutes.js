const express = require('express');
const router = express.Router();

// Temporary in-memory storage
const bookings = [];

// Create Booking
router.post('/', (req, res) => {
  try {
    const { start, end, customerName, customerEmail } = req.body;
    
    if (!start || !end || !customerEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newBooking = {
      id: `booking_${Date.now()}`,
      start,
      end,
      customerName,
      customerEmail,
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };

    bookings.push(newBooking);
    res.status(201).json(newBooking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Bookings
router.get('/', (req, res) => {
  res.json(bookings);
});

module.exports = router;
