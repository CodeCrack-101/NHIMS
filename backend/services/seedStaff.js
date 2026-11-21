import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { User, ROLES } from '../models/User.js'
import { hashPassword } from './crypto.service.js'

export const seedStaffUsers = async () => {
  const staffMembers = [
    { fullName: 'Shifa', email: 'nhshifa@gmail.com', pass: 'shifa@8879' },
    { fullName: 'Pooja', email: 'nhpooja@gmail.com', pass: 'pooja@8879' },
    { fullName: 'Sabira', email: 'nhsabira@gmail.com', pass: 'sabira@8879' },
    { fullName: 'Sapna', email: 'nhsapna@gmail.com', pass: 'pooja@8879' },
  ]

  for (const s of staffMembers) {
    const existing = await User.findOne({ email: s.email })
    const passwordHash = await hashPassword(s.pass)
    if (!existing) {
      await User.create({
        fullName: s.fullName,
        email: s.email,
        passwordHash,
        role: ROLES.EMPLOYEE,
        status: 'active',
        emailVerified: true,
      })
      console.log(`[Seed] Created staff user: ${s.email}`)
    } else {
      existing.fullName = s.fullName
      existing.passwordHash = passwordHash
      existing.role = ROLES.EMPLOYEE
      existing.status = 'active'
      existing.emailVerified = true
      await existing.save()
      console.log(`[Seed] Updated staff user: ${s.email}`)
    }
  }
}
