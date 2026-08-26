import { findUserByPhoneE164 } from './src/modules/users/users.repo.js';
import { db } from './src/config/db.js';
import { reports } from './src/db/schema.js';
import { and, eq } from 'drizzle-orm';

async function run() {
  const user = await findUserByPhoneE164('+919535960988');
  if (!user) {
    console.log('User not found');
    process.exit(0);
  }
  console.log('User id:', user.id);
  const result = await db.delete(reports).where(and(eq(reports.userId, user.id), eq(reports.reportKey, 'marriage'))).returning();
  console.log('Deleted rows:', result.length);
  process.exit(0);
}
run().catch(console.error);
