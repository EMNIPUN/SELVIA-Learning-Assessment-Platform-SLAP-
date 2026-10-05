import env from '../src/config/env.js'
import prisma from '../src/database/postgres/prisma.js'

// Minimal development accounts only. No course content, assessments, or student evidence.
// passwordHash stays NULL until authentication is implemented.
const devUsers = [
  {
    email: 'lecturer@selvia.local',
    firstName: 'Dev',
    lastName: 'Lecturer',
    role: 'LECTURER',
    lecturer: { create: { staffNumber: 'DEV-LEC-0001' } },
  },
  {
    email: 'student@selvia.local',
    firstName: 'Dev',
    lastName: 'Student',
    role: 'STUDENT',
    student: { create: { studentNumber: 'DEV-STU-0001' } },
  },
]

async function main() {
  if (env.isProduction) {
    throw new Error('Refusing to seed development data in production.')
  }

  for (const user of devUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    })
    console.log(`Seeded ${user.role.toLowerCase()}: ${user.email}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
