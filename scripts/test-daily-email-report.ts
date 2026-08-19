import 'dotenv/config';
import {
  gatherDailyUserReportData,
  renderDailyReportPlainText,
  runDailyUserReport,
} from '../src/modules/cron/daily-user-report.service.js';
import { isEmailConfigured } from '../src/lib/email/email.service.js';

async function main() {
  const targetEmail = process.argv[2];

  console.log('--- Daily 8:00 AM IST User Report Preview ---');
  const data = await gatherDailyUserReportData();
  console.log(renderDailyReportPlainText(data));

  console.log(
    `\nEmail configuration status: ${isEmailConfigured() ? 'CONFIGURED' : 'NOT CONFIGURED'}`,
  );

  if (targetEmail) {
    console.log(`\nAttempting to send test email to: ${targetEmail}...`);
    const result = await runDailyUserReport({ recipientEmails: [targetEmail] });
    console.log('Result:', result);
  } else {
    console.log('\nTip: Run with an email argument to test actual sending:');
    console.log('tsx scripts/test-daily-email-report.ts your-email@example.com');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error running preview:', err);
  process.exit(1);
});
