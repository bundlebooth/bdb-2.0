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
    sendSmtpEmail.subject = `Booking Confirmation - ${eventName}`;
    sendSmtpEmail.htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Booking Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <!-- Email content remains the same as before -->
</body>
</html>
    `;

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
