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
      timeSlotDisplay,
      eventLocation, 
      specialRequests,
      services = [],
      bundleName,
      bundleDescription,
      selectedBundle = {},
      promoCodeApplied,
      paymentLast4,
      transactionId,
      paymentStatus,
      subtotal,
      discount,
      promoDiscount,
      total
    } = req.body;

    // Validation
    if (!email || !contactName || !eventName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Format display values
    const formattedDate = eventDate ? new Date(eventDate).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : 'Not specified';

    const formattedTimeSlot = timeSlotDisplay || 'Not specified';
    const formattedDuration = '3 hours'; // Fixed duration as per requirement
    const formattedLocation = eventLocation || 'Location not specified';
    const formattedPaymentMethod = paymentLast4 ? `Credit Card (ending in ${paymentLast4})` : 'Credit Card (ending in ****)';

    // Calculate actual subtotal from services
    const calculatedSubtotal = services.reduce((sum, service) => sum + (service.selectedPrice || service.price || 0), 0);

    // Get discount details from selectedBundle or promoCodeApplied
const bundleDiscountValue = selectedBundle?.isCustom ? 0 : 
                          (selectedBundle?.discountValue || discount || 0);
const bundleDiscountPercentage = selectedBundle?.isCustom ? 0 : 
                               (selectedBundle?.discountPercentage || 0);
    const promoCode = promoCodeApplied?.promoCode || '';

    const totalBeforePromo = subtotal - bundleDiscountValue;
const total = Math.max(0, totalBeforePromo - promoDiscount);
    

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
              
              <h3>Bundle Information:</h3>
              <div style="margin: 20px 0;">
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Bundle Name:</div>
                  <div>${bundleName || 'Custom Bundle'}</div>
                </div>
                ${bundleDescription ? `
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Description:</div>
                  <div>${bundleDescription}</div>
                </div>
                ` : ''}
              </div>
              
              <h3>Services Booked:</h3>
              <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 20px 0;">
                <tr style="border-bottom: 1px solid #eee;">
                  <th style="text-align: left; padding: 8px 0;">Service</th>
                  <th style="text-align: left; padding: 8px 0;">Category</th>
                  <th style="text-align: left; padding: 8px 0;">Options</th>
                  <th style="text-align: right; padding: 8px 0;">Price</th>
                </tr>
                ${services.map(service => `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 8px 0;">${service.name}</td>
                  <td style="padding: 8px 0;">${service.ServiceType}</td>
                  <td style="padding: 8px 0;">
                    ${service.selectedTier ? `
                      ${service.ServiceType === "Sweets and Brews" ? `Guests: ${service.selectedTier.value}` : ''}
                      ${service.ServiceType === "Scene Setters" && service.slug === "sparklers-box" ? `Quantity: ${service.selectedTier.value} sparklers` : ''}
                      ${service.ServiceType === "Interactive Booths" && service.slug === "photo-booth" ? `Option: ${service.selectedTier.label}` : ''}
                    ` : 'Standard'}
                  </td>
                  <td style="padding: 8px 0; text-align: right;">C$${(service.selectedPrice || service.price || 0).toFixed(2)}</td>
                </tr>
                `).join('')}
                
                <!-- Subtotal -->
                <tr>
                  <td colspan="3" style="padding: 8px 0; text-align: right; font-weight: bold;">Subtotal:</td>
                  <td style="padding: 8px 0; text-align: right;">C$${calculatedSubtotal.toFixed(2)}</td>
                </tr>
                
                <!-- Bundle Discount -->
${bundleDiscountValue > 0 ? `
<tr>
  <td colspan="3" style="padding: 8px 0; text-align: right; font-weight: bold; color: #27ae60;">
    ${bundleDiscountPercentage > 0 ? `Bundle Discount (${bundleDiscountPercentage}%)` : 'Bundle Discount'}:
  </td>
  <td style="padding: 8px 0; text-align: right; color: #27ae60;">-C$${bundleDiscountValue.toFixed(2)}</td>
</tr>
` : ''}

// Promo Discount
${promoDiscount > 0 ? `
<tr>
  <td colspan="3" style="padding: 8px 0; text-align: right; font-weight: bold; color: #27ae60;">
    Promo Discount (${promoCode || ''}):
  </td>
  <td style="padding: 8px 0; text-align: right; color: #27ae60;">-C$${promoDiscount.toFixed(2)}</td>
</tr>
` : ''}
                
                <!-- Total -->
                <tr style="font-weight: bold; border-top: 2px solid #333;">
                  <td colspan="3" style="padding: 8px 0; text-align: right;">Total:</td>
                  <td style="padding: 8px 0; text-align: right;">C$${total.toFixed(2)}</td>
                </tr>
              </table>
              
              <h3>Payment Information:</h3>
              <div style="margin: 20px 0;">
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Payment Method:</div>
                  <div>${formattedPaymentMethod}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Amount Paid:</div>
                  <div>C$${total.toFixed(2)}</div>
                </div>
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Payment Date:</div>
                  <div>${new Date().toLocaleDateString()}</div>
                </div>
                ${transactionId ? `
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Transaction ID:</div>
                  <div>${transactionId}</div>
                </div>
                ` : ''}
                ${paymentStatus ? `
                <div style="display: flex; margin-bottom: 10px;">
                  <div style="font-weight: bold; width: 150px;">Payment Status:</div>
                  <div>${paymentStatus}</div>
                </div>
                ` : ''}
              </div>
              
              <p>Thank you for choosing BundleBooth, ${contactName}!</p>
              <p>We'll be in touch soon to confirm the details of your event.</p>
              
              <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                <h4 style="margin-top: 0;">Important Notes:</h4>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Your booking is confirmed. A payment of C$${total.toFixed(2)} was processed.</li>
                  <li>Final details (guest count, etc.) must be confirmed 14 days before the event.</li>
                  <li>For any changes, please contact us at least 7 days before the event.</li>
                  <li>All times are in Eastern Time Zone (EST)</li>
                </ul>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px;">
              <p>Need to make changes? <a href="mailto:support@bundlebooth.ca" style="color: #4CAF50;">Contact us</a></p>
              <p>© ${new Date().getFullYear()} BundleBooth. All rights reserved.</p>
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
