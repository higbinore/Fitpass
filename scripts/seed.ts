import { getDb } from "../lib/db";
import { formatNaira } from "../lib/money";
import { plans } from "../lib/schema";

/**
 * Seeds the FitPass membership plans.
 *
 * Safe to run more than once: each plan is matched by name and updated in
 * place, so re-running never creates duplicates.
 *
 * Prices are integer kobo. ₦2,000 = 200000.
 */
const seedPlans = [
  {
    name: "Day Pass",
    durationDays: 1,
    priceKobo: 200_000,
    description: "One full day at the gym, for visitors and drop-ins.",
    sortOrder: 1,
  },
  {
    name: "Monthly",
    durationDays: 30,
    priceKobo: 1_500_000,
    description: "30 days of unlimited visits.",
    sortOrder: 2,
  },
  {
    name: "3 Months",
    durationDays: 90,
    priceKobo: 4_000_000,
    description: "90 days of unlimited visits, about ₦13,333 a month.",
    sortOrder: 3,
  },
  {
    name: "Annual",
    durationDays: 365,
    priceKobo: 14_000_000,
    description: "A full year of unlimited visits, about ₦11,667 a month.",
    sortOrder: 4,
  },
];

async function seed() {
  const db = getDb();

  for (const plan of seedPlans) {
    await db
      .insert(plans)
      .values(plan)
      .onConflictDoUpdate({
        target: plans.name,
        set: {
          durationDays: plan.durationDays,
          priceKobo: plan.priceKobo,
          description: plan.description,
          sortOrder: plan.sortOrder,
          isActive: true,
        },
      });

    console.log(
      `  ${plan.name}: ${formatNaira(plan.priceKobo)} for ${plan.durationDays} day(s)`,
    );
  }

  const stored = await db.select({ id: plans.id }).from(plans);

  console.log(
    `Seeded ${seedPlans.length} plans. Plans now in the database: ${stored.length}.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      "Seeding failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exit(1);
  });
