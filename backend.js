require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const brevo = require('@getbrevo/brevo');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configure Brevo
const defaultClient = brevo.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY || 'your-api-key-here';

// Health check endpoint
app.get('/', (req, res) => {
  res.send('BundleBooth Backend is running');
});

// Email endpoint
app.post('/send-booking-email', async (req, res) => {
    try {
        const bookingData = req.body;
        
        if (!bookingData.email || !bookingData.contactName) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const servicesList = bookingData.services.map(service => 
            `${service.name} (${service.ServiceType}): C$${service.price.toFixed(2)}`
        ).join('<br>');

        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.sender = { 
            email: process.env.FROM_EMAIL || 'hello@bundlebooth.ca', 
            name: process.env.FROM_NAME || 'BundleBooth' 
        };
        sendSmtpEmail.to = [{ email: bookingData.email, name: bookingData.contactName }];
        sendSmtpEmail.subject = `Your BundleBooth Booking Confirmation - ${bookingData.eventName}`;
        sendSmtpEmail.htmlContent = `
            <h2>Thank you for your booking, ${bookingData.contactName}!</h2>
            <p>Your event <strong>${bookingData.eventName}</strong> is confirmed for ${bookingData.eventDate}.</p>
            
            <h3>Event Details</h3>
            <p><strong>Type:</strong> ${bookingData.eventType}</p>
            <p><strong>Date:</strong> ${bookingData.eventDate}</p>
            <p><strong>Duration:</strong> ${bookingData.duration} hours</p>
            <p><strong>Location:</strong> ${bookingData.location}</p>
            <p><strong>Guest Count:</strong> ${bookingData.guestCount}</p>
            ${bookingData.notes ? `<p><strong>Special Requests:</strong> ${bookingData.notes}</p>` : ''}
            
            <h3>Your Services</h3>
            ${servicesList}
            
            <h3>Pricing Summary</h3>
            <p>Subtotal: C$${bookingData.subtotal.toFixed(2)}</p>
            <p>Bundle Discount (10%): -C$${bookingData.discount.toFixed(2)}</p>
            <p><strong>Total: C$${bookingData.total.toFixed(2)}</strong></p>
            
            <p>We'll be in touch soon to confirm final details.</p>
            <p>Thank you for choosing BundleBooth!</p>
        `;

        const apiInstance = new brevo.TransactionalEmailsApi();
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
