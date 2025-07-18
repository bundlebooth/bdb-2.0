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
  <title>Booking Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <!-- Outer table with fixed width -->
  <table width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="600" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
          <!-- Header -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">${eventName}</div>
              <div>Your event booking has been confirmed</div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px; background-color: white; border-left: 1px solid #eee; border-right: 1px solid #eee;">
              <h3 style="margin-top: 0;">Contact Information:</h3>
              <div style="margin: 20px 0;">
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Your Name:</div>
                  <div>${contactName}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Email:</div>
                  <div>${email}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Phone Number:</div>
                  <div>${phoneNumber || 'Not provided'}</div>
                </div>
              </div>

              <h3>Event Details:</h3>
              <div style="margin: 20px 0;">
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Event Name:</div>
                  <div>${eventName}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Event Type:</div>
                  <div>${eventType || 'Not specified'}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Event Date:</div>
                  <div>${eventDate || 'Not specified'}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Duration:</div>
                  <div>${durationHours || 'Not specified'} hours</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Location:</div>
                  <div>${eventLocation || 'Location not specified'}</div>
                </div>
              </div>

              ${specialRequests ? `
              <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                <h4 style="margin-top: 0;">Special Requests/Notes:</h4>
                <p>${specialRequests}</p>
              </div>
              ` : ''}
              
              <h3>Services Booked:</h3>
              <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 20px 0;">
                ${servicesList}
                <tr style="font-weight: bold; border-top: 2px solid #333;">
                  <td style="padding: 8px 0;">Total</td>
                  <td style="padding: 8px 0; text-align: right;">C$${total.toFixed(2)}</td>
                </tr>
              </table>
              
              <p>Thank you for choosing BundleBooth, ${contactName}!</p>
              <p>We'll be in touch soon to confirm the details of your event.</p>
              
              <a href="#" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0;">View Booking Details</a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px;">
              <p>Need to make changes? <a href="#" style="color: #4CAF50;">Contact us</a> or <a href="#" style="color: #4CAF50;">Cancel booking</a></p>
              <p>© ${new Date().getFullYear()} ${process.env.FROM_NAME || 'BundleBooth'}. All rights reserved.</p>
            </td>
          </tr>
        </table>
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
  console.log(`Brevo API Key: ${process.env.BREVO_API_KEY ? 'Configured' : 'Missing'}`);
});
