require('dotenv').config();
const express = require('express');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const app = express();

// Configure Brevo
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY; // Make sure this is set in Render.com environment variables

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'Server is running',
    timestamp: new Date(),
    endpoints: {
      email: 'POST /send-booking-email'
    }
  });
});

// Email endpoint - THE MAIN ENDPOINT YOU NEED
app.post('/send-booking-email', async (req, res) => {
  try {
    const { email, contactName, eventName, services = [] } = req.body;

    // Basic validation
    if (!email || !contactName || !eventName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.sender = {
      email: process.env.FROM_EMAIL || 'hello@bundlebooth.ca',
      name: process.env.FROM_NAME || 'BundleBooth'
    };
    sendSmtpEmail.to = [{ email, name: contactName }];
    sendSmtpEmail.subject = `Booking Confirmation - ${eventName}`;
    
    // Format services list
    const servicesList = services.map(s => 
      `${s.name || 'Service'}: C$${(s.price || 0).toFixed(2)}`
    ).join('<br>');

    sendSmtpEmail.htmlContent = `
      <h2>Thank you, ${contactName}!</h2>
      <p>Your booking for <strong>${eventName}</strong> is confirmed.</p>
      <h3>Services Booked:</h3>
      ${servicesList}
      <p>We'll contact you shortly at ${email}.</p>
    `;

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);

    res.json({ 
      success: true,
      messageId: response.messageId,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.response?.body || null
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
