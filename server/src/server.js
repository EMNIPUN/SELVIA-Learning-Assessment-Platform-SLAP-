import env from './config/env.js'
import app from './app.js'

const server = app.listen(env.port, () => {
  console.log(`SELVIA API running in ${env.nodeEnv} mode on http://localhost:${env.port}`)
})

server.on('error', (err) => {
  console.error('Failed to start server:', err.message)
  process.exit(1)
})
