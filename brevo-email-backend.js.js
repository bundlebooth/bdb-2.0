const express = require('express');
const bodyParser = require('body-parser');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const app = express();

app.use(bodyParser.json());

// Configure Brevo
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = 'xkeysib-YOUR_API_KEY_HERE';

app.post('/send-booking-email', async (req, res) => {
    try {
        const bookingData = req.body;
        
        // Format services list for email
        const servicesList = bookingData.services.map(service => 
            `${service.name} (${service.ServiceType}): C$${service.price.toFixed(2)}`
        ).join('<br>');

        // Create email content
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.sender = { email: 'hello@bundlebooth.ca', name: 'BundleBooth' };
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
            
            <p>We'll be in touch soon to confirm final details. If you have any questions, please reply to this email.</p>
            <p>Thank you for choosing BundleBooth!</p>
        `;

        // Send email
        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
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