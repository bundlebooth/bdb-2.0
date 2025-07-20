require('dotenv').config();
const express = require('express');
const Brevo = require('@getbrevo/brevo');
const cors = require('cors');
const app = express();

// CORS Configuration
app.use(cors({
  origin: [
    'https://bundlebooth.github.io',
    'http://localhost:3000',
    'https://bundlebooth.ca'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configure Brevo
const defaultClient = Brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'BundleBooth Email Service',
    timestamp: new Date()
  });
});

// Email endpoint
app.post('/send-booking-email', async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['contactName', 'email', 'eventName'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Destructure request body
    const { 
      contactName, 
      email, 
      phone,
      eventName, 
      eventType,
      eventDate, 
      timeSlotDisplay,
      eventLocation, 
      specialRequests,
      services = [],
      bundleName,
      bundleDescription,
      selectedBundle = {},
      transactionId,
      paymentStatus,
      subtotal,
      discount,
      promoDiscount,
      total
    } = req.body;

    // Format values
    const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : 'Not specified';

    const formattedLocation = eventLocation || 'Not specified';
    const calculatedSubtotal = subtotal || services.reduce((sum, service) => sum + (service.selectedPrice || service.price || 0), 0);
    const calculatedTotal = total || Math.max(0, (calculatedSubtotal - (discount || 0)) - (promoDiscount || 0));

    // Create email
    const apiInstance = new Brevo.TransactionalEmailsApi();
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = {
      email: process.env.FROM_EMAIL || 'hello@bundlebooth.ca',
      name: process.env.FROM_NAME || 'BundleBooth'
    };
    
    sendSmtpEmail.to = [{ email, name: contactName }];
    sendSmtpEmail.subject = `Booking Confirmation - ${eventName}`;
    sendSmtpEmail.htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Booking Confirmation</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { max-width: 200px; height: auto; margin-bottom: 20px; }
    h1 { color: #2c3e50; font-size: 24px; margin-bottom: 10px; }
    .section { margin-bottom: 25px; }
    .section-title { font-size: 18px; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 15px; }
    .info-row { display: flex; margin-bottom: 8px; }
    .info-label { font-weight: bold; width: 150px; }
    .service-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .service-table th { text-align: left; padding: 8px; background-color: #f5f5f5; }
    .service-table td { padding: 8px; border-bottom: 1px solid #eee; }
    .total-row { font-weight: bold; border-top: 2px solid #333; }
    .discount { color: #27ae60; }
    .footer { margin-top: 30px; font-size: 14px; text-align: center; color: #777; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://img1.wsimg.com/isteam/ip/e5031132-8c20-44e3-a810-901cf200c927/BundleBooth_Logo_FULL_FINAL%25202%2520large.png" alt="BundleBooth Logo" class="logo">
    <h1>Booking Confirmation - ${eventName}</h1>
    <p>Thank you for your booking with BundleBooth!</p>
  </div>

  <div class="section">
    <h2 class="section-title">Contact Information</h2>
    <div class="info-row">
      <div class="info-label">Your Name:</div>
      <div>${contactName}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Email:</div>
      <div>${email}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Phone:</div>
      <div>${phone || 'Not provided'}</div>
    </div>
  </div>

  <div class="section">
    <h2 class="section-title">Event Details</h2>
    <div class="info-row">
      <div class="info-label">Event Name:</div>
      <div>${eventName}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Event Type:</div>
      <div>${eventType || 'Not specified'}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Date:</div>
      <div>${formattedDate}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Time:</div>
      <div>${timeSlotDisplay || 'Not specified'}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Location:</div>
      <div>${formattedLocation}</div>
    </div>
  </div>

  ${specialRequests ? `
  <div class="section">
    <h2 class="section-title">Special Requests</h2>
    <p>${specialRequests}</p>
  </div>
  ` : ''}

  <div class="section">
    <h2 class="section-title">Services Booked</h2>
    <table class="service-table">
      <thead>
        <tr>
          <th>Service</th>
          <th>Details</th>
          <th style="text-align: right;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${services.map(service => `
        <tr>
          <td>${service.name}</td>
          <td>
            ${service.selectedTier ? `
              ${service.ServiceType === "Sweets and Brews" ? `For ${service.selectedTier.value} guests` : ''}
              ${service.ServiceType === "Scene Setters" ? `${service.selectedTier.value} sparklers` : ''}
              ${service.ServiceType === "Interactive Booths" ? service.selectedTier.label : ''}
            ` : 'Standard'}
          </td>
          <td style="text-align: right;">C$${(service.selectedPrice || service.price || 0).toFixed(2)}</td>
        </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="2">Subtotal:</td>
          <td style="text-align: right;">C$${calculatedSubtotal.toFixed(2)}</td>
        </tr>
        ${discount > 0 ? `
        <tr class="discount">
          <td colspan="2">Bundle Discount:</td>
          <td style="text-align: right;">-C$${discount.toFixed(2)}</td>
        </tr>
        ` : ''}
        ${promoDiscount > 0 ? `
        <tr class="discount">
          <td colspan="2">Promo Discount:</td>
          <td style="text-align: right;">-C$${promoDiscount.toFixed(2)}</td>
        </tr>
        ` : ''}
        <tr class="total-row">
          <td colspan="2">Total:</td>
          <td style="text-align: right;">C$${calculatedTotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2 class="section-title">Payment Information</h2>
    <div class="info-row">
      <div class="info-label">Payment Method:</div>
      <div>Credit Card</div>
    </div>
    <div class="info-row">
      <div class="info-label">Amount Paid:</div>
      <div>C$${calculatedTotal.toFixed(2)}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Payment Date:</div>
      <div>${new Date().toLocaleDateString()}</div>
    </div>
    ${transactionId ? `
    <div class="info-row">
      <div class="info-label">Transaction ID:</div>
      <div>${transactionId}</div>
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <p>Thank you for choosing BundleBooth!</p>
    <p>If you have any questions, please contact us at hello@bundlebooth.ca</p>
    <p>© ${new Date().getFullYear()} BundleBooth. All rights reserved.</p>
  </div>
</body>
</html>
    `;

    // Send email
    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    res.json({ 
      success: true,
      messageId: data.messageId,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : null
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BundleBooth Email Service running on port ${PORT}`);
});
