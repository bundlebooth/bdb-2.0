const stripe = require('../config/stripeConfig');

exports.createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'cad' } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata: {
        integration_check: 'accept_a_payment'
      }
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.handlePaymentSuccess = async (req, res) => {
  try {
    const { paymentId, bookingDetails } = req.body;
    
    // Here you would typically:
    // 1. Verify the payment with Stripe
    // 2. Save booking details to your database
    // 3. Send confirmation email
    
    res.status(200).json({ 
      success: true,
      message: 'Payment processed successfully' 
    });
  } catch (error) {
    console.error('Error handling payment success:', error);
    res.status(500).json({ error: error.message });
  }
};
