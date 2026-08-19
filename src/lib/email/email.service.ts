import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

let transporterInstance: Transporter | null = null;

export function getResolvedEmailCredentials(): { user?: string; pass?: string } {
  const user = env.SMTP_USER || env.SUPPORT_EMAIL_USER;
  const pass = env.SMTP_PASS || env.SUPPORT_EMAIL_APP_PASSWORD;
  return { user, pass };
}

export function isEmailConfigured(): boolean {
  const { user, pass } = getResolvedEmailCredentials();
  return Boolean(user && pass);
}

export function getEmailTransporter(): Transporter | null {
  if (!isEmailConfigured()) {
    return null;
  }

  if (!transporterInstance) {
    const { user, pass } = getResolvedEmailCredentials();
    transporterInstance = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: user!,
        pass: pass!,
      },
    });
  }

  return transporterInstance;
}

/**
 * Resets the transporter instance. Useful for tests.
 */
export function resetEmailTransporter(): void {
  transporterInstance = null;
}

/**
 * Sends an email using configured SMTP settings.
 * Returns boolean indicating whether the message was dispatched.
 */
export async function sendEmail(
  options: SendMailOptions,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    logger.warn('Email sending skipped: SMTP_USER / SMTP_PASS not configured');
    return { success: false, error: 'SMTP credentials not configured' };
  }

  const { user } = getResolvedEmailCredentials();
  const from = options.from || env.SMTP_FROM || `"Aroha Astrology" <${user}>`;
  const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    logger.info(
      { messageId: info.messageId, to, subject: options.subject },
      'Email sent successfully',
    );
    return { success: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, to, subject: options.subject }, 'Failed to send email');
    return { success: false, error: message };
  }
}
