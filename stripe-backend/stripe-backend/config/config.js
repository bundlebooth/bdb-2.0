require('dotenv').config();

module.exports = {
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    publicKey: process.env.STRIPE_PUBLIC_KEY
  },
  server: {
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development'
  },
  email: {
    sendGridKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.FROM_EMAIL
  }
};
