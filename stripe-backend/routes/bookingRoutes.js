const express = require('express');
const router = express.Router();

const bookings = [];

router.post('/', (req, res) => {
  try {
    const { start, end, customerName, customerEmail } = req.body;
    
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

router.get('/', (req, res) => {
  res.json(bookings);
});

module.exports = router;
