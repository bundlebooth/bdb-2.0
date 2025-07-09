app.post('/send-booking-email', async (req, res) => {
  try {
    const { email, contactName, eventName, eventDate, eventLocation, services = [] } = req.body;

    // Validation
    if (!email || !contactName || !eventName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Format services
    const servicesList = services.map(s => 
      `<tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${s.name || 'Service'}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">C$${(s.price || 0).toFixed(2)}</td>
      </tr>`
    ).join('') || '<tr><td colspan="2">No services selected</td></tr>';

    // Calculate total
    const total = services.reduce((sum, s) => sum + (s.price || 0), 0);

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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; background-color: white; border-left: 1px solid #eee; border-right: 1px solid #eee; }
        .footer { background-color: #f8f8f8; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; }
        .event-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .event-details { margin: 20px 0; }
        .detail-row { display: flex; margin-bottom: 10px; }
        .detail-label { font-weight: bold; width: 100px; }
        .services-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .total-row { font-weight: bold; border-top: 2px solid #333; }
        .button { 
          display: inline-block; padding: 10px 20px; background-color: #4CAF50; 
          color: white; text-decoration: none; border-radius: 4px; margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="event-title">${eventName}</div>
        <div>Your event has been scheduled</div>
      </div>
      
      <div class="content">
        <div class="event-details">
          <div class="detail-row">
            <div class="detail-label">Date:</div>
            <div>${eventDate || 'Not specified'}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Where:</div>
            <div>${eventLocation || 'Location not specified'}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Organizer:</div>
            <div>${process.env.FROM_NAME || 'BundleBooth'}</div>
          </div>
        </div>
        
        <h3>Services Booked:</h3>
        <table class="services-table">
          ${servicesList}
          <tr class="total-row">
            <td style="padding: 8px 0;">Total</td>
            <td style="padding: 8px 0; text-align: right;">C$${total.toFixed(2)}</td>
          </tr>
        </table>
        
        <p>Thank you for your booking, ${contactName}!</p>
        <p>We'll contact you shortly at ${email} if we need any additional information.</p>
        
        <a href="#" class="button">View Booking Details</a>
      </div>
      
      <div class="footer">
        <p>Need to make a change? <a href="#">Contact us</a> or <a href="#">Cancel</a></p>
        <p>© ${new Date().getFullYear()} ${process.env.FROM_NAME || 'BundleBooth'}. All rights reserved.</p>
      </div>
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
