import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import env from '../../config/env.js'

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env and configure it.')
}

// Without a timeout, pg waits indefinitely when the database is unreachable.
const adapter = new PrismaPg({
  connectionString: env.databaseUrl,
  connectionTimeoutMillis: 10_000,
})

const prisma = new PrismaClient({ adapter })

// Prisma's 5-second default is too short for multi-statement deletes against the hosted database.
export const DELETE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 }

export async function checkDatabaseConnection() {
  await prisma.$queryRaw`SELECT 1`
}

export default prisma
