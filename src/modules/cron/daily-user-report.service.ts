import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { sendEmail } from '../../lib/email/email.service.js';
import { countUsers, usersActiveBetween, usersCreatedBetween } from '../users/users.repo.js';
import { sumPaidOrdersBetween, type DateRange } from '../admin/admin.repo.js';
import { formatPaise } from '../../lib/money.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface DailyReportWindows {
  yesterday: DateRange;
  todayTill8am: DateRange;
  todayFullRange: DateRange;
  formattedDateIST: string;
  yesterdayDateIST: string;
}

export interface DailyReportData {
  generatedAtIST: string;
  dateIST: string;
  yesterdayDateIST: string;
  newUsersYesterday: number;
  newUsersTodayTill8am: number;
  activeUsersYesterday: number;
  activeUsersTodayTill8am: number;
  totalUsers: number;
  revenueYesterday: { totalPaise: number; count: number };
  revenueTodayTill8am: { totalPaise: number; count: number };
}

/**
 * Computes IST calendar boundaries for yesterday and today (up to 8:00 AM IST).
 */
export function getDailyReportWindows(instant: Date = new Date()): DailyReportWindows {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();

  // IST instants in UTC
  const todayStart = new Date(Date.UTC(year, month, day, 0, 0, 0) - IST_OFFSET_MS);
  const today8am = new Date(Date.UTC(year, month, day, 8, 0, 0) - IST_OFFSET_MS);
  const todayEnd = new Date(Date.UTC(year, month, day + 1, 0, 0, 0) - IST_OFFSET_MS);
  const yesterdayStart = new Date(Date.UTC(year, month, day - 1, 0, 0, 0) - IST_OFFSET_MS);

  const formattedDateIST = shifted.toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const yesterdayShifted = new Date(instant.getTime() - 24 * 60 * 60 * 1000 + IST_OFFSET_MS);
  const yesterdayDateIST = yesterdayShifted.toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return {
    yesterday: { from: yesterdayStart, to: todayStart },
    todayTill8am: { from: todayStart, to: today8am },
    todayFullRange: { from: todayStart, to: todayEnd },
    formattedDateIST,
    yesterdayDateIST,
  };
}

/**
 * Queries database for all required metrics across yesterday & today till 8 AM IST.
 */
export async function gatherDailyUserReportData(
  instant: Date = new Date(),
): Promise<DailyReportData> {
  const windows = getDailyReportWindows(instant);

  const [
    newUsersYesterday,
    newUsersTodayTill8am,
    activeUsersYesterday,
    activeUsersTodayTill8am,
    totalUsers,
    revenueYesterday,
    revenueTodayTill8am,
  ] = await Promise.all([
    usersCreatedBetween(windows.yesterday),
    usersCreatedBetween(windows.todayTill8am),
    usersActiveBetween(windows.yesterday),
    usersActiveBetween(windows.todayTill8am),
    countUsers(),
    sumPaidOrdersBetween(windows.yesterday),
    sumPaidOrdersBetween(windows.todayTill8am),
  ]);

  const generatedAtIST = new Date(instant.getTime() + IST_OFFSET_MS)
    .toISOString()
    .replace('Z', '+05:30');

  return {
    generatedAtIST,
    dateIST: windows.formattedDateIST,
    yesterdayDateIST: windows.yesterdayDateIST,
    newUsersYesterday,
    newUsersTodayTill8am,
    activeUsersYesterday,
    activeUsersTodayTill8am,
    totalUsers,
    revenueYesterday,
    revenueTodayTill8am,
  };
}

/**
 * Generates modern HTML email template for the daily report.
 */
export function renderDailyReportHtml(data: DailyReportData): string {
  const revenueYesterdayStr = formatPaise(data.revenueYesterday.totalPaise);
  const revenueTodayStr = formatPaise(data.revenueTodayTill8am.totalPaise);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aroha Daily Metrics - 8:00 AM IST</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #0d0f17;
      color: #e2e8f0;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: #141724;
      border: 1px solid #2d3748;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .header {
      background: linear-gradient(135deg, #3b1366 0%, #1e1b4b 50%, #0f172a 100%);
      padding: 32px 24px;
      text-align: center;
      border-bottom: 1px solid #3b2d54;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(234, 179, 8, 0.15);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.3);
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 6px 0;
      letter-spacing: -0.5px;
    }
    .subtitle {
      font-size: 14px;
      color: #94a3b8;
      margin: 0;
    }
    .content {
      padding: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: #1a1e2e;
      border: 1px solid #283046;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }
    .card-label {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .card-value {
      font-size: 28px;
      font-weight: 800;
      color: #38bdf8;
      margin: 0;
    }
    .card-value.highlight-green {
      color: #4ade80;
    }
    .card-value.highlight-purple {
      color: #c084fc;
    }
    .card-value.highlight-amber {
      color: #fbbf24;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.75px;
      margin: 24px 0 12px 0;
      border-bottom: 1px solid #2d3748;
      padding-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 14px;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      background: #1e2436;
      color: #94a3b8;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #232a3d;
      color: #e2e8f0;
    }
    .num {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .total-banner {
      background: #1e2436;
      border-left: 4px solid #38bdf8;
      border-radius: 8px;
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
    }
    .total-label {
      font-size: 14px;
      color: #94a3b8;
      font-weight: 500;
    }
    .total-value {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
    }
    .footer {
      padding: 20px 24px;
      background: #0f121d;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #1e2436;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">Aroha Astrology &bull; Morning Brief</div>
      <h1 class="title">Daily User & Activity Report</h1>
      <p class="subtitle">${data.dateIST} &bull; 8:00 AM IST</p>
    </div>
    
    <div class="content">
      <div class="grid">
        <div class="card">
          <div class="card-label">New Users Yesterday</div>
          <div class="card-value highlight-green">${data.newUsersYesterday.toLocaleString('en-IN')}</div>
        </div>
        <div class="card">
          <div class="card-label">New Users Today (till 8 AM)</div>
          <div class="card-value highlight-amber">${data.newUsersTodayTill8am.toLocaleString('en-IN')}</div>
        </div>
        <div class="card">
          <div class="card-label">Active Users Yesterday</div>
          <div class="card-value highlight-purple">${data.activeUsersYesterday.toLocaleString('en-IN')}</div>
        </div>
        <div class="card">
          <div class="card-label">Active Users Today (till 8 AM)</div>
          <div class="card-value">${data.activeUsersTodayTill8am.toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div class="section-title">Summary Breakdown</div>
      <table>
        <thead>
          <tr>
            <th>Time Period</th>
            <th class="num">New Users</th>
            <th class="num">Active Users</th>
            <th class="num">Paid Orders</th>
            <th class="num">Revenue</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Yesterday</strong> (${data.yesterdayDateIST})</td>
            <td class="num">${data.newUsersYesterday}</td>
            <td class="num">${data.activeUsersYesterday}</td>
            <td class="num">${data.revenueYesterday.count}</td>
            <td class="num">${revenueYesterdayStr}</td>
          </tr>
          <tr>
            <td><strong>Today</strong> (00:00 - 08:00 IST)</td>
            <td class="num">${data.newUsersTodayTill8am}</td>
            <td class="num">${data.activeUsersTodayTill8am}</td>
            <td class="num">${data.revenueTodayTill8am.count}</td>
            <td class="num">${revenueTodayStr}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-banner">
        <span class="total-label">Total Registered Users (All Time):</span>
        <span class="total-value">${data.totalUsers.toLocaleString('en-IN')}</span>
      </div>
    </div>

    <div class="footer">
      Automated daily report generated at ${data.generatedAtIST} for Aroha Astrology team.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates plain text version of the report.
 */
export function renderDailyReportPlainText(data: DailyReportData): string {
  const revenueYesterdayStr = formatPaise(data.revenueYesterday.totalPaise);
  const revenueTodayStr = formatPaise(data.revenueTodayTill8am.totalPaise);

  return `=== AROHA ASTROLOGY: DAILY USER & ACTIVITY REPORT (8:00 AM IST) ===
Date: ${data.dateIST}

[KEY METRICS]
- Total New Users Yesterday (${data.yesterdayDateIST}): ${data.newUsersYesterday}
- New Users Today (00:00 - 08:00 IST): ${data.newUsersTodayTill8am}
- Active Users Yesterday: ${data.activeUsersYesterday}
- Active Users Today (00:00 - 08:00 IST): ${data.activeUsersTodayTill8am}

[SUMMARY BREAKDOWN]
* Yesterday:
  - New Signups: ${data.newUsersYesterday}
  - Active Users: ${data.activeUsersYesterday}
  - Paid Orders: ${data.revenueYesterday.count} (${revenueYesterdayStr})

* Today (till 8:00 AM IST):
  - New Signups: ${data.newUsersTodayTill8am}
  - Active Users: ${data.activeUsersTodayTill8am}
  - Paid Orders: ${data.revenueTodayTill8am.count} (${revenueTodayStr})

[ALL TIME TOTALS]
- Total Registered Users: ${data.totalUsers}

Generated at: ${data.generatedAtIST}
`;
}

export interface RunDailyUserReportOptions {
  recipientEmails?: string[];
  instant?: Date;
}

export interface RunDailyUserReportResult {
  data: DailyReportData;
  emailDispatched: boolean;
  recipients: string[];
  messageId?: string;
  error?: string;
}

/**
 * Runs metric collection and dispatches the 8 AM IST report email.
 */
export async function runDailyUserReport(
  options: RunDailyUserReportOptions = {},
): Promise<RunDailyUserReportResult> {
  const instant = options.instant || new Date();
  const data = await gatherDailyUserReportData(instant);

  const recipients =
    options.recipientEmails && options.recipientEmails.length > 0
      ? options.recipientEmails
      : env.REPORT_RECIPIENT_EMAILS;

  if (recipients.length === 0) {
    logger.warn('Daily user report skipped: no recipients configured in REPORT_RECIPIENT_EMAILS');
    return {
      data,
      emailDispatched: false,
      recipients: [],
      error: 'No recipients configured in REPORT_RECIPIENT_EMAILS or payload',
    };
  }

  const subject = `📊 Aroha Daily Metrics (${data.dateIST}): ${data.newUsersYesterday} new yesterday / ${data.activeUsersYesterday} active`;
  const html = renderDailyReportHtml(data);
  const text = renderDailyReportPlainText(data);

  const sendResult = await sendEmail({
    to: recipients,
    subject,
    html,
    text,
  });

  return {
    data,
    emailDispatched: sendResult.success,
    recipients,
    messageId: sendResult.messageId,
    error: sendResult.error,
  };
}
