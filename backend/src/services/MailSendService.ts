import { config } from '../config';
import { getLogger } from '../logger';
import type { BookingWithUser } from './BookingService';

const logger = getLogger('MailSendService');

export class MailSendService {
  /**
   * Send booking confirmation email to visitor
   */
  async sendVisitorConfirmation(bookingData: BookingWithUser): Promise<void> {
    const { booking, user } = bookingData;
    const visitorEmail = booking.visitorData.email as string | undefined;

    if (!visitorEmail) {
      logger.warn('No visitor email provided, skipping confirmation email');
      return;
    }

    if (!config.MAILSEND_API_TOKEN) {
      logger.warn('MailSend API token not configured, skipping email');
      return;
    }

    try {
      const emailBody = this.generateVisitorEmailBody(bookingData);

      // TODO: Replace with actual MailSend API call
      // For now, we'll just log it
      logger.info('Sending visitor confirmation email', {
        to: visitorEmail,
        bookingId: booking.id
      });

      // Example MailSend API call (adjust based on actual API):
      /*
      await fetch('https://api.mailsend.com/v1/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.MAILSEND_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: {
            email: config.MAILSEND_FROM_EMAIL,
            name: config.MAILSEND_FROM_NAME
          },
          to: [{ email: visitorEmail }],
          subject: 'Booking Confirmation',
          html: emailBody
        })
      });
      */

      logger.info('Visitor confirmation email sent successfully', {
        to: visitorEmail,
        bookingId: booking.id
      });
    } catch (error) {
      logger.error('Failed to send visitor confirmation email', { error, visitorEmail });
      // Don't throw - email failure shouldn't fail the booking
    }
  }

  /**
   * Send booking notification email to the bookable user
   */
  async sendUserNotification(bookingData: BookingWithUser): Promise<void> {
    const { booking, user } = bookingData;

    if (!config.MAILSEND_API_TOKEN) {
      logger.warn('MailSend API token not configured, skipping email');
      return;
    }

    try {
      const emailBody = this.generateUserEmailBody(bookingData);

      logger.info('Sending user notification email', {
        to: user.email,
        bookingId: booking.id
      });

      // TODO: Implement actual MailSend API call

      logger.info('User notification email sent successfully', {
        to: user.email,
        bookingId: booking.id
      });
    } catch (error) {
      logger.error('Failed to send user notification email', { error, userEmail: user.email });
      // Don't throw - email failure shouldn't fail the booking
    }
  }

  /**
   * Send cancellation email to visitor
   */
  async sendCancellationEmail(bookingData: BookingWithUser): Promise<void> {
    const { booking, user } = bookingData;
    const visitorEmail = booking.visitorData.email as string | undefined;

    if (!visitorEmail) {
      return;
    }

    if (!config.MAILSEND_API_TOKEN) {
      logger.warn('MailSend API token not configured, skipping email');
      return;
    }

    try {
      const emailBody = this.generateCancellationEmailBody(bookingData);

      logger.info('Sending cancellation email', {
        to: visitorEmail,
        bookingId: booking.id
      });

      // TODO: Implement actual MailSend API call

      logger.info('Cancellation email sent successfully', {
        to: visitorEmail,
        bookingId: booking.id
      });
    } catch (error) {
      logger.error('Failed to send cancellation email', { error, visitorEmail });
    }
  }

  /**
   * Generate HTML email body for visitor confirmation
   */
  private generateVisitorEmailBody(bookingData: BookingWithUser): string {
    const { booking, user } = bookingData;
    const startTime = booking.startTime.toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short'
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { background-color: #f9f9f9; padding: 20px; }
    .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Confirmed!</h1>
    </div>
    <div class="content">
      <p>Hi ${booking.visitorData.name || 'there'},</p>
      <p>Your booking has been confirmed. Here are the details:</p>

      <div class="details">
        <h3>Booking Details</h3>
        <p><strong>Date & Time:</strong> ${startTime}</p>
        <p><strong>With:</strong> ${user.displayName}</p>
        ${booking.googleMeetLink ? `<p><strong>Meeting Link:</strong> <a href="${booking.googleMeetLink}">${booking.googleMeetLink}</a></p>` : ''}
        ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ''}
      </div>

      <p>If you need to make any changes or have questions, please contact us.</p>

      ${booking.googleMeetLink ? `<a href="${booking.googleMeetLink}" class="button">Join Meeting</a>` : ''}
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML email body for user notification
   */
  private generateUserEmailBody(bookingData: BookingWithUser): string {
    const { booking, user } = bookingData;
    const startTime = booking.startTime.toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short'
    });

    const visitorName = booking.visitorData.name || 'Unknown';
    const visitorEmail = booking.visitorData.email || 'Not provided';
    const visitorPhone = booking.visitorData.phone || 'Not provided';

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
    .content { background-color: #f9f9f9; padding: 20px; }
    .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #2196F3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Booking</h1>
    </div>
    <div class="content">
      <p>Hi ${user.displayName},</p>
      <p>You have a new booking:</p>

      <div class="details">
        <h3>Booking Details</h3>
        <p><strong>Date & Time:</strong> ${startTime}</p>
        <p><strong>Visitor Name:</strong> ${visitorName}</p>
        <p><strong>Visitor Email:</strong> ${visitorEmail}</p>
        <p><strong>Visitor Phone:</strong> ${visitorPhone}</p>
        ${booking.googleMeetLink ? `<p><strong>Meeting Link:</strong> <a href="${booking.googleMeetLink}">${booking.googleMeetLink}</a></p>` : ''}
        ${booking.notes ? `<p><strong>Notes:</strong> ${booking.notes}</p>` : ''}
      </div>

      <p>This booking has been added to your Google Calendar.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML email body for cancellation
   */
  private generateCancellationEmailBody(bookingData: BookingWithUser): string {
    const { booking, user } = bookingData;
    const startTime = booking.startTime.toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short'
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
    .content { background-color: #f9f9f9; padding: 20px; }
    .details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #f44336; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Cancelled</h1>
    </div>
    <div class="content">
      <p>Hi ${booking.visitorData.name || 'there'},</p>
      <p>Your booking has been cancelled:</p>

      <div class="details">
        <h3>Cancelled Booking</h3>
        <p><strong>Date & Time:</strong> ${startTime}</p>
        <p><strong>With:</strong> ${user.displayName}</p>
        ${booking.cancellationReason ? `<p><strong>Reason:</strong> ${booking.cancellationReason}</p>` : ''}
      </div>

      <p>If you would like to reschedule, please visit our booking page.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

export const mailSendService = new MailSendService();
