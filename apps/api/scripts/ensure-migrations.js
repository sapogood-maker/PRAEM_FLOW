const { spawnSync } = require('child_process');
const { readdirSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');

const SCHEMA_PATH = '/app/apps/api/src/prisma/schema.prisma';
const MIGRATIONS_DIR = '/app/apps/api/src/prisma/migrations';
const REQUIRED_MIGRATION = '20260529_operation_transition_safe';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function readMigrationDirectories() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== 'migration_lock.toml')
    .map((entry) => entry.name)
    .sort();
}

async function readAppliedMigrations(prisma) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name ASC',
  );
  return rows.map((row) => row.migration_name);
}

function printDiagnostics(containerMigrations, appliedMigrations, pendingMigrations) {
  console.log('');
  console.log('=== Prisma migration diagnostics ===');
  console.log(`Schema: ${SCHEMA_PATH}`);
  console.log(`Migrations dir: ${MIGRATIONS_DIR}`);
  console.log('');
  console.log('Migrations found in container:');
  for (const migration of containerMigrations) {
    const sqlPath = join(MIGRATIONS_DIR, migration, 'migration.sql');
    console.log(`- ${migration} (${sqlPath})`);
  }
  console.log('');
  console.log('Migrations applied in database (_prisma_migrations):');
  for (const migration of appliedMigrations) {
    console.log(`- ${migration}`);
  }
  console.log('');
  console.log('Pending migrations:');
  if (pendingMigrations.length === 0) {
    console.log('- none');
  } else {
    for (const migration of pendingMigrations) {
      console.log(`- ${migration}`);
    }
  }
  console.log('');
}

async function main() {
  const containerMigrations = readMigrationDirectories();

  console.log('[startup] Running prisma migrate deploy...');
  run('npx', ['prisma', 'migrate', 'deploy', `--schema=${SCHEMA_PATH}`]);

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const appliedMigrations = await readAppliedMigrations(prisma);
    const appliedSet = new Set(appliedMigrations);
    const pendingMigrations = containerMigrations.filter((name) => !appliedSet.has(name));

    printDiagnostics(containerMigrations, appliedMigrations, pendingMigrations);

    if (!containerMigrations.includes(REQUIRED_MIGRATION)) {
      throw new Error(
        `Required migration "${REQUIRED_MIGRATION}" is missing from container at ${MIGRATIONS_DIR}`,
      );
    }

    if (!appliedSet.has(REQUIRED_MIGRATION)) {
      throw new Error(
        `Required migration "${REQUIRED_MIGRATION}" is not applied in database (_prisma_migrations)`,
      );
    }

    if (pendingMigrations.length > 0) {
      throw new Error(
        `Pending Prisma migrations detected: ${pendingMigrations.join(', ')}. Refusing to start API.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[startup] Migration guard failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
