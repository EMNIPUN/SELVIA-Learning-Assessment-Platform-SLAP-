import { defineConfig } from 'prisma/config'
import './src/config/env.js'

// Opening a connection to the hosted database can take several seconds on slow links,
// longer than the CLI's 5-second default. A connect_timeout already in the URL is kept.
function withConnectTimeout(url, seconds = 30) {
  if (!url) return url
  const parsed = new URL(url)
  if (!parsed.searchParams.has('connect_timeout')) {
    parsed.searchParams.set('connect_timeout', String(seconds))
  }
  return parsed.toString()
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    // The CLI needs a session-mode (direct) connection; migrations fail through a transaction-mode pooler.
    // process.env instead of env() so `prisma validate` and `prisma generate` work without a database.
    url: withConnectTimeout(process.env.DIRECT_URL ?? process.env.DATABASE_URL),
  },
})
