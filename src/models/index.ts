import mongoose, { Schema, model, models } from "mongoose";

/**
 * Schema design (documented in README):
 * - Every domain document carries userId; every query filters on it.
 * - Plans are unique per (userId, categoryId, month) — upsert semantics.
 * - Actuals are an append-style log: multiple entries per category-month
 *   are allowed and summed at report time.
 * - Locks are one document per (userId, month). Presence = locked.
 *   Locking granularity: MONTH (decision).
 */

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const CategorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
  },
  { timestamps: true }
);
CategorySchema.index({ userId: 1, name: 1 }, { unique: true });

const PlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    month: { type: String, required: true }, // YYYY-MM
    amountCents: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);
PlanSchema.index({ userId: 1, categoryId: 1, month: 1 }, { unique: true });
PlanSchema.index({ userId: 1, month: 1 }); // report range scans

const ActualSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    month: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 0 },
    note: { type: String },
  },
  { timestamps: true }
);
ActualSchema.index({ userId: 1, month: 1, categoryId: 1 }); // report range scans

const LockSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true },
  },
  { timestamps: true }
);
LockSchema.index({ userId: 1, month: 1 }, { unique: true });

export const User = models.User || model("User", UserSchema);
export const Category = models.Category || model("Category", CategorySchema);
export const Plan = models.Plan || model("Plan", PlanSchema);
export const Actual = models.Actual || model("Actual", ActualSchema);
export const Lock = models.Lock || model("Lock", LockSchema);

/** True if this user has locked this month. */
export async function isLocked(userId: string, month: string) {
  return !!(await Lock.exists({ userId, month }));
}

export const LOCKED_ERROR = (month: string) => ({
  error: "LOCKED_PERIOD",
  message: `Period ${month} is locked. Unlock it before editing plans or actuals.`,
});
