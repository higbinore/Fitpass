import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * FitPass database schema.
 *
 * Conventions (see AGENTS.md):
 * - Money is stored as integer kobo. ₦15,000 is 1500000.
 * - Every table has created_at.
 * - Status values are constrained with CHECK constraints, not free text.
 */

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    durationDays: integer("duration_days").notNull(),
    priceKobo: integer("price_kobo").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("plans_name_unique").on(table.name),
    index("plans_active_sort_idx").on(table.isActive, table.sortOrder),
    check("plans_duration_days_positive", sql`${table.durationDays} > 0`),
    check("plans_price_kobo_positive", sql`${table.priceKobo} > 0`),
  ],
);

/**
 * A member row holds the FitPass role and the membership code.
 *
 * `user_id` is plain text for now. Step 2 adds the foreign key to the Better
 * Auth `user` table once those tables exist.
 */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().unique(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    role: text("role").notNull().default("member"),
    membershipCode: text("membership_code").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("members_role_idx").on(table.role),
    check(
      "members_role_valid",
      sql`${table.role} in ('member', 'front_desk', 'owner')`,
    ),
  ],
);

/**
 * A member may hold at most one `active` subscription at a time; renewals
 * extend the existing row instead of inserting a second active one.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    reminderSent: boolean("reminder_sent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscriptions_one_active_per_member")
      .on(table.memberId)
      .where(sql`${table.status} = 'active'`),
    index("subscriptions_member_status_idx").on(table.memberId, table.status),
    index("subscriptions_expires_at_idx").on(table.expiresAt),
    check(
      "subscriptions_status_valid",
      sql`${table.status} in ('active', 'expired', 'cancelled')`,
    ),
    check(
      "subscriptions_period_valid",
      sql`${table.expiresAt} > ${table.startsAt}`,
    ),
  ],
);

/**
 * A payment is only `paid` after a verified Paystack webhook. `reference` and
 * `paystack_transaction_id` are unique so webhook retries cannot apply twice.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    reference: text("reference").notNull().unique(),
    amountKobo: integer("amount_kobo").notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("pending"),
    paystackTransactionId: text("paystack_transaction_id").unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    webhookPayload: jsonb("webhook_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("payments_member_created_idx").on(table.memberId, table.createdAt),
    check(
      "payments_status_valid",
      sql`${table.status} in ('pending', 'paid', 'failed', 'abandoned')`,
    ),
    check("payments_amount_kobo_positive", sql`${table.amountKobo} > 0`),
  ],
);

/**
 * A row is written only after the server has verified an active, unexpired
 * subscription. Failed attempts are never recorded here.
 */
export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    checkedInBy: uuid("checked_in_by").references(() => members.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("checkins_member_created_idx").on(table.memberId, table.createdAt),
    index("checkins_created_idx").on(table.createdAt),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;
