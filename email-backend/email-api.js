// Updated generateICalendarContent function with proper timezone handling
function generateICalendarContent(eventDetails) {
  const { 
    contactName,
    email,
    eventName,
    eventDate,
    timeSlotDisplay,
    eventLocation,
    specialRequests
  } = eventDetails;

  // Parse the time slot (format: "HH:MM AM/PM - HH:MM AM/PM")
  const timeParts = timeSlotDisplay?.match(/(\d{1,2}:\d{2}\s[AP]M)/g) || [];
  const startTimeStr = timeParts[0] || '12:00 AM';
  const endTimeStr = timeParts[1] || '3:00 AM';

  // Parse the event date and combine with time (treat as EST/EDT)
  const startDateTime = new Date(`${eventDate}T${convertTo24Hour(startTimeStr)}:00-05:00`);
  const endDateTime = new Date(`${eventDate}T${convertTo24Hour(endTimeStr)}:00-05:00`);

  // If end time is earlier than start time (crossing midnight), add a day
  if (endDateTime <= startDateTime) {
    endDateTime.setDate(endDateTime.getDate() + 1);
  }

  // Format dates for iCalendar (UTC format)
  const formatDateForICS = (date) => {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
  };

  // Generate a unique identifier
  const uid = `${Date.now()}@bundlebooth.ca`;

  // Create the iCalendar content with timezone definition
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BundleBooth//Booking Confirmation//EN
BEGIN:VTIMEZONE
TZID:America/Toronto
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZNAME:EDT
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZNAME:EST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatDateForICS(new Date())}
DTSTART;TZID=America/Toronto:${formatDateForICS(startDateTime).replace('Z', '')}
DTEND;TZID=America/Toronto:${formatDateForICS(endDateTime).replace('Z', '')}
SUMMARY:${eventName}
DESCRIPTION:Booking confirmation for ${eventName}.\\n\\nContact: ${contactName} (${email})\\n\\n${specialRequests ? `Notes: ${specialRequests}\\n\\n` : ''}Booked through BundleBooth.
LOCATION:${eventLocation || 'Location not specified'}
STATUS:CONFIRMED
ORGANIZER;CN=BundleBooth:mailto:${process.env.FROM_EMAIL || 'hello@bundlebooth.ca'}
END:VEVENT
END:VCALENDAR`;
}

// Helper function to convert 12-hour time to 24-hour format
function convertTo24Hour(time12h) {
  const [time, period] = time12h.split(' ');
  let [hours, minutes] = time.split(':');
  
  if (period === 'PM' && hours !== '12') {
    hours = parseInt(hours, 10) + 12;
  }
  if (period === 'AM' && hours === '12') {
    hours = '00';
  }
  
  return `${hours}:${minutes}`;
}
