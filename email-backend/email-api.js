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

// Email endpoint - SIMPLIFIED AND WORKING VERSION
app.post('/send-booking-email', async (req, res) => {
  try {
    // 1. EXTRACT ALL VALUES FROM STEP 3 FORM
    const {
      // Contact Info
      contactName,
      email,
      phoneNumber,
      
      // Event Details
      eventName,
      eventType,
      eventDate,
      timeSlot, // { startTime, endTime }
      durationHours, // From form or calculated
      eventLocation,
      specialRequests,
      
      // Services
      services = [],
      
      // Bundle Info
      bundleName,
      bundleDescription,
      selectedBundle = {},
      
      // Payment
      paymentLast4,
      transactionId,
      paymentStatus,
      promoCodeApplied
    } = req.body;

    // 2. VALIDATE REQUIRED FIELDS
    if (!email || !contactName || !eventName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 3. FORMAT VALUES WITH PROPER DEFAULTS
    // Date
    const formattedDate = eventDate 
      ? new Date(eventDate).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'Not specified';

    // Time Slot
    const formattedTimeSlot = (timeSlot?.startTime && timeSlot?.endTime)
      ? `${new Date(timeSlot.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(timeSlot.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) (EST)`
      : 'Not specified';

    // Duration
    let formattedDuration = 'Not specified';
    if (durationHours) {
      formattedDuration = `${durationHours} hour${durationHours !== 1 ? 's' : ''}`;
    } else if (timeSlot?.startTime && timeSlot?.endTime) {
      const hours = (new Date(timeSlot.endTime) - new Date(timeSlot.startTime)) / (1000 * 60 * 60);
      formattedDuration = `${hours.toFixed(1)} hours`;
    }

    // Location
    const formattedLocation = eventLocation?.trim() || 'Location not specified';

    // Payment Method
    const formattedPaymentMethod = paymentLast4 
      ? `Credit Card (ending in ${paymentLast4})` 
      : 'Credit Card (ending in ****)';

    // 4. CALCULATE PRICING
    const subtotal = services.reduce((sum, s) => sum + (s.selectedPrice || s.price || 0), 0);
    const discount = selectedBundle.discountPercentage 
      ? subtotal * (selectedBundle.discountPercentage / 100)
      : subtotal * 0.1; // Default 10%
    const promoDiscount = promoCodeApplied?.discountValue || 0;
    const total = subtotal - discount - promoDiscount;

    // 5. BUILD EMAIL TEMPLATE
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
              <!-- Header -->
              <tr>
                <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                  <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">${eventName}</div>
                  <div>Your event booking has been confirmed</div>
                </td>
              </tr>
              
              <!-- Event Details -->
              <tr>
                <td style="padding: 20px; background-color: white;">
                  <h3>Event Details:</h3>
                  <div style="margin: 10px 0;">
                    <div><strong>Date:</strong> ${formattedDate}</div>
                    <div><strong>Time:</strong> ${formattedTimeSlot}</div>
                    <div><strong>Duration:</strong> ${formattedDuration}</div>
                    <div><strong>Location:</strong> ${formattedLocation}</div>
                  </div>

                  <!-- Services -->
                  <h3>Services:</h3>
                  <ul>
                    ${services.map(s => `
                      <li>
                        ${s.name} - C$${(s.selectedPrice || s.price).toFixed(2)}
                        ${s.selectedTier ? `(${s.selectedTier.label})` : ''}
                      </li>
                    `).join('')}
                  </ul>

                  <!-- Payment -->
                  <h3>Payment Information:</h3>
                  <div style="margin: 10px 0;">
                    <div><strong>Method:</strong> ${formattedPaymentMethod}</div>
                    <div><strong>Amount:</strong> C$${total.toFixed(2)}</div>
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

    // 6. SEND EMAIL
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
      messageId: data.messageId
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
