const express = require('express');
const router = express.Router();
const { createPaymentIntent, handlePaymentSuccess } = require('../controllers/paymentController');

router.post('/create-payment-intent', createPaymentIntent);
router.post('/payment-success', handlePaymentSuccess);

module.exports = router;
