const express = require('express');
const router = express.Router();

// Temporary in-memory storage (replace with database in production)
const bookings = [];

// Create booking
router.post('/', async (req, res) => {
  try {
    const { start, end, name, email, eventDetails, paymentIntentId } = req.body;
    
    // Validate input
    if (!start || !end || !name || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newBooking = {
      id: `booking_${Date.now()}`,
      start,
      end,
      customer: { name, email },
      eventDetails,
      paymentIntentId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    bookings.push(newBooking);
    
    res.status(201).json(newBooking);
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get booking by ID
router.get('/:id', (req, res) => {
  const booking = bookings.find(b => b.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  res.json(booking);
});

module.exports = router;
