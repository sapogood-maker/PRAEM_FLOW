import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding PRAEM OPS database...');

  // ── Tenant padrão ──────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'prefeitura-demo' },
    update: {},
    create: {
      name: 'Prefeitura Demo',
      slug: 'prefeitura-demo',
      city: 'São Paulo',
      state: 'SP',
      active: true,
    },
  });
  console.log('✅ Tenant:', tenant.name);

  // ── Admin user ─────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Admin@123', 10);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@praem.local' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Administrador PRAEM',
      email: 'admin@praem.local',
      password: hashedPassword,
      role: 'ADMIN',
      active: true,
    },
  });
  console.log('✅ Admin user:', admin.email);

  // ── Veículos demo ──────────────────────────────────────────────────────────
  const vehicles = await Promise.all([
    prisma.vehicle.upsert({
      where: { plate: 'AAA-0001' },
      update: {},
      create: { tenantId: tenant.id, plate: 'AAA-0001', model: 'Sprinter Van', type: 'VAN', capacity: 10, wheelchair: true, status: 'AVAILABLE', active: true },
    }),
    prisma.vehicle.upsert({
      where: { plate: 'AAA-0002' },
      update: {},
      create: { tenantId: tenant.id, plate: 'AAA-0002', model: 'Ambulância UTI', type: 'AMBULANCE', capacity: 2, stretcher: true, status: 'AVAILABLE', active: true },
    }),
    prisma.vehicle.upsert({
      where: { plate: 'AAA-0003' },
      update: {},
      create: { tenantId: tenant.id, plate: 'AAA-0003', model: 'Micro-ônibus 16p', type: 'BUS', capacity: 16, status: 'AVAILABLE', active: true },
    }),
  ]);
  console.log(`✅ ${vehicles.length} veículos criados`);

  // ── Operação do dia ────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyOp = await prisma.operation.upsert({
    where: { tenantId_date: { tenantId: tenant.id, date: today } },
    update: {},
    create: {
      tenantId: tenant.id,
      date: today,
      status: 'IMPORTED',
      totalVehicles: vehicles.length,
    },
  });
  console.log('✅ Operation:', dailyOp.id);

  // ── Turnos demo ────────────────────────────────────────────────────────────
  const shifts = [
    { name: 'Manhã', startTime: '06:00', endTime: '12:00' },
    { name: 'Tarde', startTime: '12:00', endTime: '18:00' },
    { name: 'Noite', startTime: '18:00', endTime: '23:00' },
  ];
  for (const s of shifts) {
    await prisma.operationShift.upsert({
      where: { id: `${dailyOp.id}-${s.name}` },
      update: {},
      create: {
        id: `${dailyOp.id}-${s.name}`,
        tenantId: tenant.id,
        operationId: dailyOp.id,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        status: 'PENDING',
      },
    });
  }
  console.log('✅ Turnos criados');

  // ── Motoristas operacionais (para o Flutter terminal) ─────────────────────
  const driverPassword = await bcrypt.hash('Motorista@123', 10);
  const expiryDate = new Date('2027-12-31');

  const driverConfigs = [
    { name: 'João Motorista', email: 'motorista1@praem.local', vehicleIdx: 0 },
    { name: 'Maria Motorista', email: 'motorista2@praem.local', vehicleIdx: 1 },
  ];

  for (const cfg of driverConfigs) {
    const driverUser = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: cfg.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: cfg.name,
        email: cfg.email,
        password: driverPassword,
        role: 'DRIVER',
        active: true,
      },
    });

    // Only create Driver record if it doesn't already exist
    const existingDriver = await prisma.driver.findUnique({ where: { userId: driverUser.id } });
    if (!existingDriver) {
      await prisma.driver.create({
        data: {
          tenantId: tenant.id,
          userId: driverUser.id,
          cnh: `CNH${Math.floor(Math.random() * 9000000) + 1000000}`,
          cnhExpiry: expiryDate,
          active: true,
          status: 'OFFLINE',
          defaultVehicleId: vehicles[cfg.vehicleIdx]?.id ?? null,
        },
      });
    }
    console.log(`✅ Driver user: ${cfg.email}`);
  }

  console.log('\n🎉 Seed concluído!');
  console.log('  Admin:     admin@praem.local / Admin@123');
  console.log('  Motorista1: motorista1@praem.local / Motorista@123');
  console.log('  Motorista2: motorista2@praem.local / Motorista@123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
