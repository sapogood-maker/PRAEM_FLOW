/**
 * Seed de HOMOLOGAÇÃO OPERACIONAL — PRAEM HOMOLOG
 *
 * Cria um tenant separado de produção com:
 *  - Destinos médicos reais (Foz do Iguaçu / Cascavel, PR) com coordenadas reais
 *  - Pacientes fictícios LGPD-safe (sem CPF real, sem telefone real)
 *  - Motoristas operacionais prontos para login Flutter
 *  - Frota operacional com van, ambulância e micro-ônibus
 *  - Filas operacionais prontas para despacho
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomCpf(): string {
  // CPF fictício — gerado deterministicamente pelo índice, nunca real
  const n = () => Math.floor(Math.random() * 9);
  return `${n()}${n()}${n()}.${n()}${n()}${n()}.${n()}${n()}${n()}-${n()}${n()}`;
}

function generateQrToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seed HOMOLOGAÇÃO OPERACIONAL — PRAEM HOMOLOG…\n');

  // ── Tenant homologação ─────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'praem-homolog' },
    update: { name: 'PRAEM HOMOLOG' },
    create: {
      name: 'PRAEM HOMOLOG',
      slug: 'praem-homolog',
      city: 'Foz do Iguaçu',
      state: 'PR',
      active: true,
    },
  });
  console.log('✅ Tenant:', tenant.name, '(id:', tenant.id, ')');

  // ── Usuário admin do tenant homolog ───────────────────────────────────────
  const adminPw = await bcrypt.hash('Admin@123', 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@praem.local' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Admin Homologação',
      email: 'admin@praem.local',
      password: adminPw,
      role: 'ADMIN',
      active: true,
    },
  });
  console.log('✅ Admin: admin@praem.local / Admin@123');

  // ── Destinos médicos reais — Foz do Iguaçu / Cascavel ────────────────────
  const locations = [
    {
      name: 'Hospital Ministro Costa Cavalcanti',
      type: 'HOSPITAL' as const,
      address: 'Av. Tancredo Neves, 955',
      district: 'Morumbi',
      city: 'Foz do Iguaçu',
      state: 'PR',
      zipCode: '85852-000',
      latitude: -25.5317,
      longitude: -54.5704,
      specialties: ['Cardiologia', 'Ortopedia', 'Neurologia', 'UTI'],
      estimatedTravelMinutes: 35,
    },
    {
      name: 'Uopeccan — Unidade Foz do Iguaçu',
      type: 'ONCOLOGY_CENTER' as const,
      address: 'R. Rui Barbosa, 1701',
      district: 'Centro',
      city: 'Foz do Iguaçu',
      state: 'PR',
      zipCode: '85852-070',
      latitude: -25.5389,
      longitude: -54.5884,
      specialties: ['Oncologia', 'Quimioterapia', 'Radioterapia'],
      estimatedTravelMinutes: 40,
    },
    {
      name: 'Hospital Municipal Padre Germano Lauck',
      type: 'HOSPITAL' as const,
      address: 'R. Mato Grosso, s/n',
      district: 'Jardim Central',
      city: 'Foz do Iguaçu',
      state: 'PR',
      zipCode: '85851-010',
      latitude: -25.5483,
      longitude: -54.5851,
      specialties: ['Urgência', 'Pediatria', 'Clínica Geral'],
      estimatedTravelMinutes: 30,
    },
    {
      name: 'Hospital Universitário do Oeste do Paraná — HUOP',
      type: 'HOSPITAL' as const,
      address: 'R. Universitária, 2069',
      district: 'Universitário',
      city: 'Cascavel',
      state: 'PR',
      zipCode: '85819-110',
      latitude: -24.9672,
      longitude: -53.4652,
      specialties: ['Alta Complexidade', 'Cirurgia', 'Hematologia', 'Neurologia'],
      estimatedTravelMinutes: 90,
    },
    {
      name: 'Clínica de Hemodiálise Nefroclin',
      type: 'HEMODIALYSIS' as const,
      address: 'Av. Brasil, 2345',
      district: 'Centro',
      city: 'Foz do Iguaçu',
      state: 'PR',
      zipCode: '85851-000',
      latitude: -25.5401,
      longitude: -54.5763,
      specialties: ['Hemodiálise', 'Nefrologia'],
      estimatedTravelMinutes: 25,
    },
    {
      name: 'UBS Morumbi — Unidade Básica de Saúde',
      type: 'UBS' as const,
      address: 'R. Ivaí, 150',
      district: 'Morumbi',
      city: 'Foz do Iguaçu',
      state: 'PR',
      zipCode: '85854-020',
      latitude: -25.5441,
      longitude: -54.5590,
      specialties: ['Clínica Geral', 'Pré-natal', 'Vacinação'],
      estimatedTravelMinutes: 15,
    },
  ];

  const savedLocations: { id: string; name: string }[] = [];
  for (const loc of locations) {
    const { specialties, ...locData } = loc;
    const saved = await prisma.healthcareLocation.upsert({
      where: { id: `homolog-${loc.name.slice(0, 20).replace(/\s/g, '-').toLowerCase()}` },
      update: { latitude: loc.latitude, longitude: loc.longitude },
      create: {
        id: `homolog-${loc.name.slice(0, 20).replace(/\s/g, '-').toLowerCase()}`,
        tenantId: tenant.id,
        ...locData,
        active: true,
        geocodingValidated: true,
        specialties: {
          create: specialties.map((s) => ({ specialty: s })),
        },
      },
    });
    savedLocations.push({ id: saved.id, name: saved.name });
    console.log('✅ Destino:', saved.name);
  }

  // ── Veículos operacionais ────────────────────────────────────────────────
  const vehicleData = [
    { plate: 'HML-0001', model: 'Sprinter Van 16p', type: 'VAN' as const, capacity: 16, wheelchair: true },
    { plate: 'HML-0002', model: 'Ambulância UTI Móvel', type: 'AMBULANCE' as const, capacity: 2, stretcher: true },
    { plate: 'HML-0003', model: 'Micro-ônibus 28p', type: 'BUS' as const, capacity: 28 },
    { plate: 'HML-0004', model: 'Sprinter Adaptada', type: 'ADAPTED' as const, capacity: 8, wheelchair: true },
  ];
  const vehicles = await Promise.all(
    vehicleData.map((v) =>
      prisma.vehicle.upsert({
        where: { plate: v.plate },
        update: {},
        create: {
          tenantId: tenant.id,
          plate: v.plate,
          model: v.model,
          type: v.type,
          capacity: v.capacity,
          wheelchair: v.wheelchair ?? false,
          stretcher: (v as any).stretcher ?? false,
          status: 'AVAILABLE',
          active: true,
        },
      }),
    ),
  );
  console.log(`✅ ${vehicles.length} veículos criados`);

  // ── Motoristas operacionais (login Flutter) ───────────────────────────────
  const driverPw = await bcrypt.hash('Motorista@123', 10);
  const cnhExpiry = new Date('2028-12-31');

  const driverConfigs = [
    { name: 'Carlos Motorista', email: 'motorista1@praem.local', vehicleIdx: 0 },
    { name: 'Ana Motorista', email: 'motorista2@praem.local', vehicleIdx: 1 },
    { name: 'Pedro Motorista', email: 'motorista3@praem.local', vehicleIdx: 2 },
    { name: 'Lucia Motorista', email: 'motorista4@praem.local', vehicleIdx: 3 },
  ];

  const drivers: { id: string; name: string }[] = [];
  for (const cfg of driverConfigs) {
    const driverUser = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: cfg.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: cfg.name,
        email: cfg.email,
        password: driverPw,
        role: 'DRIVER',
        active: true,
      },
    });

    let driver = await prisma.driver.findUnique({ where: { userId: driverUser.id } });
    if (!driver) {
      driver = await prisma.driver.create({
        data: {
          tenantId: tenant.id,
          userId: driverUser.id,
          cnh: `CNH${100000 + driverConfigs.indexOf(cfg)}`,
          cnhExpiry,
          active: true,
          status: 'OFFLINE',
          defaultVehicleId: vehicles[cfg.vehicleIdx]?.id ?? null,
        },
      });
    }
    drivers.push({ id: driver.id, name: cfg.name });
    console.log(`✅ Motorista: ${cfg.email}`);
  }

  // ── Pacientes fictícios LGPD-safe ─────────────────────────────────────────
  const patientData = [
    { name: 'Maria Fictícia da Silva', cpf: '000.000.001-00', mobility: 'NORMAL' as const, risk: 'HIGH' as const, specialty: 'Oncologia', locationIdx: 1 },
    { name: 'José Fictício Souza', cpf: '000.000.002-00', mobility: 'WHEELCHAIR' as const, risk: 'CRITICAL' as const, specialty: 'Hemodiálise', locationIdx: 4 },
    { name: 'Ana Fictícia Oliveira', cpf: '000.000.003-00', mobility: 'NORMAL' as const, risk: 'MEDIUM' as const, specialty: 'Cardiologia', locationIdx: 0 },
    { name: 'Carlos Fictício Lima', cpf: '000.000.004-00', mobility: 'NORMAL' as const, risk: 'HIGH' as const, specialty: 'Quimioterapia', locationIdx: 1 },
    { name: 'Sandra Fictícia Costa', cpf: '000.000.005-00', mobility: 'OXYGEN' as const, risk: 'CRITICAL' as const, specialty: 'UTI', locationIdx: 0 },
    { name: 'Roberto Fictício Pereira', cpf: '000.000.006-00', mobility: 'NORMAL' as const, risk: 'MEDIUM' as const, specialty: 'Neurologia', locationIdx: 3 },
    { name: 'Fernanda Fictícia Rocha', cpf: '000.000.007-00', mobility: 'WHEELCHAIR' as const, risk: 'HIGH' as const, specialty: 'Hemodiálise', locationIdx: 4 },
    { name: 'Paulo Fictício Almeida', cpf: '000.000.008-00', mobility: 'NORMAL' as const, risk: 'LOW' as const, specialty: 'Clínica Geral', locationIdx: 5 },
    { name: 'Juliana Fictícia Nunes', cpf: '000.000.009-00', mobility: 'STRETCHER' as const, risk: 'CRITICAL' as const, specialty: 'Alta Complexidade', locationIdx: 3 },
    { name: 'Eduardo Fictício Melo', cpf: '000.000.010-00', mobility: 'NORMAL' as const, risk: 'MEDIUM' as const, specialty: 'Radioterapia', locationIdx: 1 },
  ];

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const savedPatients: { id: string; name: string; locationIdx: number; specialty: string }[] = [];
  for (const p of patientData) {
    const qrToken = generateQrToken();
    const qrTokenHash = crypto.createHash('sha256').update(qrToken).digest('hex');
    const qrExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const existingPatient = await prisma.patient.findFirst({
      where: { tenantId: tenant.id, cpf: p.cpf },
    });

    const patient = existingPatient
      ? await prisma.patient.update({
          where: { id: existingPatient.id },
          data: {},
        })
      : await prisma.patient.create({
          data: {
            tenantId: tenant.id,
            name: p.name,
            cpf: p.cpf,
            birthDate: new Date('1970-01-01'),
            address: 'Endereço Fictício — apenas para testes de homologação',
            mobility: p.mobility,
            clinicalRisk: p.risk,
            recurrent: true,
            notes: `[HOMOLOG] Paciente fictício. Especialidade: ${p.specialty}`,
            qrToken,
            qrTokenHash,
            qrIssuedAt: now,
            qrActive: true,
            qrExpiresAt,
            qrVersion: 1,
            operationalId: `HML-${String(patientData.indexOf(p) + 1).padStart(4, '0')}`,
          },
        });
    savedPatients.push({ id: patient.id, name: patient.name, locationIdx: p.locationIdx, specialty: p.specialty });
    console.log(`✅ Paciente: ${p.name} (${p.specialty})`);
  }

  // ── Filas operacionais — pacientes prontos para despacho ──────────────────
  const appointmentTime = new Date(today);
  appointmentTime.setHours(8, 0, 0, 0);

  const priorityMap: Record<string, 'EMERGENCY' | 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'PENDING'> = {
    CRITICAL: 'CRITICAL',
    HIGH: 'HIGH',
    MEDIUM: 'NORMAL',
    LOW: 'LOW',
  };

  for (let i = 0; i < savedPatients.length; i++) {
    const sp = savedPatients[i];
    const loc = savedLocations[sp.locationIdx];
    const patientFull = patientData[i];
    const apptTime = new Date(appointmentTime.getTime() + i * 30 * 60 * 1000);

    await prisma.operationalQueue.upsert({
      where: { id: `homolog-queue-${sp.id}` },
      update: {},
      create: {
        id: `homolog-queue-${sp.id}`,
        tenantId: tenant.id,
        patientId: sp.id,
        appointmentDate: apptTime,
        destination: loc?.name ?? 'Hospital Municipal',
        healthcareLocationId: loc?.id ?? null,
        priority: priorityMap[patientFull.risk] ?? 'NORMAL',
        status: 'WAITING',
        queueType: 'LOGISTICS',
        confirmationStatus: 'CONFIRMED',
        slaMinutes: patientFull.risk === 'CRITICAL' ? 30 : patientFull.risk === 'HIGH' ? 60 : 120,
        slaStatus: 'ON_TIME',
      },
    });
  }
  console.log(`✅ ${savedPatients.length} filas operacionais criadas`);

  // ── Operação do dia homolog ───────────────────────────────────────────────
  const dailyOp = await prisma.dailyOperation.upsert({
    where: { tenantId_date: { tenantId: tenant.id, date: today } },
    update: {},
    create: {
      tenantId: tenant.id,
      date: today,
      status: 'ACTIVE',
      totalVehicles: vehicles.length,
      totalDrivers: drivers.length,
      totalPatients: savedPatients.length,
    },
  });
  console.log('✅ DailyOperation:', dailyOp.id);

  // ── Turnos ────────────────────────────────────────────────────────────────
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
        dailyOperationId: dailyOp.id,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        status: 'ACTIVE',
      },
    });
  }
  console.log('✅ Turnos criados');

  console.log('\n🎉 Seed HOMOLOGAÇÃO concluído!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Admin:      admin@praem.local / Admin@123');
  console.log('  Motorista1: motorista1@praem.local / Motorista@123');
  console.log('  Motorista2: motorista2@praem.local / Motorista@123');
  console.log('  Motorista3: motorista3@praem.local / Motorista@123');
  console.log('  Motorista4: motorista4@praem.local / Motorista@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ⚠️  Tenant:   PRAEM HOMOLOG (slug: praem-homolog)');
  console.log('  ⚠️  Todos os pacientes são FICTÍCIOS — dados LGPD-safe');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
