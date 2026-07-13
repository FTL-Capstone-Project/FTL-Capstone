// Seed a small demo dataset so the app looks real in a demo.
// Run: npm -w server run prisma:seed  (after migrate). TODO(Michael): flesh out.
import { prisma } from "../db.js";

async function main() {
  console.log("Seeding Orbis demo data… (TODO: users, org, indicators, submissions)");
  // Example scaffold:
  // const org = await prisma.organization.create({ data: { clerkOrgId: "org_demo", name: "Acme Inc." } });
  // ...
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
