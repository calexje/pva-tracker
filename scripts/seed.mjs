/**
 * Seed the brief's sample data for a demo user.
 * Usage: MONGODB_URI=... node scripts/seed.mjs demo@example.com password123
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const [email = "demo@example.com", password = "password123"] = process.argv.slice(2);
await mongoose.connect(process.env.MONGODB_URI);
const { connection: c } = mongoose;

const users = c.collection("users");
const cats = c.collection("categories");
const plans = c.collection("plans");
const actuals = c.collection("actuals");

let user = await users.findOne({ email });
if (!user) {
  const r = await users.insertOne({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date(),
  });
  user = { _id: r.insertedId };
  console.log(`Created user ${email} / ${password}`);
}
const uid = user._id;

async function cat(name) {
  const found = await cats.findOne({ userId: uid, name });
  if (found) return found._id;
  return (await cats.insertOne({ userId: uid, name, createdAt: new Date() })).insertedId;
}
const mkt = await cat("Marketing");
const pay = await cat("Payroll");
await cat("Tools");

const planRows = [
  [mkt, "2026-01", 500000], [pay, "2026-01", 2000000],
  [mkt, "2026-02", 500000], [pay, "2026-02", 2000000],
];
for (const [categoryId, month, amountCents] of planRows)
  await plans.updateOne(
    { userId: uid, categoryId, month },
    { $set: { amountCents } },
    { upsert: true }
  );

// Sample CSV actuals (Marketing Feb intentionally omitted, per the brief)
await actuals.deleteMany({ userId: uid });
await actuals.insertMany([
  { userId: uid, categoryId: mkt, month: "2026-01", amountCents: 480000 },
  { userId: uid, categoryId: pay, month: "2026-01", amountCents: 2050000 },
  { userId: uid, categoryId: pay, month: "2026-02", amountCents: 1980000 },
]);

console.log("Seeded sample plans + actuals (Marketing 2026-02 actual omitted by design).");
await mongoose.disconnect();
