import env from '../src/config/env.js'
import prisma from '../src/database/postgres/prisma.js'
import { hashPassword } from '../src/utils/password.js'

// Minimal development accounts only. No course content, assessments, or student evidence.
// Set SEED_DEV_PASSWORD in the shell (not committed) to enable local login hashes.
// ADMIN is created only when SEED_DEV_PASSWORD is set (public register cannot create ADMIN).

async function main() {
  if (env.isProduction) {
    throw new Error('Refusing to seed development data in production.')
  }

  const password = process.env.SEED_DEV_PASSWORD
  const passwordHash =
    typeof password === 'string' && password.trim().length >= 8
      ? await hashPassword(password.trim())
      : null

  if (!passwordHash) {
    console.warn(
      'SEED_DEV_PASSWORD unset or too short: seeding users without passwordHash. ' +
        'Use scripts/ensure-dev-login-accounts.js for login-ready accounts.',
    )
  }

  const lecturer = await prisma.user.upsert({
    where: { email: 'lecturer@selvia.local' },
    update: passwordHash
      ? { passwordHash, isActive: true, firstName: 'Dev', lastName: 'Lecturer' }
      : {},
    create: {
      email: 'lecturer@selvia.local',
      firstName: 'Dev',
      lastName: 'Lecturer',
      role: 'LECTURER',
      passwordHash: passwordHash ?? undefined,
      lecturer: { create: { staffNumber: 'DEV-LEC-0001' } },
    },
  })
  console.log(`Seeded lecturer: ${lecturer.email} id=${lecturer.id}`)

  const student = await prisma.user.upsert({
    where: { email: 'student@selvia.local' },
    update: passwordHash
      ? { passwordHash, isActive: true, role: 'STUDENT', firstName: 'Dev', lastName: 'Student' }
      : {},
    create: {
      email: 'student@selvia.local',
      firstName: 'Dev',
      lastName: 'Student',
      role: 'STUDENT',
      passwordHash: passwordHash ?? undefined,
      student: { create: { studentNumber: 'DEV-STU-0001' } },
    },
  })
  console.log(`Seeded student: ${student.email} id=${student.id}`)

  if (passwordHash) {
    const admin = await prisma.user.upsert({
      where: { email: 'admin@selvia.local' },
      update: {
        passwordHash,
        isActive: true,
        role: 'ADMIN',
        firstName: 'Dev',
        lastName: 'Admin',
      },
      create: {
        email: 'admin@selvia.local',
        firstName: 'Dev',
        lastName: 'Admin',
        role: 'ADMIN',
        passwordHash,
      },
    })
    console.log(`Seeded admin: ${admin.email} id=${admin.id}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
