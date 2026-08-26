import { db } from './src/config/db.js';
import { users, reports } from './src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { regenerateReportContent } from './src/modules/reports/reports.service.js';

async function run() {
  const user = await db.query.users.findFirst({
    where: eq(users.phone, '+919535960988')
  });
  if (!user) throw new Error('User not found');
  
  const report = await db.query.reports.findFirst({
    where: and(eq(reports.userId, user.id), eq(reports.reportKey, 'marriage'))
  });
  
  if (!report) {
     console.log('No marriage report found for user');
     process.exit(0);
  }
  
  console.log('Regenerating report for user:', user.id);
  await regenerateReportContent(report);
  console.log('Done!');
  process.exit(0);
}

run().catch(console.error);
