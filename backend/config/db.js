import dns from 'dns'
import mongoose from 'mongoose'
import { env } from './env.js'

// Fix Windows ISP/router SRV DNS lookup refusal (querySrv ECONNREFUSED) for mongodb+srv:// URIs
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4'])
} catch {
  // Ignore if system restricts custom DNS servers
}

export const connectDB = async () => {
  try {
    // Enable strict query mode against unknown query fields
    mongoose.set('strictQuery', true)

    const conn = await mongoose.connect(env.MONGO_URI, {
      dbName: 'enterprise_crm',
      autoIndex: true,
      serverSelectionTimeoutMS: 15000,
    })

    console.log(`[MongoDB] Connected to host: ${conn.connection.host}`)
  } catch (error) {
    console.error('[MongoDB] Connection error:', error.message)
    process.exit(1)
  }
}
