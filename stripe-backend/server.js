require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'application/json' }));

// New endpoint for frontend config
app.get('/api/config', (req, res) => {
  res.json({
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY
  });
});

app.get('/api/availability', async (req, res) => {
  try {
    const { date } = req.query;
    const availability = [
      {
        start: `${date}T09:00:00`,
        end: `${date}T12:00:00`
      },
      {
        start: `${date}T12:00:00`,
        end: `${date}T15:00:00`
      },
      {
        start: `${date}T15:00:00`,
        end: `${date}T18:00:00`
      }
    ];
    res.json({ availability });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'cad' } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency,
      automatic_payment_methods: { enabled: true }
    });
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const booking = {
      ...req.body,
      id: `booking_${Date.now()}`,
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };
    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'live',
    service: 'BDB 2.0 Stripe Backend',
    timestamp: new Date().toISOString() 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
