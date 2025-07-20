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
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'BundleBooth Email Service',
    timestamp: new Date()
  });
});

// Email endpoint
app.post('/send-booking-email', async (req, res) => {
  try {
    const requiredFields = ['contactName', 'email', 'eventName'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ 
          success: false,
          error: `Missing required field: ${field}`
        });
      }
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
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    table { border-collapse: collapse; width: 100%; max-width: 600px; margin: 0 auto; }
    td { padding: 15px; vertical-align: top; }
    .header { background-color: #f8f8f8; text-align: center; }
    .footer { background-color: #f8f8f8; text-align: center; font-size: 14px; }
    .service-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .service-table th { text-align: left; padding: 8px; background-color: #f2f2f2; }
    .service-table td { padding: 8px; border-bottom: 1px solid #ddd; }
    .total-row { font-weight: bold; border-top: 2px solid #333; }
    .discount-row { color: #27ae60; }
    .logo { max-width: 200px; height: auto; margin-bottom: 20px; }
  </style>
</head>
<body>
  <table>
    <!-- Header with Logo -->
    <tr>
      <td class="header">
        <img src="https://img1.wsimg.com/isteam/ip/e5031132-8c20-44e3-a810-901cf200c927/BundleBooth_Logo_FULL_FINAL%25202%2520large.png" alt="BundleBooth Logo" class="logo">
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">${eventName}</div>
        <div>Your event booking has been confirmed</div>
      </td>
    </tr>
    
    <!-- Content -->
    <tr>
      <td>
        <h3 style="margin-top: 0;">Contact Information:</h3>
        <div style="margin: 20px 0;">
          <div><strong>Your Name:</strong> ${contactName}</div>
          <div><strong>Email:</strong> ${email}</div>
          <div><strong>Phone Number:</strong> ${phone || 'Not specified'}</div>
        </div>

        <h3>Event Details:</h3>
        <div style="margin: 20px 0;">
          <div><strong>Event Name:</strong> ${eventName}</div>
          <div><strong>Event Type:</strong> ${eventType || 'Not specified'}</div>
          <div><strong>Event Date:</strong> ${formattedDate}</div>
          <div><strong>Time Slot:</strong> ${timeSlotDisplay || 'Not specified'}</div>
          <div><strong>Duration:</strong> 3 hours</div>
          <div><strong>Location:</strong> ${formattedLocation}</div>
        </div>

        ${specialRequests ? `
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
          <h4 style="margin-top: 0;">Special Requests/Notes:</h4>
          <p>${specialRequests}</p>
        </div>
        ` : ''}
        
        <h3>Bundle Information:</h3>
        <div style="margin: 20px 0;">
          <div><strong>Bundle Name:</strong> ${bundleName || 'Custom Bundle'}</div>
          ${bundleDescription ? `<div><strong>Description:</strong> ${bundleDescription}</div>` : ''}
        </div>
        
        <h3>Services Booked:</h3>
        <table class="service-table">
          <tr>
            <th>Service</th>
            <th>Category</th>
            <th>Options</th>
            <th style="text-align: right;">Price</th>
          </tr>
          ${services.map(service => `
          <tr>
            <td>${service.name}</td>
            <td>${service.ServiceType}</td>
            <td>
              ${service.selectedTier ? `
                ${service.ServiceType === "Sweets and Brews" ? `Guests: ${service.selectedTier.value}` : ''}
                ${service.ServiceType === "Scene Setters" && service.slug === "sparklers-box" ? `Quantity: ${service.selectedTier.value} sparklers` : ''}
                ${service.ServiceType === "Interactive Booths" && service.slug === "photo-booth" ? `Option: ${service.selectedTier.label}` : ''}
              ` : 'Standard'}
            </td>
            <td style="text-align: right;">C$${(service.selectedPrice || service.price || 0).toFixed(2)}</td>
          </tr>
          `).join('')}
          
          <!-- Subtotal -->
          <tr>
            <td colspan="3" style="text-align: right; font-weight: bold;">Subtotal:</td>
            <td style="text-align: right;">C$${calculatedSubtotal.toFixed(2)}</td>
          </tr>
          
          <!-- Bundle Discount -->
          ${discount > 0 ? `
          <tr class="discount-row">
            <td colspan="3" style="text-align: right; font-weight: bold;">
              ${selectedBundle.discountPercentage > 0 ? `Bundle Discount (${selectedBundle.discountPercentage}%)` : 'Bundle Discount'}:
            </td>
            <td style="text-align: right;">-C$${discount.toFixed(2)}</td>
          </tr>
          ` : ''}

          <!-- Promo Discount -->
          ${promoDiscount > 0 ? `
          <tr class="discount-row">
            <td colspan="3" style="text-align: right; font-weight: bold;">
              Promo Discount:
            </td>
            <td style="text-align: right;">-C$${promoDiscount.toFixed(2)}</td>
          </tr>
          ` : ''}
          
          <!-- Total -->
          <tr class="total-row">
            <td colspan="3" style="text-align: right;">Total:</td>
            <td style="text-align: right;">C$${calculatedTotal.toFixed(2)}</td>
          </tr>
        </table>
        
        <h3>Payment Information:</h3>
        <div style="margin: 20px 0;">
          <div><strong>Payment Method:</strong> Credit Card</div>
          <div><strong>Amount Paid:</strong> C$${calculatedTotal.toFixed(2)}</div>
          <div><strong>Payment Date:</strong> ${new Date().toLocaleDateString()}</div>
          ${transactionId ? `<div><strong>Transaction ID:</strong> ${transactionId}</div>` : ''}
          ${paymentStatus ? `<div><strong>Payment Status:</strong> ${paymentStatus}</div>` : ''}
        </div>
        
        <p>Thank you for choosing BundleBooth, ${contactName}!</p>
        <p>We'll be in touch soon to confirm the details of your event.</p>
        
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
          <h4 style="margin-top: 0;">Important Notes:</h4>
          <ul style="margin: 0; padding-left: 20px;">
            <li>Your booking is confirmed. A payment of C$${calculatedTotal.toFixed(2)} was processed.</li>
            <li>Final details must be confirmed 14 days before the event.</li>
            <li>For any changes, please contact us at least 7 days before the event.</li>
            <li>All times are in Eastern Time Zone (EST)</li>
          </ul>
        </div>
      </td>
    </tr>
    
    <!-- Footer -->
    <tr>
      <td class="footer">
        <p>Need to make changes? <a href="mailto:support@bundlebooth.ca" style="color: #4CAF50;">Contact us</a></p>
        <p>© ${new Date().getFullYear()} BundleBooth. All rights reserved.</p>
      </td>
    </tr>
  </table>
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
      details: error.response?.body || null
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
