import { Buffer } from 'node:buffer';
import { eq } from 'drizzle-orm';
import { google } from 'googleapis';
import { GaxiosError } from 'googleapis-common';
import { db } from '../db';
import { bookingConfigs } from '../db/schema';
import { getLogger } from '../logger';
import type { BookingWithUser } from './BookingService';
import { googleConnectionService } from './GoogleConnectionService';
import {
  buildIcsAttachment,
  buildIcsFileAttachment,
  buildCancellationHtml,
  buildUserNotificationHtml,
  buildVisitorConfirmationHtml,
  getBookingEmailTemplateData,
  htmlToText,
  renderBookingEmailTemplate
} from './bookingEmailTemplates';

const logger = getLogger('GoogleMailService');

export class GoogleMailService {
  async sendBookingCreatedNotifications(bookingData: BookingWithUser): Promise<void> {
    await Promise.all([
      this.sendVisitorConfirmation(bookingData),
      this.sendUserNotification(bookingData)
    ]);
  }

  async sendBookingCancellationNotifications(bookingData: BookingWithUser): Promise<void> {
    await this.sendCancellationEmail(bookingData);
  }

  async sendVisitorConfirmation(bookingData: BookingWithUser): Promise<void> {
    const { booking, user } = bookingData;
    const visitorEmail = booking.visitorData.email as string | undefined;

    if (!visitorEmail) {
      logger.warn('No visitor email provided, skipping visitor confirmation', {
        bookingId: booking.id
      });
      return;
    }

    const orgConfig = await this.getBookingConfig(booking.organizationId);
    if (!this.isEmailEnabled(orgConfig)) {
      logger.info('Booking emails disabled for organization, skipping visitor confirmation', {
        bookingId: booking.id,
        organizationId: booking.organizationId
      });
      return;
    }

    try {
      const templateData = getBookingEmailTemplateData(bookingData);
      const subject =
        orgConfig?.emailTemplateSubject?.trim() ||
        (templateData.language === 'de'
          ? `Termin bestätigt mit ${user.displayName}`
          : `Booking confirmed with ${user.displayName}`);
      const html = orgConfig?.emailTemplateBody?.trim()
        ? renderBookingEmailTemplate(orgConfig.emailTemplateBody, templateData)
        : buildVisitorConfirmationHtml(templateData);
      const calendarAttachment = buildIcsAttachment(bookingData);
      const calendarFileAttachment = buildIcsFileAttachment(bookingData);

      await this.sendEmail(
        booking.bookingUserId,
        [visitorEmail],
        subject,
        html,
        htmlToText(html),
        [calendarAttachment, calendarFileAttachment]
      );

      logger.info('Visitor confirmation email sent through Gmail', {
        bookingId: booking.id,
        to: visitorEmail
      });
    } catch (error) {
      logger.error('Failed to send visitor confirmation email through Gmail', {
        error,
        gmailError: this.getGmailErrorDetails(error),
        bookingId: booking.id,
        visitorEmail
      });
    }
  }

  async sendUserNotification(bookingData: BookingWithUser): Promise<void> {
    const { booking, user } = bookingData;
    const orgConfig = await this.getBookingConfig(booking.organizationId);

    if (!this.isEmailEnabled(orgConfig)) {
      logger.info('Booking emails disabled for organization, skipping user notification', {
        bookingId: booking.id,
        organizationId: booking.organizationId
      });
      return;
    }

    try {
      const templateData = getBookingEmailTemplateData(bookingData);
      const recipient = user.googleCalendarId || user.email;
      const subject =
        templateData.language === 'de'
          ? `Neue Buchung mit ${templateData.visitorName}`
          : `New booking with ${templateData.visitorName}`;
      const html = buildUserNotificationHtml(booking.googleEventId != null, templateData);

      await this.sendEmail(booking.bookingUserId, [recipient], subject, html, htmlToText(html));

      logger.info('User notification email sent through Gmail', {
        bookingId: booking.id,
        to: recipient
      });
    } catch (error) {
      logger.error('Failed to send user notification email through Gmail', {
        error,
        gmailError: this.getGmailErrorDetails(error),
        bookingId: booking.id,
        userEmail: user.email
      });
    }
  }

  async sendCancellationEmail(bookingData: BookingWithUser): Promise<void> {
    const { booking } = bookingData;
    const visitorEmail = booking.visitorData.email as string | undefined;

    if (!visitorEmail) {
      return;
    }

    const orgConfig = await this.getBookingConfig(booking.organizationId);
    if (!this.isEmailEnabled(orgConfig)) {
      logger.info('Booking emails disabled for organization, skipping cancellation email', {
        bookingId: booking.id,
        organizationId: booking.organizationId
      });
      return;
    }

    try {
      const templateData = getBookingEmailTemplateData(bookingData);
      const subject =
        templateData.language === 'de'
          ? `Termin abgesagt mit ${templateData.userName}`
          : `Booking cancelled with ${templateData.userName}`;
      const html = buildCancellationHtml(templateData);

      await this.sendEmail(booking.bookingUserId, [visitorEmail], subject, html, htmlToText(html));

      logger.info('Cancellation email sent through Gmail', {
        bookingId: booking.id,
        to: visitorEmail
      });
    } catch (error) {
      logger.error('Failed to send cancellation email through Gmail', {
        error,
        gmailError: this.getGmailErrorDetails(error),
        bookingId: booking.id,
        visitorEmail
      });
    }
  }

  private async sendEmail(
    bookingUserId: string,
    recipients: string[],
    subject: string,
    html: string,
    text: string,
    attachments: Array<{
      filename: string;
      contentType: string;
      content: string;
      disposition?: 'attachment' | 'inline';
      headers?: string[];
      isCalendarInvite?: boolean;
    }> = []
  ): Promise<void> {
    const { auth, user } = await googleConnectionService.getAuthorizedClient(bookingUserId);
    const gmail = google.gmail({ version: 'v1', auth });

    const senderEmail = user.googleCalendarId || user.email;
    const senderName = user.displayName || senderEmail;
    const rawMessage = this.buildRawMessage({
      fromName: senderName,
      fromEmail: senderEmail,
      to: recipients,
      subject,
      text,
      html,
      attachments
    });

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage
      }
    });
  }

  private buildRawMessage(input: {
    fromName: string;
    fromEmail: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    attachments: Array<{
      filename: string;
      contentType: string;
      content: string;
      disposition?: 'attachment' | 'inline';
      headers?: string[];
      isCalendarInvite?: boolean;
    }>;
  }): string {
    const alternativeBoundary = `aicoyo-alt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const mixedBoundary = `aicoyo-mixed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const calendarInvite = input.attachments.find(attachment => attachment.isCalendarInvite);
    const regularAttachments = input.attachments.filter(attachment => attachment !== calendarInvite);
    const message: string[] = [
      `From: ${this.formatAddress(input.fromName, input.fromEmail)}`,
      `To: ${input.to.map(email => this.formatAddress('', email)).join(', ')}`,
      `Subject: ${this.encodeHeader(input.subject)}`,
      'MIME-Version: 1.0'
    ];
    const alternativeParts = [
      `--${alternativeBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(input.text, 'utf8').toString('base64'),
      `--${alternativeBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(input.html, 'utf8').toString('base64'),
      ...(calendarInvite
        ? [
            `--${alternativeBoundary}`,
            `Content-Type: ${calendarInvite.contentType}`,
            'Content-Transfer-Encoding: base64',
            ...(calendarInvite.headers || []),
            '',
            Buffer.from(calendarInvite.content, 'utf8').toString('base64')
          ]
        : []),
      `--${alternativeBoundary}--`
    ];

    if (regularAttachments.length === 0) {
      message.push(
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        '',
        ...alternativeParts
      );
    } else {
      message.push(
        `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
        '',
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
        '',
        ...alternativeParts
      );

      for (const attachment of regularAttachments) {
        message.push(
          `--${mixedBoundary}`,
          `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
          'Content-Transfer-Encoding: base64',
          ...(attachment.headers || []),
          `Content-Disposition: ${attachment.disposition || 'attachment'}; filename="${attachment.filename}"`,
          '',
          Buffer.from(attachment.content, 'utf8').toString('base64')
        );
      }

      message.push(`--${mixedBoundary}--`);
    }

    return Buffer.from(message.join('\r\n'), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private encodeHeader(value: string): string {
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
  }

  private formatAddress(name: string, email: string): string {
    if (!name.trim()) {
      return `<${email}>`;
    }

    return `${this.encodeHeader(name)} <${email}>`;
  }

  private getGmailErrorDetails(error: unknown) {
    if (error instanceof GaxiosError) {
      return {
        message: error.message,
        code: error.code,
        status: error.status,
        responseData: error.response?.data ?? null
      };
    }

    return null;
  }

  private async getBookingConfig(organizationId: string) {
    return await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.organizationId, organizationId)
    });
  }

  private isEmailEnabled(configRecord: Awaited<ReturnType<GoogleMailService['getBookingConfig']>>) {
    return configRecord?.emailEnabled ?? true;
  }
}

export const googleMailService = new GoogleMailService();
