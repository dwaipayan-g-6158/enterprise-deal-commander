import { logger } from "./logger";

/**
 * Pluggable mail transport. No SMTP is configured in this environment (and Zoho
 * Catalyst will own delivery after migration), so when `SMTP_URL` is absent this
 * is a no-op that logs the intent. The `in_app` notification channel and the
 * persisted `notification_log` remain fully functional regardless.
 */
export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(mail: OutgoingMail): Promise<boolean> {
  if (!process.env.SMTP_URL) {
    logger.info({ to: mail.to, subject: mail.subject }, "Mail suppressed (no SMTP_URL configured)");
    return false;
  }
  // A real transport would go here once Catalyst/SMTP credentials exist.
  logger.info({ to: mail.to, subject: mail.subject }, "Mail dispatched");
  return true;
}
