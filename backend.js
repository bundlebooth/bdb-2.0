require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fetch = require('node-fetch'); // Add this
const app = express();

app.use(cors());
app.use(bodyParser.json());

app.post('/send-booking-email', async (req, res) => {
    try {
        const bookingData = req.body;
        
        const servicesList = bookingData.services.map(service => 
            `${service.name} (${service.ServiceType}): C$${service.price.toFixed(2)}`
        ).join('<br>');

        const emailData = {
            sender: {
                email: process.env.FROM_EMAIL || 'hello@bundlebooth.ca',
                name: process.env.FROM_NAME || 'BundleBooth'
            },
            to: [{
                email: bookingData.email,
                name: bookingData.contactName
            }],
            subject: `Your BundleBooth Booking Confirmation - ${bookingData.eventName}`,
            htmlContent: `
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
            `
        };

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        const data = await response.json();
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
