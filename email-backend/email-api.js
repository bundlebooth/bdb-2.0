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

// Helper functions
const formatTime = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    console.error('Error formatting time:', e);
    return '';
  }
};

const calculateDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return null;
  try {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return (end - start) / (1000 * 60 * 60); // Hours
  } catch (e) {
    console.error('Error calculating duration:', e);
    return null;
  }
};

// Email endpoint
app.post('/send-booking-email', async (req, res) => {
  try {
    // Extract all data from Step 3 form
    const {
      contactName,
      email,
      phoneNumber,
      eventName,
      eventType,
      eventDate,
      timeSlot = {},
      durationHours,
      eventLocation,
      specialRequests,
      services = [],
      bundleName,
      bundleDescription,
      selectedBundle = {},
      promoCodeApplied,
      paymentLast4,
      transactionId,
      paymentStatus
    } = req.body;

    // Validate required fields
    if (!email || !contactName || !eventName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Format all values with proper fallbacks
    const formattedDate = eventDate 
      ? new Date(eventDate).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'Not specified';

    const formattedTimeSlot = (timeSlot.startTime && timeSlot.endTime)
      ? `${formatTime(timeSlot.startTime)} - ${formatTime(timeSlot.endTime)} (EST)`
      : 'Not specified';

    const duration = durationHours || calculateDuration(timeSlot.startTime, timeSlot.endTime);
    const formattedDuration = duration 
      ? `${duration} hour${duration !== 1 ? 's' : ''}`
      : 'Not specified';

    const formattedLocation = eventLocation?.trim() || 'Location not specified';
    const formattedPaymentMethod = paymentLast4 
      ? `Credit Card (ending in ${paymentLast4})` 
      : 'Credit Card (ending in ****)';

    // Calculate pricing
    const subtotal = services.reduce((sum, service) => sum + (service.selectedPrice || service.price || 0), 0);
    const discountPercentage = selectedBundle.discountPercentage ? selectedBundle.discountPercentage / 100 : 0.1;
    const discount = subtotal * discountPercentage;
    const promoDiscount = promoCodeApplied?.discountValue || 0;
    const total = Math.max(0, subtotal - discount - promoDiscount);

    // Build email HTML
    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Booking Confirmation</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <table width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <table width="600" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
              <tr>
                <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                  <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">${eventName}</div>
                  <div>Your booking confirmation</div>
                </td>
              </tr>
              
              <tr>
                <td style="padding: 20px; background-color: white;">
                  <h3 style="margin-top: 0;">Event Details</h3>
                  <div style="margin-bottom: 20px;">
                    <div><strong>Date:</strong> ${formattedDate}</div>
                    <div><strong>Time:</strong> ${formattedTimeSlot}</div>
                    <div><strong>Duration:</strong> ${formattedDuration}</div>
                    <div><strong>Location:</strong> ${formattedLocation}</div>
                  </div>

                  <h3>Services</h3>
                  <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 20px;">
                    ${services.map(service => `
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${service.name}</td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">
                          C$${(service.selectedPrice || service.price || 0).toFixed(2)}
                        </td>
                      </tr>
                    `).join('')}
                  </table>

                  <h3>Payment Information</h3>
                  <div style="margin-bottom: 20px;">
                    <div><strong>Method:</strong> ${formattedPaymentMethod}</div>
                    <div><strong>Total:</strong> C$${total.toFixed(2)}</div>
                  </div>
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
    const apiInstance = new Brevo.TransactionalEmailsApi();
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.sender = {
      email: process.env.FROM_EMAIL || 'hello@bundlebooth.ca',
      name: process.env.FROM_NAME || 'BundleBooth'
    };
    sendSmtpEmail.to = [{ email, name: contactName }];
    sendSmtpEmail.subject = `Booking Confirmation - ${eventName}`;
    sendSmtpEmail.htmlContent = emailHtml;

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
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
