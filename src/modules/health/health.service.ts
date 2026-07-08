import { sqlClient } from '../../config/db.js';

export async function checkDb(): Promise<boolean> {
  try {
    await sqlClient`select 1`;
    return true;
  } catch {
    return false;
  }
}
