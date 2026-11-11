import app from './app.js'
import { env } from './config/env.js'
import { connectDB } from './config/db.js'

const startServer = async () => {
  await connectDB()

  const server = app.listen(env.PORT, () => {
    console.log(`[Server] Enterprise CRM Auth API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`)
  })

  const shutdown = (signal) => {
    console.log(`[Server] Received ${signal}. Closing HTTP server...`)
    server.close(() => {
      process.exit(0)
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

startServer()
