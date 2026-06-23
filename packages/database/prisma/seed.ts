import { PrismaClient, AuditStatus } from '../generated/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a demo user
  await prisma.user.upsert({
    where: { email: 'demo@seoauditor.io' },
    update: {},
    create: {
      email: 'demo@seoauditor.io',
      name: 'Demo User',
      plan: 'pro',
      auditQuota: 100,
    },
  });

  console.log('Seed completed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
