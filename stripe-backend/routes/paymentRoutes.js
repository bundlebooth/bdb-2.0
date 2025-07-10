const express = require('express');
const router = express.Router();
const stripe = require('stripe')(require('../config/config').stripe.secretKey);

// Create Payment Intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, metadata } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert dollars to cents
      currency: currency.toLowerCase(),
      metadata: metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    console.error('Payment intent error:', error);
    res.status(500).json({ 
      error: 'Payment processing failed',
      details: error.message 
    });
  }
});

// Webhook handler
router.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = require('../config/config').stripe.webhookSecret;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed.', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle events
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log(`💰 PaymentIntent status: ${paymentIntent.status}`);
      // TODO: Update your database here
      break;
    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object;
      console.log(`❌ Payment failed: ${failedIntent.last_payment_error?.message}`);
      // TODO: Update your database here
      break;
    case 'charge.succeeded':
      const charge = event.data.object;
      console.log(`💵 Charge id: ${charge.id}`);
      break;
    default:
      console.log(`🤷‍♀️ Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
