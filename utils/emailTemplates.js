function bookingUrl(bookingId) {
  return `${process.env.FRONTEND_URL || ""}/bookings/${bookingId}`;
}

function renderBookingEmailHtml({ title, intro, booking, viewUrl }) {
  const priceLabel = Number(booking.price) === 0 ? "Free" : `$${Number(booking.price).toFixed(2)}`;
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#1a1a2e;">${title}</h2>
      <p>${intro}</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:4px 0; color:#666;">When</td><td style="padding:4px 0;">${new Date(booking.start_at).toUTCString()}</td></tr>
        <tr><td style="padding:4px 0; color:#666;">Price</td><td style="padding:4px 0;">${priceLabel}</td></tr>
      </table>
      <p><a href="${viewUrl}" style="color:#4f46e5;">View booking on OfficeHours</a></p>
    </div>
  `;
}

// booking.status is "confirmed" for free sessions (auto-confirmed) or
// "pending" for priced ones awaiting Stripe checkout — see booking.controller.js#create.
function studentBookingCreatedEmail({ booking, professorName }) {
  const isConfirmed = booking.status === "confirmed";
  return {
    subject: isConfirmed ? "Your OfficeHours session is confirmed" : "Booking received — complete payment to confirm",
    html: renderBookingEmailHtml({
      title: isConfirmed ? "Session confirmed" : "Booking received",
      intro: isConfirmed
        ? `Your session with ${professorName} is confirmed.`
        : `Your session with ${professorName} is booked, pending payment.`,
      booking,
      viewUrl: bookingUrl(booking.id),
    }),
  };
}

function professorNewBookingEmail({ booking, studentEmail }) {
  return {
    subject: "New OfficeHours booking",
    html: renderBookingEmailHtml({
      title: "New booking",
      intro: `${studentEmail} just booked a session with you.`,
      booking,
      viewUrl: bookingUrl(booking.id),
    }),
  };
}

function studentPaymentSuccessEmail({ booking, professorName }) {
  return {
    subject: "Payment received — session confirmed",
    html: renderBookingEmailHtml({
      title: "Payment received",
      intro: `Your payment was successful and your session with ${professorName} is confirmed.`,
      booking,
      viewUrl: bookingUrl(booking.id),
    }),
  };
}

function professorBookingConfirmedEmail({ booking, studentName }) {
  return {
    subject: "Booking confirmed — payment received",
    html: renderBookingEmailHtml({
      title: "Booking confirmed",
      intro: `${studentName} has paid — your session is confirmed.`,
      booking,
      viewUrl: bookingUrl(booking.id),
    }),
  };
}

function bookingReminderEmail({ booking, counterpartName }) {
  return {
    subject: "Reminder: your OfficeHours session starts soon",
    html: renderBookingEmailHtml({
      title: "Upcoming session reminder",
      intro: `Your session with ${counterpartName} starts soon.`,
      booking,
      viewUrl: bookingUrl(booking.id),
    }),
  };
}

function supportTicketReplyEmail({ ticket }) {
  return {
    subject: `Re: ${ticket.subject}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1a1a2e;">Reply to your support request</h2>
        <p style="color:#666;">Your message: "${ticket.subject}"</p>
        <div style="background:#f5f5f7; padding:12px; border-radius:6px; margin:16px 0; white-space:pre-wrap;">${ticket.admin_reply}</div>
        <p style="color:#999; font-size:12px;">Reply to this email if you have more questions.</p>
      </div>
    `,
  };
}

module.exports = {
  studentBookingCreatedEmail,
  professorNewBookingEmail,
  studentPaymentSuccessEmail,
  professorBookingConfirmedEmail,
  bookingReminderEmail,
  supportTicketReplyEmail,
};
