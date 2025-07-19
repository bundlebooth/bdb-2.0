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

app.post('/send-booking-email', async (req, res) => {
  try {
    const { 
      contactName, 
      email, 
      phoneNumber,
      eventName, 
      eventType,
      eventDate, 
      timeSlotDisplay,
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

    // Format date and time
    const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : 'Not specified';

    // Use the exact time slot display from frontend (already formatted)
    const formattedTimeSlot = timeSlotDisplay || 'Not specified';

    // Calculate prices
    const subtotal = services.reduce((sum, service) => sum + (service.selectedPrice || service.price || 0), 0);
    const discountPercentage = selectedBundle.isCustom ? 0 : (selectedBundle.discountPercentage ? selectedBundle.discountPercentage/100 : 0);
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
                  <h3 style="margin-top: 0;">Event Details:</h3>
                  <div style="margin: 20px 0;">
                    <div style="display: flex; margin-bottom: 10px;">
                      <div style="font-weight: bold; width: 150px;">Date:</div>
                      <div>${formattedDate}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 10px;">
                      <div style="font-weight: bold; width: 150px;">Time:</div>
                      <div>${formattedTimeSlot}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 10px;">
                      <div style="font-weight: bold; width: 150px;">Duration:</div>
                      <div>${durationHours} hours</div>
                    </div>
                    <div style="display: flex; margin-bottom: 10px;">
                      <div style="font-weight: bold; width: 150px;">Location:</div>
                      <div>${eventLocation || 'Not specified'}</div>
                    </div>
                  </div>

                  <!-- Pricing section -->
                  <h3>Pricing Summary:</h3>
                  <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 20px 0;">
                    ${services.map(service => `
                    <tr style="border-bottom: 1px solid #eee;">
                      <td style="padding: 8px 0;">${service.name}</td>
                      <td style="padding: 8px 0; text-align: right;">C$${(service.selectedPrice || service.price || 0).toFixed(2)}</td>
                    </tr>
                    `).join('')}
                    
                    <!-- Subtotal -->
                    <tr>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold;">Subtotal:</td>
                      <td style="padding: 8px 0; text-align: right;">C$${subtotal.toFixed(2)}</td>
                    </tr>
                    
                    <!-- Show either bundle discount or promo discount -->
                    ${discount > 0 ? `
                    <tr>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #27ae60;">
                        ${selectedBundle.discountPercentage ? `Bundle Discount (${selectedBundle.discountPercentage}%)` : 'Bundle Discount'}:
                      </td>
                      <td style="padding: 8px 0; text-align: right; color: #27ae60;">-C$${discount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    
                    ${promoDiscount > 0 ? `
                    <tr>
                      <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #27ae60;">
                        Promo Discount (${promoCodeApplied?.promoCode || ''}):
                      </td>
                      <td style="padding: 8px 0; text-align: right; color: #27ae60;">-C$${promoDiscount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    
                    <!-- Total -->
                    <tr style="font-weight: bold; border-top: 2px solid #333;">
                      <td style="padding: 8px 0; text-align: right;">Total:</td>
                      <td style="padding: 8px 0; text-align: right;">C$${total.toFixed(2)}</td>
                    </tr>
                  </table>
                  
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
