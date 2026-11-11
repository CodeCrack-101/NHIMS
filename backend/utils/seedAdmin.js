import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'
import { User, ROLES } from '../models/User.js'
import { AuthenticationChallenge } from '../models/AuthenticationChallenge.js'
import { Session } from '../models/Session.js'
import { hashPassword } from '../services/crypto.service.js'

const seedUsers = async () => {
  await connectDB()

  const adminEmail = (process.env.ADMIN_SEED_EMAIL || 'nhstock443@gmail.com')
    .trim()
    .toLowerCase()
  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'Nhstock@8879'

  // Remove any other users so only nhstock443@gmail.com can log in
  await User.deleteMany({ email: { $ne: adminEmail } })
  await AuthenticationChallenge.deleteMany({})
  await Session.deleteMany({})

  const passwordHash = await hashPassword(adminPassword)
  const existing = await User.findOne({ email: adminEmail })

  if (existing) {
    existing.fullName = 'NH Stock Administrator'
    existing.passwordHash = passwordHash
    existing.role = ROLES.ADMIN
    existing.status = 'active'
    existing.emailVerified = true
    existing.failedLoginAttempts = 0
    existing.lockUntil = null
    await existing.save()
    console.log(`[Seed] Updated admin user: ${adminEmail}`)
  } else {
    await User.create({
      fullName: 'NH Stock Administrator',
      email: adminEmail,
      passwordHash,
      role: ROLES.ADMIN,
      status: 'active',
      emailVerified: true,
    })
    console.log(`[Seed] Created admin user: ${adminEmail}`)
  }

  await mongoose.connection.close()
  console.log('[Seed] Database seeding complete. Only nhstock443@gmail.com is active.')
}

seedUsers().catch((err) => {
  console.error('[Seed] Error seeding users:', err.message)
  process.exit(1)
})
