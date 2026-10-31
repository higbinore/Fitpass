import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";

import { checkins, gymMembershipRoles, gymMemberships, gyms, members, paymentReferenceRegistry, payments, plans, platformAdmins, platformPayments, subscriptions } from "../lib/schema.ts";

function hasCompositeReference(table: Parameters<typeof getTableConfig>[0], local: string[], remoteTable: string, remote: string[]) {
  return getTableConfig(table).foreignKeys.some((foreignKey) => {
    const reference = foreignKey.reference();
    return getTableConfig(reference.foreignTable).name === remoteTable &&
      reference.columns.map((column) => column.name).join(",") === local.join(",") &&
      reference.foreignColumns.map((column) => column.name).join(",") === remote.join(",");
  });
}

test("gym-owned records enforce same-gym foreign keys", () => {
  assert.equal(hasCompositeReference(subscriptions, ["gym_id", "member_id"], "members", ["gym_id", "id"]), true);
  assert.equal(hasCompositeReference(subscriptions, ["gym_id", "plan_id"], "plans", ["gym_id", "id"]), true);
  assert.equal(hasCompositeReference(payments, ["gym_id", "member_id"], "members", ["gym_id", "id"]), true);
  assert.equal(hasCompositeReference(checkins, ["gym_id", "checked_in_by_membership_id"], "gym_memberships", ["gym_id", "id"]), true);
  assert.equal(hasCompositeReference(platformPayments, ["gym_id", "platform_subscription_id"], "platform_subscriptions", ["gym_id", "id"]), true);
});

test("membership identity and role grants are normalized and revocation history is retained", () => {
  const membershipConfig = getTableConfig(gymMemberships);
  assert.ok(membershipConfig.uniqueConstraints.some((constraint) => constraint.columns.map((column) => column.name).join(",") === "gym_id,user_id"));
  const roleConfig = getTableConfig(gymMembershipRoles);
  assert.ok(roleConfig.columns.some((column) => column.name === "revoked_at"));
  assert.ok(roleConfig.indexes.some((index) => index.config.unique && index.config.where));
});

test("platform administrator suspension is represented as a persistent schema field", () => {
  assert.ok(getTableConfig(platformAdmins).columns.some((column) => column.name === "suspended_at"));
});

test("gyms store a bounded per-gym daily check-in limit", () => {
  const config = getTableConfig(gyms);
  assert.ok(config.columns.some((column) => column.name === "max_daily_checkins" && column.notNull));
  assert.ok(config.checks.some((constraint) => constraint.name === "gyms_max_daily_checkins_valid"));
});

test("member identity and membership codes are gym-scoped", () => {
  const config = getTableConfig(members);
  assert.ok(config.indexes.some((index) => index.config.unique && index.config.columns.map((item) => "name" in item ? item.name : "").join(",") === "gym_id,user_id"));
  assert.ok(config.indexes.some((index) => index.config.unique && index.config.columns.map((item) => "name" in item ? item.name : "").join(",") === "gym_id,membership_code"));
  assert.ok(getTableConfig(plans).indexes.some((index) => index.config.unique && index.config.columns.map((item) => "name" in item ? item.name : "").join(",") === "gym_id,name"));
});

test("payment references share one global registry across gym and platform charges", () => {
  const config = getTableConfig(paymentReferenceRegistry);
  assert.ok(config.columns.some((column) => column.name === "reference" && column.primary));
  assert.ok(config.columns.some((column) => column.name === "payment_type"));
  assert.ok(config.checks.some((constraint) => constraint.name === "payment_reference_type_valid"));
});
