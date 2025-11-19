import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.findFirst({
    include: { versions: { orderBy: { number: 'desc' }, take: 1 } },
  });

  console.log(JSON.stringify({
    apiOverview: project?.spec?.apiOverview,
    endpoints: project?.spec?.endpoints,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
