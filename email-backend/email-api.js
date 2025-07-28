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

// Helper function to format duration text (X hour or X hours)
function formatDuration(durationText) {
    if (!durationText) return '';
    
    // If it's already a number, format it directly
    if (typeof durationText === 'number') {
        return durationText === 1 ? '1 hour' : `${durationText} hours`;
    }
    
    // Extract number from duration text
    const hoursMatch = durationText.toString().match(/(\d+)\s*hours?/i) || 
                      durationText.toString().match(/(\d+)\s*h/i);
    
    if (hoursMatch) {
        const hours = parseInt(hoursMatch[1]);
        return hours === 1 ? '1 hour' : `${hours} hours`;
    }
    
    return durationText; // Return original if we can't parse
}

// Function to generate iCalendar content
function generateICalendarContent(eventDetails) {
  const { 
    contactName,
    email,
    eventName,
    eventDate,
    timeSlotDisplay,
    location,
    specialRequests
  } = eventDetails;

  // Parse the time slot (format: "HH:MM AM/PM - HH:MM AM/PM EST")
  const timeParts = timeSlotDisplay?.match(/(\d{1,2}:\d{2}\s[AP]M)/g) || [];
  const startTimeStr = timeParts[0];
  const endTimeStr = timeParts[1];

  if (!startTimeStr || !endTimeStr) {
    throw new Error('Invalid time slot format');
  }

  // Parse the date portion (YYYY-MM-DD)
  const dateParts = eventDate.split('-');
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]) - 1; // Months are 0-indexed
  const day = parseInt(dateParts[2]);

  // Parse start time
  const [startTime, startPeriod] = startTimeStr.split(' ');
  let [startHours, startMinutes] = startTime.split(':').map(Number);
  if (startPeriod === 'PM' && startHours < 12) startHours += 12;
  if (startPeriod === 'AM' && startHours === 12) startHours = 0;

  // Parse end time
  const [endTime, endPeriod] = endTimeStr.split(' ');
  let [endHours, endMinutes] = endTime.split(':').map(Number);
  if (endPeriod === 'PM' && endHours < 12) endHours += 12;
  if (endPeriod === 'AM' && endHours === 12) endHours = 0;

  // Format for iCalendar (no timezone conversion, just mark as EST)
  const formatTime = (hours, minutes) => {
    return `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}00`;
  };

  const dateStr = `${year}${(month + 1).toString().padStart(2, '0')}${day.toString().padStart(2, '0')}`;
  const startDateTime = `${dateStr}T${formatTime(startHours, startMinutes)}`;
  const endDateTime = `${dateStr}T${formatTime(endHours, endMinutes)}`;

  // Generate a unique identifier
  const uid = `${Date.now()}@bundlebooth.ca`;

  // Create the iCalendar content with simple EST timezone
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BundleBooth//Booking Confirmation//EN
BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:-0500
TZOFFSETTO:-0500
TZNAME:EST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dateStr}T000000Z
DTSTART;TZID=America/New_York:${startDateTime}
DTEND;TZID=America/New_York:${endDateTime}
SUMMARY:${eventName}
DESCRIPTION:Booking confirmation for ${eventName}.\\n\\nContact: ${contactName} (${email})\\n\\n${specialRequests ? `Notes: ${specialRequests}\\n\\n` : ''}Booked through BundleBooth.
LOCATION:${location || 'Location not specified'}
STATUS:CONFIRMED
ORGANIZER;CN=BundleBooth:mailto:${process.env.FROM_EMAIL || 'hello@bundlebooth.ca'}
END:VEVENT
END:VCALENDAR`;
}

// Email endpoint
app.post('/send-booking-email', async (req, res) => {
  try {
    const { 
      contactName, 
      email, 
      phone,
      eventName, 
      eventType,
      eventDate, 
      timeSlotDisplay,
      location, 
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
    const formattedDuration = '3 hours';
    const formattedLocation = location || 'Not specified';
    const formattedPaymentMethod = 'Credit Card';

    // Calculate actual subtotal from services
    const calculatedSubtotal = services.reduce((sum, service) => sum + (service.selectedPrice || service.price || 0), 0);

    // Get discount details
    const bundleDiscountValue = selectedBundle?.isCustom ? 0 : 
                             (selectedBundle?.discountValue || discount || 0);
    const bundleDiscountPercentage = selectedBundle?.isCustom ? 0 : 
                                   (selectedBundle?.discountPercentage || 0);
    const promoCode = promoCodeApplied?.promoCode || '';

    // Recalculate total
    const totalBeforePromo = calculatedSubtotal - bundleDiscountValue;
    const calculatedTotal = Math.max(0, totalBeforePromo - (promoDiscount || 0));

    // Create email
    const apiInstance = new Brevo.TransactionalEmailsApi();
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = {
      email: process.env.FROM_EMAIL || 'hello@bundlebooth.ca',
      name: process.env.FROM_NAME || 'BundleBooth'
    };
    sendSmtpEmail.to = [{ email, name: contactName }];
    sendSmtpEmail.bcc = [{ email: 'hello@bundlebooth.ca' }]; // BCC to company email
    sendSmtpEmail.subject = `Booking Confirmation - ${eventName}`;
    sendSmtpEmail.htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Booking Confirmation</title>
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
      }
      .shadow-card {
        border-radius: 16px !important;
        margin: 10px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 40px 0; font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; background-color: #F4F4F4;">
  <!--[if mso]>
  <style type="text/css">
    .shadow-card {
      box-shadow: none !important;
      border: 1px solid #e0e0e0 !important;
    }
  </style>
  <![endif]-->
  <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <!-- Modern Card with Grey Border and Shadow -->
        <table width="600" cellspacing="0" cellpadding="0" class="email-container" style="border-collapse: collapse;">
          <tr>
            <td>
              <div class="shadow-card" style="background-color: #ffffff; border-radius: 20px; box-shadow: 0 15px 40px rgba(0,0,0,0.12), 0 5px 15px rgba(0,0,0,0.08); border: 1px solid #e0e0e0; overflow: hidden;">
                <!-- Header with Logo -->
                <div style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 1px solid rgba(0,0,0,0.05);">
                  <img src="https://img1.wsimg.com/isteam/ip/e5031132-8c20-44e3-a810-901cf200c927/BundleBooth_Logo_FULL_FINAL%25202%2520large.png" alt="BundleBooth Logo" style="max-width: 280px; height: auto; margin-bottom: 15px;">
                  <div style="font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #222; letter-spacing: -0.5px;">${eventName}</div>
                  <div style="color: #666; font-size: 16px; letter-spacing: 0.2px;">Your event booking has been confirmed</div>
                </div>
                
                <!-- Content -->
                <div style="padding: 30px; background-color: white;">
                  <h3 style="margin-top: 0; font-size: 18px; color: #222; font-weight: 600;">Contact Information:</h3>
                  <div style="margin: 20px 0;">
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Your Name:</div>
                      <div>${contactName}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Email:</div>
                      <div>${email}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Phone Number:</div>
                      <div>${phone || 'Not specified'}</div>
                    </div>
                  </div>

                  <h3 style="font-size: 18px; color: #222; font-weight: 600;">Event Details:</h3>
                  <div style="margin: 20px 0;">
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Event Name:</div>
                      <div>${eventName}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Event Type:</div>
                      <div>${eventType || 'Not specified'}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Event Date:</div>
                      <div>${formattedDate}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Time Slot:</div>
                      <div>${formattedTimeSlot}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Duration:</div>
                      <div>${formattedDuration}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Location:</div>
                      <div>${formattedLocation}</div>
                    </div>
                  </div>

                  ${specialRequests ? `
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 25px 0; border: 1px solid rgba(0,0,0,0.05); box-shadow: inset 0 1px 3px rgba(0,0,0,0.03);">
                    <h4 style="margin-top: 0; font-size: 16px; color: #222; font-weight: 600;">Special Requests/Notes:</h4>
                    <p style="margin-bottom: 0; color: #555;">${specialRequests}</p>
                  </div>
                  ` : ''}
                  
                  <h3 style="font-size: 18px; color: #222; font-weight: 600;">Bundle Information:</h3>
                  <div style="margin: 20px 0;">
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Bundle Name:</div>
                      <div>${bundleName || 'Custom Bundle'}</div>
                    </div>
                    ${bundleDescription ? `
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Description:</div>
                      <div>${bundleDescription}</div>
                    </div>
                    ` : ''}
                  </div>
                  
                  <h3 style="font-size: 18px; color: #222; font-weight: 600;">Services Booked:</h3>
                  <div style="margin: 20px 0; background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
                    <ul style="margin: 0; padding-left: 20px; list-style-type: none;">
                      ${services.map(service => {
                        let serviceDetails = `<li style="margin-bottom: 12px; font-weight: 500; color: #444;">${service.name} (C$${(service.selectedPrice || service.price || 0).toFixed(2)})</li>`;
                        
                        // Add service type
                        serviceDetails += `<li style="margin-left: 20px; margin-bottom: 8px; color: #666;">• Category: ${service.ServiceType}</li>`;
                        
                        // Add duration if available
                        if (service.duration) {
                          serviceDetails += `<li style="margin-left: 20px; margin-bottom: 8px; color: #666;">• Duration: ${formatDuration(service.duration)}</li>`;
                        }
                        
                        // Add selected options/tiers
                        if (service.selectedTier) {
                          if (service.ServiceType === "Sweets and Brews") {
                            serviceDetails += `<li style="margin-left: 20px; margin-bottom: 8px; color: #666;">• Guest Size: ${service.selectedTier.value}</li>`;
                          } else if (service.ServiceType === "Scene Setters" && service.slug === "sparklers-box") {
                            serviceDetails += `<li style="margin-left: 20px; margin-bottom: 8px; color: #666;">• Sparklers Quantity: ${service.selectedTier.value}</li>`;
                          } else if (service.ServiceType === "Interactive Booths" && service.slug === "photo-booth") {
                            serviceDetails += `<li style="margin-left: 20px; margin-bottom: 8px; color: #666;">• Option: ${service.selectedTier.label}</li>`;
                          }
                        }
                        
                        // Add any additional add-ons
                        if (service.selectedAddons?.length > 0) {
                          serviceDetails += `<li style="margin-left: 20px; margin-bottom: 8px; color: #666;">• Add-ons: ${service.selectedAddons.map(a => a.label).join(', ')}</li>`;
                        }
                        
                        return serviceDetails;
                      }).join('')}
                    </ul>
                  </div>

                  <!-- Pricing Summary -->
                  <h3 style="font-size: 18px; color: #222; font-weight: 600;">Pricing Summary:</h3>
                  <div style="margin: 20px 0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                      <span>Subtotal:</span>
                      <span>C$${calculatedSubtotal.toFixed(2)}</span>
                    </div>
                    
                    ${bundleDiscountValue > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #27ae60;">
                      <span>${bundleDiscountPercentage > 0 ? `Bundle Discount (${bundleDiscountPercentage}%)` : 'Bundle Discount'}:</span>
                      <span>-C$${bundleDiscountValue.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    
                    ${promoDiscount > 0 ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #27ae60;">
                      <span>Promo Discount (${promoCode || ''}):</span>
                      <span>-C$${promoDiscount.toFixed(2)}</span>
                    </div>
                    ` : ''}
                    
                    <div style="display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee; font-weight: bold;">
                      <span>Total:</span>
                      <span>C$${calculatedTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  
                  <h3 style="font-size: 18px; color: #222; font-weight: 600;">Payment Information:</h3>
                  <div style="margin: 20px 0;">
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Payment Method:</div>
                      <div>${formattedPaymentMethod}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Amount Paid:</div>
                      <div>C$${calculatedTotal.toFixed(2)}</div>
                    </div>
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Payment Date:</div>
                      <div>${new Date().toLocaleDateString()}</div>
                    </div>
                    ${transactionId ? `
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Transaction ID:</div>
                      <div>${transactionId}</div>
                    </div>
                    ` : ''}
                    ${paymentStatus ? `
                    <div style="display: flex; margin-bottom: 12px;">
                      <div style="font-weight: bold; width: 150px;">Payment Status:</div>
                      <div>${paymentStatus}</div>
                    </div>
                    ` : ''}
                  </div>
                  
                  <p style="margin-bottom: 15px; color: #555;">Thank you for choosing BundleBooth, ${contactName}!</p>
                  <p style="margin-bottom: 20px; color: #555;">We'll be in touch soon to confirm the details of your event.</p>
                  
                  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 25px 0; border: 1px solid rgba(0,0,0,0.05); box-shadow: inset 0 1px 3px rgba(0,0,0,0.03);">
                    <h4 style="margin-top: 0; font-size: 16px; color: #222; font-weight: 600;">Important Notes:</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #555;">
                      <li style="margin-bottom: 8px;">Your booking is confirmed. A payment of C$${calculatedTotal.toFixed(2)} was processed.</li>
                      <li style="margin-bottom: 8px;">Final details (guest count, etc.) must be confirmed 14 days before the event.</li>
                      <li style="margin-bottom: 8px;">For any changes, please contact us at least 7 days before the event.</li>
                      <li>All times are in Eastern Time Zone (EST)</li>
                    </ul>
                  </div>

                  <div style="margin-top: 20px; padding: 18px; background-color: #f0f8ff; border-radius: 10px; border: 1px solid rgba(0,0,0,0.05); box-shadow: inset 0 1px 3px rgba(0,0,0,0.03);">
                    <p style="margin: 0; font-size: 15px; color: #2c5282;"><strong>Don't forget to add this event to your calendar!</strong> We've attached an .ics file to this email that you can import into Google Calendar, Outlook, or other calendar applications.</p>
                  </div>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #ffffff; padding: 25px; text-align: center; border-top: 1px solid rgba(0,0,0,0.05); font-size: 14px; color: #666;">
                  <p style="margin: 0 0 10px 0;">Need to make changes? <a href="mailto:support@bundlebooth.ca" style="color: #4CAF50; text-decoration: none; font-weight: bold;">Contact us</a></p>
                  <p style="margin: 0;">© ${new Date().getFullYear()} Bundle Booth Entertainment. All rights reserved.</p>
                </div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Generate iCalendar content
    const icsContent = generateICalendarContent({
      contactName,
      email,
      eventName,
      eventDate,
      timeSlotDisplay,
      location,
      specialRequests
    });

    // Add attachment
    sendSmtpEmail.attachment = [{
      name: 'BundleBooth_Event.ics',
      content: Buffer.from(icsContent).toString('base64')
    }];

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
