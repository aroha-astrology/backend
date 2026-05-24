import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  time,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const genderEnum = pgEnum('gender', ['male', 'female', 'other']);

export type PlaceOfBirth = {
  name: string;
  lat: number;
  lon: number;
  /** IANA timezone, e.g. "Asia/Kolkata". */
  tz: string;
};

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    firebaseUid: text('firebase_uid').notNull().unique(),
    phoneE164: text('phone_e164').unique(),
    displayName: text('display_name'),
    gender: genderEnum('gender'),
    dateOfBirth: date('date_of_birth'),
    timeOfBirth: time('time_of_birth'),
    placeOfBirth: jsonb('place_of_birth').$type<PlaceOfBirth>(),
    profileCompletedAt: timestamp('profile_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    firebaseUidIdx: index('users_firebase_uid_idx').on(table.firebaseUid),
    phoneIdx: index('users_phone_e164_idx').on(table.phoneE164),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
