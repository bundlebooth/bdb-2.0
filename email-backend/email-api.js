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

// Helper function to format time
function formatTime(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    console.error('Error formatting time:', e);
    return '';
  }
}

// Helper function to calculate duration from time slot
function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return null;
  try {
    const start = new Date(startTime);
    const end = new Date(endTime);
    return (end - start) / (1000 * 60 * 60); // Convert to hours
  } catch (e) {
    console.error('Error calculating duration:', e);
    return null;
  }
}

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
    // Log incoming data for debugging
    console.log('Incoming booking data:', {
      timeSlot: req.body.timeSlot,
      durationHours: req.body.durationHours,
      eventLocation: req.body.eventLocation
    });

    const { 
      contactName, 
      email, 
      phoneNumber,
      eventName, 
      eventType,
      eventDate, 
      timeSlot = { startTime: null, endTime: null },
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

    // Validation
    if (!email || !contactName || !eventName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Format display values with proper fallbacks
    const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : 'Not specified';

    // Calculate duration - use provided durationHours or calculate from time slot
    const calculatedDuration = durationHours || calculateDuration(timeSlot.startTime, timeSlot.endTime);
    const formattedDuration = calculatedDuration 
      ? `${calculatedDuration} hour${calculatedDuration !== 1 ? 's' : ''}`
      : 'Not specified';

    const formattedTimeSlot = timeSlot.startTime && timeSlot.endTime 
      ? `${formatTime(timeSlot.startTime)} - ${formatTime(timeSlot.endTime)} (EST)`
      : 'Not specified';

    const formattedLocation = eventLocation?.trim() || 'Location not specified';
    const formattedPaymentMethod = paymentLast4 
      ? `Credit Card (ending in ${paymentLast4})` 
      : 'Credit Card (ending in ****)';

    // Calculate prices
    const subtotal = services.reduce((sum, service) => sum + (service.selectedPrice || service.price || 0), 0);
    const discountPercentage = selectedBundle.isCustom ? 0 : (selectedBundle.discountPercentage ? selectedBundle.discountPercentage/100 : 0.1);
    const discount = subtotal * discountPercentage;
    const promoDiscount = promoCodeApplied?.discountValue || 0;
    const total = Math.max(0, subtotal - discount - promoDiscount);

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
                  <div>${formattedDate}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Time Slot:</div>
                  <div>${formattedTimeSlot}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Duration:</div>
                  <div>${formattedDuration}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Location:</div>
                  <div>${formattedLocation}</div>
                </div>
              </div>

              ${specialRequests ? `
              <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                <h4 style="margin-top: 0;">Special Requests/Notes:</h4>
                <p>${specialRequests}</p>
              </div>
              ` : ''}
              
              <!-- ... rest of the email template remains the same ... -->
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
      timestamp: new Date(),
      debug: {
        receivedTimeSlot: timeSlot,
        calculatedDuration: calculatedDuration,
        receivedLocation: eventLocation
      }
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
