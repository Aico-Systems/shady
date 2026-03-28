import type { BookingWithUser } from './BookingService';

export interface BookingEmailTemplateData {
  bookingId: string;
  language: BookingEmailLanguage;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  userName: string;
  userEmail: string;
  startTime: string;
  endTime: string;
  timezone: string;
  notes: string;
  status: string;
  googleMeetLink: string;
  cancellationReason: string;
  startTimeIso: string;
  endTimeIso: string;
  googleCalendarUrl: string;
}

type BookingEmailLanguage = 'en' | 'de';

export function getBookingEmailTemplateData(bookingData: BookingWithUser): BookingEmailTemplateData {
  const { booking, user } = bookingData;
  const timezone = user.timezone || 'UTC';
  const language = resolveEmailLanguage(booking.visitorData.locale);

  return {
    bookingId: booking.id,
    language,
    visitorName: String(booking.visitorData.name || (language === 'de' ? 'da' : 'there')),
    visitorEmail: String(booking.visitorData.email || (language === 'de' ? 'Nicht angegeben' : 'Not provided')),
    visitorPhone: String(booking.visitorData.phone || (language === 'de' ? 'Nicht angegeben' : 'Not provided')),
    userName: String(user.displayName || user.email),
    userEmail: String(user.email),
    startTime: formatDateTime(booking.startTime, timezone, language),
    endTime: formatDateTime(booking.endTime, timezone, language),
    timezone,
    notes: String(booking.notes || ''),
    status: String(booking.status || ''),
    googleMeetLink: String(booking.googleMeetLink || ''),
    cancellationReason: String(booking.cancellationReason || ''),
    startTimeIso: booking.startTime.toISOString(),
    endTimeIso: booking.endTime.toISOString(),
    googleCalendarUrl: buildGoogleCalendarUrl(bookingData, language)
  };
}

export function renderBookingEmailTemplate(
  template: string,
  data: BookingEmailTemplateData
): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: keyof BookingEmailTemplateData) => {
    const value = data[key];
    return escapeHtml(value ?? '');
  });
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const EMAIL_COPY: Record<BookingEmailLanguage, {
  eyebrow: string;
  bookingConfirmedTitle: string;
  bookingConfirmedSubtitle: string;
  appointmentDetails: string;
  greeting: string;
  dateTime: string;
  with: string;
  meetingLink: string;
  notes: string;
  visitorConfirmationOutro: string;
  calendarFallback: string;
  joinMeeting: string;
  footer: string;
  newBookingTitle: string;
  newBookingSubtitle: string;
  bookingDetails: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  bookingAddedToCalendar: string;
  bookingNotAddedToCalendar: string;
  bookingCancelledTitle: string;
  bookingCancelledSubtitle: string;
  cancelledAppointment: string;
  reason: string;
  cancellationOutro: string;
  reviewBooking: string;
  googleCalendarTitle: string;
  googleCalendarDetailsWith: string;
  googleCalendarDetailsVisitor: string;
  googleCalendarDetailsEmail: string;
  googleCalendarDetailsPhone: string;
  googleCalendarDetailsNotes: string;
  googleCalendarDetailsJoin: string;
  icsTitle: string;
}> = {
  en: {
    eyebrow: 'AICOYO BOOKING',
    bookingConfirmedTitle: 'Booking confirmed',
    bookingConfirmedSubtitle: 'Your appointment is locked in. Here are the details for your scheduled call.',
    appointmentDetails: 'Appointment details',
    greeting: 'Hi',
    dateTime: 'Date & time',
    with: 'With',
    meetingLink: 'Meeting link',
    notes: 'Notes',
    visitorConfirmationOutro: 'If you need to make any changes or have questions, reply to this email.',
    calendarFallback: 'Using Outlook or Apple Calendar? Import the attached calendar invite.',
    joinMeeting: 'Join meeting',
    footer: 'Sent by AICOYO · Booking coordination by AICOYO',
    newBookingTitle: 'New booking',
    newBookingSubtitle: 'A new appointment was scheduled through your booking page.',
    bookingDetails: 'Booking details',
    visitorName: 'Visitor name',
    visitorEmail: 'Visitor email',
    visitorPhone: 'Visitor phone',
    bookingAddedToCalendar: 'This booking has also been added to your Google Calendar.',
    bookingNotAddedToCalendar: 'The booking was saved, but no Google Calendar event was attached.',
    bookingCancelledTitle: 'Booking cancelled',
    bookingCancelledSubtitle: 'This appointment is no longer scheduled.',
    cancelledAppointment: 'Cancelled appointment',
    reason: 'Reason',
    cancellationOutro: 'If you would like to reschedule, please use the booking page again.',
    reviewBooking: 'Review booking',
    googleCalendarTitle: 'Session with',
    googleCalendarDetailsWith: 'Meeting with',
    googleCalendarDetailsVisitor: 'Visitor',
    googleCalendarDetailsEmail: 'Email',
    googleCalendarDetailsPhone: 'Phone',
    googleCalendarDetailsNotes: 'Notes',
    googleCalendarDetailsJoin: 'Join',
    icsTitle: 'AICOYO session with'
  },
  de: {
    eyebrow: 'AICOYO TERMIN',
    bookingConfirmedTitle: 'Termin bestätigt',
    bookingConfirmedSubtitle: 'Dein Termin steht. Hier sind die Details für dein geplantes Gespräch.',
    appointmentDetails: 'Termindetails',
    greeting: 'Hallo',
    dateTime: 'Datum & Uhrzeit',
    with: 'Mit',
    meetingLink: 'Meeting-Link',
    notes: 'Hinweise',
    visitorConfirmationOutro: 'Wenn du etwas ändern möchtest oder Fragen hast, antworte einfach auf diese E-Mail.',
    calendarFallback: 'Du nutzt Outlook oder Apple Kalender? Importiere die angehängte Kalendereinladung.',
    joinMeeting: 'Meeting öffnen',
    footer: 'Gesendet von AICOYO · Terminabstimmung via AICOYO',
    newBookingTitle: 'Neue Buchung',
    newBookingSubtitle: 'Über deine Buchungsseite wurde ein neuer Termin vereinbart.',
    bookingDetails: 'Buchungsdetails',
    visitorName: 'Name des Besuchers',
    visitorEmail: 'E-Mail des Besuchers',
    visitorPhone: 'Telefon des Besuchers',
    bookingAddedToCalendar: 'Dieser Termin wurde auch zu deinem Google Kalender hinzugefügt.',
    bookingNotAddedToCalendar: 'Der Termin wurde gespeichert, aber es wurde kein Google-Kalendereintrag verknüpft.',
    bookingCancelledTitle: 'Termin abgesagt',
    bookingCancelledSubtitle: 'Dieser Termin ist nicht mehr eingeplant.',
    cancelledAppointment: 'Abgesagter Termin',
    reason: 'Grund',
    cancellationOutro: 'Wenn du einen neuen Termin vereinbaren möchtest, nutze bitte erneut die Buchungsseite.',
    reviewBooking: 'Buchung ansehen',
    googleCalendarTitle: 'Termin mit',
    googleCalendarDetailsWith: 'Termin mit',
    googleCalendarDetailsVisitor: 'Besucher',
    googleCalendarDetailsEmail: 'E-Mail',
    googleCalendarDetailsPhone: 'Telefon',
    googleCalendarDetailsNotes: 'Hinweise',
    googleCalendarDetailsJoin: 'Beitreten',
    icsTitle: 'AICOYO Termin mit'
  }
};

function getEmailCopy(language: BookingEmailLanguage) {
  return EMAIL_COPY[language];
}

export function buildVisitorConfirmationHtml(templateData: BookingEmailTemplateData): string {
  const copy = getEmailCopy(templateData.language);

  return buildEmailShell({
    eyebrow: copy.eyebrow,
    title: copy.bookingConfirmedTitle,
    subtitle: copy.bookingConfirmedSubtitle,
    intro: `${copy.greeting} ${escapeHtml(templateData.visitorName)},`,
    detailsTitle: copy.appointmentDetails,
    detailsRows: [
      row(copy.dateTime, templateData.startTime),
      row(copy.with, templateData.userName),
      ...(templateData.googleMeetLink ? [row(copy.meetingLink, `<a href="${escapeHtml(templateData.googleMeetLink)}" style="${linkStyle()}">${escapeHtml(templateData.googleMeetLink)}</a>`)] : []),
      ...(templateData.notes ? [row(copy.notes, escapeHtml(templateData.notes))] : [])
    ],
    outro: `${copy.visitorConfirmationOutro} ${copy.calendarFallback}`,
    actions: [
      ...(templateData.googleMeetLink
        ? [{ label: copy.joinMeeting, href: templateData.googleMeetLink, variant: 'primary' as const }]
        : [])
    ],
    footer: copy.footer,
    structuredData: [buildVisitorStructuredData(templateData)]
  });
}

export function buildUserNotificationHtml(
  hasGoogleEvent: boolean,
  templateData: BookingEmailTemplateData
): string {
  const copy = getEmailCopy(templateData.language);

  return buildEmailShell({
    eyebrow: copy.eyebrow,
    title: copy.newBookingTitle,
    subtitle: copy.newBookingSubtitle,
    intro: `${copy.greeting} ${escapeHtml(templateData.userName)},`,
    detailsTitle: copy.bookingDetails,
    detailsRows: [
      row(copy.dateTime, templateData.startTime),
      row(copy.visitorName, templateData.visitorName),
      row(copy.visitorEmail, templateData.visitorEmail),
      row(copy.visitorPhone, templateData.visitorPhone),
      ...(templateData.googleMeetLink ? [row(copy.meetingLink, `<a href="${escapeHtml(templateData.googleMeetLink)}" style="${linkStyle()}">${escapeHtml(templateData.googleMeetLink)}</a>`)] : []),
      ...(templateData.notes ? [row(copy.notes, escapeHtml(templateData.notes))] : [])
    ],
    outro: hasGoogleEvent
      ? copy.bookingAddedToCalendar
      : copy.bookingNotAddedToCalendar,
    actions: [],
    footer: copy.footer
  });
}

export function buildCancellationHtml(templateData: BookingEmailTemplateData): string {
  const copy = getEmailCopy(templateData.language);

  return buildEmailShell({
    eyebrow: copy.eyebrow,
    title: copy.bookingCancelledTitle,
    subtitle: copy.bookingCancelledSubtitle,
    intro: `${copy.greeting} ${escapeHtml(templateData.visitorName)},`,
    detailsTitle: copy.cancelledAppointment,
    detailsRows: [
      row(copy.dateTime, templateData.startTime),
      row(copy.with, templateData.userName),
      ...(templateData.cancellationReason ? [row(copy.reason, escapeHtml(templateData.cancellationReason))] : [])
    ],
    outro: copy.cancellationOutro,
    footer: copy.footer
  });
}

function buildEmailShell(input: {
  eyebrow: string;
  title: string;
  subtitle: string;
  intro: string;
  detailsTitle: string;
  detailsRows: Array<[string, string]>;
  outro: string;
  footer: string;
  actions?: Array<{
    label: string;
    href: string;
    variant: 'primary' | 'secondary';
  }>;
  structuredData?: unknown[];
}): string {
  return `
<!doctype html>
<html>
  <head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <meta name='color-scheme' content='light dark'>
    <meta name='supported-color-schemes' content='light dark'>
    <title>${escapeHtml(input.title)}</title>
    ${renderStructuredDataScripts(input.structuredData)}
    <style>
      :root {
        color-scheme: light dark;
      }

      body {
        margin: 0;
        padding: 0;
        background-color: #f6f8fb;
        color: #0f172a;
      }

      .mail-shell {
        width: 100%;
        background:
          radial-gradient(circle at top right, rgba(20, 91, 122, 0.14), transparent 36%),
          linear-gradient(180deg, #f6f8fb 0%, #eef2f7 100%);
      }

      .mail-card {
        max-width: 560px;
        background: rgba(255, 255, 255, 0.97);
        border-radius: 24px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }

      .mail-header {
        padding: 28px 28px 18px 28px;
        background:
          linear-gradient(135deg, rgba(11, 18, 38, 0.04), rgba(20, 91, 122, 0.12)),
          rgba(255, 255, 255, 0.9);
      }

      .eyebrow {
        margin: 0 0 12px 0;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #64748b;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .title {
        margin: 0 0 8px 0;
        font-size: 24px;
        line-height: 1.2;
        color: #0f172a;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .subtitle,
      .outro {
        margin: 0;
        font-size: 14px;
        line-height: 1.7;
        color: #475569;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .intro {
        margin: 0 0 20px 0;
        font-size: 14px;
        line-height: 1.8;
        color: #0f172a;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .details {
        margin: 20px 0;
        padding: 18px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(15, 23, 42, 0.08);
      }

      .details-title {
        margin: 0 0 10px 0;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #64748b;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .detail-row {
        padding: 10px 0;
        border-top: 1px solid rgba(15, 23, 42, 0.08);
      }

      .detail-label {
        margin: 0 0 4px 0;
        font-size: 12px;
        color: #64748b;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .detail-value {
        margin: 0;
        font-size: 14px;
        line-height: 1.7;
        color: #0f172a;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .action-row {
        padding-top: 8px;
        text-align: center;
      }

      .action-button {
        display: inline-block;
        min-width: 180px;
        margin: 8px 6px 0 6px;
        padding: 12px 22px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 600;
        text-decoration: none;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      .action-button-primary {
        background: linear-gradient(135deg, #0b1226, #145b7a);
        color: #ffffff;
      }

      .action-button-secondary {
        background: rgba(255, 255, 255, 0.92);
        color: #0f172a;
        border: 1px solid rgba(15, 23, 42, 0.12);
      }

      .mail-footer {
        padding: 16px 28px 24px 28px;
        border-top: 1px solid rgba(15, 23, 42, 0.08);
      }

      .footer-text {
        margin: 0;
        font-size: 11px;
        color: #64748b;
        font-family: Sora, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      @media (prefers-color-scheme: dark) {
        body {
          background-color: #0b1226 !important;
          color: #f8fafc !important;
        }

        .mail-shell {
          background:
            radial-gradient(circle at top right, rgba(94, 234, 212, 0.12), transparent 36%),
            linear-gradient(180deg, #0b1226 0%, #0f172a 100%) !important;
        }

        .mail-card {
          background: rgba(15, 23, 42, 0.96) !important;
          border-color: rgba(148, 163, 184, 0.16) !important;
          box-shadow: 0 18px 52px rgba(2, 6, 23, 0.32) !important;
        }

        .mail-header {
          background:
            linear-gradient(135deg, rgba(94, 234, 212, 0.08), rgba(11, 18, 38, 0.2)),
            rgba(15, 23, 42, 0.9) !important;
        }

        .title,
        .intro,
        .detail-value {
          color: #f8fafc !important;
        }

        .subtitle,
        .outro,
        .detail-label,
        .eyebrow,
        .details-title,
        .footer-text {
          color: #94a3b8 !important;
        }

        .details {
          background: rgba(11, 18, 38, 0.88) !important;
          border-color: rgba(148, 163, 184, 0.16) !important;
        }

        .detail-row,
        .mail-footer {
          border-color: rgba(148, 163, 184, 0.16) !important;
        }

        .action-button-primary {
          background: linear-gradient(135deg, #5eead4, #7cefd9) !important;
          color: #06261f !important;
        }

        .action-button-secondary {
          background: rgba(15, 23, 42, 0.92) !important;
          color: #f8fafc !important;
          border-color: rgba(148, 163, 184, 0.18) !important;
        }
      }
    </style>
  </head>
  <body>
    <table role='presentation' cellpadding='0' cellspacing='0' width='100%' class='mail-shell'>
      <tr>
        <td align='center' style='padding:32px 16px;'>
          <table role='presentation' cellpadding='0' cellspacing='0' width='100%' class='mail-card'>
            <tr>
              <td class='mail-header' style='text-align:left;'>
                <div class='eyebrow'>${escapeHtml(input.eyebrow)}</div>
                <h1 class='title'>${escapeHtml(input.title)}</h1>
                <p class='subtitle' style='margin:0 0 16px 0;'>${escapeHtml(input.subtitle)}</p>
                <p class='intro'>${input.intro}</p>
                <div class='details'>
                  <div class='details-title'>${escapeHtml(input.detailsTitle)}</div>
                  ${input.detailsRows.map(([label, value]) => `
                    <div class='detail-row'>
                      <div class='detail-label'>${escapeHtml(label)}</div>
                      <div class='detail-value'>${value}</div>
                    </div>
                  `).join('')}
                </div>
                <p class='outro' style='margin:0 0 12px 0;'>${escapeHtml(input.outro)}</p>
                ${input.actions?.length ? `
                  <div class='action-row'>
                    ${input.actions.map((action) => `
                      <a
                        href='${escapeHtml(action.href)}'
                        class='action-button action-button-${action.variant}'
                        style='${actionButtonStyle(action.variant)}'
                      >${escapeHtml(action.label)}</a>
                    `).join('')}
                  </div>
                ` : ''}
              </td>
            </tr>
            <tr>
              <td class='mail-footer' style='text-align:left;'>
                <p class='footer-text'>${escapeHtml(input.footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

function buildVisitorStructuredData(templateData: BookingEmailTemplateData): Record<string, unknown> {
  const copy = getEmailCopy(templateData.language);

  return {
    '@context': 'http://schema.org',
    '@type': 'EmailMessage',
    description:
      templateData.language === 'de'
        ? `Termin bestätigt für ${templateData.startTime} mit ${templateData.userName}.`
        : `Booking confirmed for ${templateData.startTime} with ${templateData.userName}.`,
    potentialAction: {
      '@type': 'ViewAction',
      name: copy.reviewBooking,
      url: templateData.googleCalendarUrl
    },
    publisher: {
      '@type': 'Organization',
      name: 'AICOYO',
      url: 'https://aicoyo.com'
    }
  };
}

function renderStructuredDataScripts(structuredData?: unknown[]): string {
  if (!structuredData?.length) {
    return '';
  }

  return structuredData
    .map((entry) => {
      const json = JSON.stringify(entry)
        .replaceAll('<', '\\u003c')
        .replaceAll('>', '\\u003e')
        .replaceAll('&', '\\u0026');
      return `<script type='application/ld+json'>${json}</script>`;
    })
    .join('\n    ');
}

function linkStyle(): string {
  return "color:#145B7A;text-decoration:none;font-family:Sora,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
}

function actionButtonStyle(variant: 'primary' | 'secondary'): string {
  const base = "display:inline-block;min-width:180px;margin:8px 6px 0 6px;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;font-family:Sora,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;";

  if (variant === 'primary') {
    return `${base}background:linear-gradient(135deg,#0B1226,#145B7A);color:#FFFFFF;border:1px solid #145B7A;-webkit-text-fill-color:#FFFFFF;`;
  }

  return `${base}background:rgba(255,255,255,0.92);color:#0F172A;border:1px solid rgba(15,23,42,0.12);-webkit-text-fill-color:#0F172A;`;
}

function row(label: string, value: string): [string, string] {
  return [label, value];
}

function formatDateTime(
  date: Date,
  timeZone: string,
  language: BookingEmailLanguage
): string {
  return new Intl.DateTimeFormat(toIntlLocale(language), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short'
  }).format(date);
}

export function buildGoogleCalendarUrl(
  bookingData: BookingWithUser,
  language: BookingEmailLanguage = resolveEmailLanguage(bookingData.booking.visitorData.locale)
): string {
  const { booking, user } = bookingData;
  const copy = getEmailCopy(language);
  const title = `${copy.googleCalendarTitle} ${user.displayName || user.email}`;
  const detailsLines = [
    `${copy.googleCalendarDetailsWith} ${user.displayName || user.email}`,
    `${copy.googleCalendarDetailsVisitor}: ${booking.visitorData.name || 'Guest'}`,
    booking.visitorData.email ? `${copy.googleCalendarDetailsEmail}: ${booking.visitorData.email}` : '',
    booking.visitorData.phone ? `${copy.googleCalendarDetailsPhone}: ${booking.visitorData.phone}` : '',
    booking.notes ? `${copy.googleCalendarDetailsNotes}: ${booking.notes}` : '',
    booking.googleMeetLink ? `${copy.googleCalendarDetailsJoin}: ${booking.googleMeetLink}` : ''
  ].filter(Boolean);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatCalendarDate(booking.startTime)}/${formatCalendarDate(booking.endTime)}`,
    details: detailsLines.join('\n'),
    location: booking.googleMeetLink || user.displayName || user.email
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcsAttachment(bookingData: BookingWithUser): {
  filename: string;
  contentType: string;
  content: string;
  disposition: 'inline';
  headers: string[];
  isCalendarInvite: true;
} {
  const { booking, user } = bookingData;
  const language = resolveEmailLanguage(booking.visitorData.locale);
  const copy = getEmailCopy(language);
  const eventTitle = escapeIcsText(`${copy.icsTitle} ${user.displayName || user.email}`);
  const description = escapeIcsText(
    [
      `${copy.googleCalendarDetailsVisitor}: ${booking.visitorData.name || 'Guest'}`,
      booking.visitorData.email ? `${copy.googleCalendarDetailsEmail}: ${booking.visitorData.email}` : '',
      booking.visitorData.phone ? `${copy.googleCalendarDetailsPhone}: ${booking.visitorData.phone}` : '',
      booking.notes ? `${copy.googleCalendarDetailsNotes}: ${booking.notes}` : '',
      booking.googleMeetLink ? `${copy.googleCalendarDetailsJoin}: ${booking.googleMeetLink}` : ''
    ].filter(Boolean).join('\n')
  );
  const location = escapeIcsText(booking.googleMeetLink || user.displayName || user.email);
  const organizerName = escapeIcsText(user.displayName || user.email);
  const attendeeName = escapeIcsText(String(booking.visitorData.name || 'Guest'));
  const attendeeEmail = String(booking.visitorData.email || '').trim();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AICOYO//Shady Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${booking.id}@aicoyo.com`,
    `DTSTAMP:${formatCalendarDate(new Date())}`,
    `DTSTART:${formatCalendarDate(booking.startTime)}`,
    `DTEND:${formatCalendarDate(booking.endTime)}`,
    `SUMMARY:${eventTitle}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    `URL:${booking.googleMeetLink || buildGoogleCalendarUrl(bookingData)}`,
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    `ORGANIZER;CN=${organizerName}:MAILTO:${user.email}`,
    ...(attendeeEmail
      ? [
          `ATTENDEE;CN=${attendeeName};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:MAILTO:${attendeeEmail}`
        ]
      : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return {
    filename: 'aicoyo-booking-invite.ics',
    contentType: 'text/calendar; charset="UTF-8"; method=REQUEST',
    content: `${lines.join('\r\n')}\r\n`,
    disposition: 'inline',
    headers: ['Content-Class: urn:content-classes:calendarmessage'],
    isCalendarInvite: true
  };
}

export function buildIcsFileAttachment(bookingData: BookingWithUser): {
  filename: string;
  contentType: string;
  content: string;
  disposition: 'attachment';
} {
  return {
    filename: 'aicoyo-booking.ics',
    contentType: 'text/calendar; charset="UTF-8"',
    content: buildIcsAttachment(bookingData).content,
    disposition: 'attachment'
  };
}

function formatCalendarDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function resolveEmailLanguage(value: unknown): BookingEmailLanguage {
  if (typeof value === 'string' && value.toLowerCase().startsWith('de')) {
    return 'de';
  }

  return 'en';
}

function toIntlLocale(language: BookingEmailLanguage): string {
  return language === 'de' ? 'de-DE' : 'en-US';
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
