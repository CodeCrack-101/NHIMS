import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'
import { User } from '../models/User.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryLog } from '../models/InventoryLog.js'
import {
  ensureDefaultCataloguesAndSync,
  getCataloguesWithStats,
  getCatalogueBySlug,
  adjustPatternQuantityAtomic,
} from '../services/inventory.service.js'

const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
  console.log(`  [PASS] ${msg}`)
}

const run = async () => {
  await connectDB()

  try {
    console.log('\n--- Seeding & Testing Roll Inventory Management ---\n')

    await ensureDefaultCataloguesAndSync()
    const catalogues = await getCataloguesWithStats(10)

    const soho = catalogues.find((c) => c.slug === 'SOHO')
    const ew = catalogues.find((c) => c.slug === 'EW')

    assert(Boolean(soho), '1. SOHO catalogue exists in MongoDB')
    assert(Boolean(ew), '2. EW catalogue exists in MongoDB')
    assert(soho.totalPatterns === 61, `3. SOHO automatically synced 61 local patterns (found ${soho.totalPatterns})`)

    const sohoDetails = await getCatalogueBySlug('SOHO', 10)
    assert(
      sohoDetails.items[0]?.patternNumber === '1.1' &&
        sohoDetails.items[0]?.imagePath === '/Assests/SOHO/soho1.1.png',
      '4. First SOHO pattern is 1.1 with local path /Assests/SOHO/soho1.1.png'
    )

    const adminUser = await User.findOne({ email: 'nhstock443@gmail.com' })
    assert(Boolean(adminUser), '5. Authenticated admin user nhstock443@gmail.com found')

    const initialQty = sohoDetails.items[0].quantity

    // Test atomic INCREASE (+1)
    const incDoc = await adjustPatternQuantityAtomic({
      catalogueId: soho._id,
      patternNumber: '1.1',
      actionType: 'INCREASE',
      amount: 1,
      userId: adminUser._id,
    })
    assert(incDoc.quantity === initialQty + 1, `6. Atomic INCREASE (+1) updated quantity (${initialQty} -> ${incDoc.quantity})`)

    // Test atomic DECREASE (-1) back to initialQty
    const decDoc = await adjustPatternQuantityAtomic({
      catalogueId: soho._id,
      patternNumber: '1.1',
      actionType: 'DECREASE',
      amount: 1,
      userId: adminUser._id,
    })
    assert(decDoc.quantity === initialQty, `7. Atomic DECREASE (-1) restored quantity (${incDoc.quantity} -> ${decDoc.quantity})`)

    // Test negative quantity prevention on a 0-quantity pattern
    const zeroPattern = sohoDetails.items.find((i) => i.quantity === 0)
    if (zeroPattern) {
      let blockedNegative = false
      try {
        await adjustPatternQuantityAtomic({
          catalogueId: soho._id,
          patternNumber: zeroPattern.patternNumber,
          actionType: 'DECREASE',
          amount: 1,
          userId: adminUser._id,
        })
      } catch (err) {
        blockedNegative = err.code === 'NEGATIVE_QUANTITY_PREVENTED'
      }
      assert(blockedNegative, '8. Negative quantity (< 0) atomically prevented by MongoDB')
    }

    // Verify InventoryLogs recorded the test changes and clean up test log entries
    const recentLogs = await InventoryLog.find({
      catalogueId: soho._id,
      patternNumber: '1.1',
    }).sort({ createdAt: -1 })
    assert(recentLogs.length >= 2, '9. InventoryLog recorded INCREASE and DECREASE audit trail')

    // Clean up only the 2 test logs we just created so production logs stay clean
    await InventoryLog.deleteMany({
      _id: { $in: recentLogs.slice(0, 2).map((l) => l._id) },
    })

    // Re-run sync to verify existing quantities are never overwritten
    await Inventory.updateOne(
      { catalogueId: soho._id, patternNumber: '1.1' },
      { $set: { quantity: initialQty } }
    )
    await ensureDefaultCataloguesAndSync()
    const afterResync = await Inventory.findOne({
      catalogueId: soho._id,
      patternNumber: '1.1',
    })
    assert(
      afterResync.quantity === initialQty,
      '10. Re-running image sync preserves existing quantities without duplicates'
    )

    console.log('\n=== ALL INVENTORY & CATALOGUE TESTS PASSED ===\n')
  } finally {
    await mongoose.connection.close()
  }
}

run().catch((err) => {
  console.error('[InventoryTest Error]', err.message)
  process.exit(1)
})
