require('dotenv').config();
const express = require('express');
const Brevo = require('@getbrevo/brevo');
const app = express();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

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
    const { 
      contactName, 
      email, 
      phoneNumber,
      eventName, 
      eventType,
      eventDate, 
      durationHours,
      eventLocation, 
      specialRequests,
      services = [] 
    } = req.body;

    // Validation
    if (!email || !contactName || !eventName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Format services
    const servicesList = services.map(s => 
      `<tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${s.name || 'Service'}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">C$${(s.price || 0).toFixed(2)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="2">No services selected</td></tr>';

    // Calculate total
    const total = services.reduce((sum, s) => sum + (s.price || 0), 0);

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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background-color: white; border-left: 1px solid #eee; border-right: 1px solid #eee; }
        .footer { background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; }
        .event-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .event-details { margin: 20px 0; }
        .detail-row { display: flex; margin-bottom: 10px; }
        .detail-label { font-weight: bold; width: 150px; }
        .services-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .total-row { font-weight: bold; border-top: 2px solid #333; }
        .button { 
          display: inline-block; padding: 10px 20px; background-color: #4CAF50; 
          color: white; text-decoration: none; border-radius: 4px; margin: 10px 0;
        }
        .special-requests { background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="event-title">${eventName}</div>
        <div>Your event booking has been confirmed</div>
      </div>
      
      <div class="content">
        <h3>Contact Information:</h3>
        <div class="event-details">
          <div class="detail-row">
            <div class="detail-label">Your Name:</div>
            <div>${contactName}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Email:</div>
            <div>${email}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Phone Number:</div>
            <div>${phoneNumber || 'Not provided'}</div>
          </div>
        </div>

        <h3>Event Details:</h3>
        <div class="event-details">
          <div class="detail-row">
            <div class="detail-label">Event Name:</div>
            <div>${eventName}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Event Type:</div>
            <div>${eventType || 'Not specified'}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Event Date:</div>
            <div>${eventDate || 'Not specified'}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Duration:</div>
            <div>${durationHours || 'Not specified'} hours</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Location:</div>
            <div>${eventLocation || 'Location not specified'}</div>
          </div>
        </div>

        ${specialRequests ? `
        <div class="special-requests">
          <h4>Special Requests/Notes:</h4>
          <p>${specialRequests}</p>
        </div>
        ` : ''}
        
        <h3>Services Booked:</h3>
        <table class="services-table">
          ${servicesList}
          <tr class="total-row">
            <td style="padding: 8px 0;">Total</td>
            <td style="padding: 8px 0; text-align: right;">C$${total.toFixed(2)}</td>
          </tr>
        </table>
        
        <p>Thank you for choosing BundleBooth, ${contactName}!</p>
        <p>We'll be in touch soon to confirm the details of your event.</p>
        
        <a href="#" class="button">View Booking Details</a>
      </div>
      
      <div class="footer">
        <p>Need to make changes? <a href="#">Contact us</a> or <a href="#">Cancel booking</a></p>
        <p>© ${new Date().getFullYear()} ${process.env.FROM_NAME || 'BundleBooth'}. All rights reserved.</p>
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
      details: error.response?.body || null
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Brevo API Key: ${process.env.BREVO_API_KEY ? 'Configured' : 'Missing'}`);
});
