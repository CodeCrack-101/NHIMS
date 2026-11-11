import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import cloudinary, { getOptimizedCloudinaryUrl } from '../config/cloudinary.js'
import { connectDB } from '../config/db.js'
import { Catalogue } from '../models/Catalogue.js'
import { Inventory } from '../models/Inventory.js'
import { parseAssetFilename } from '../services/inventory.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FRONTEND_PUBLIC_DIR = path.resolve(__dirname, '../../frontend/public')
const MANIFEST_FILE_PATH = path.resolve(
  __dirname,
  '../../frontend/src/assets/imageManifest.js'
)

const findCatalogueFolders = () => {
  const roots = [
    path.join(FRONTEND_PUBLIC_DIR, 'Assests'),
    path.join(FRONTEND_PUBLIC_DIR, 'assets'),
  ]
  const folderMap = new Map()

  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const rawUpper = entry.name.trim().toUpperCase()
        const isEpicWall =
          rawUpper === 'EPIC WALL' ||
          rawUpper === 'EPIC_WALL' ||
          rawUpper === 'EW'
        const displayName = isEpicWall ? 'EPIC WALL' : rawUpper
        const slug = isEpicWall ? 'EW' : displayName.replace(/\s+/g, '_')
        if (!folderMap.has(slug)) {
          folderMap.set(slug, {
            dirPath: path.join(root, entry.name),
            displayName,
          })
        }
      }
    }
  }
  return folderMap
}

const readExistingManifest = () => {
  try {
    if (!fs.existsSync(MANIFEST_FILE_PATH)) return {}
    const content = fs.readFileSync(MANIFEST_FILE_PATH, 'utf8')
    const match = content.match(
      /export\s+const\s+IMAGE_MANIFEST\s*=\s*(\{[\s\S]*?\n\})/
    )
    if (!match) return {}
    return JSON.parse(match[1])
  } catch {
    return {}
  }
}

const uploadAllFolderWise = async () => {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error('[Cloudinary] Missing Cloudinary credentials in backend/.env.')
    process.exit(1)
  }

  await connectDB()

  try {
    const folderMap = findCatalogueFolders()
    const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])
    const existingManifest = readExistingManifest()
    const updatedManifest = {
      SOHO: existingManifest.SOHO || [],
      SELFIE_POINT: existingManifest.SELFIE_POINT || [],
      EW: existingManifest.EW || [],
      ROYAL_TEXTURE: existingManifest.ROYAL_TEXTURE || [],
      ICONIC: existingManifest.ICONIC || [],
      ...existingManifest,
    }

    // Clean up any legacy space-separated or duplicate slugs
    await Catalogue.deleteMany({
      slug: {
        $in: ['SELFIE POINT', 'EPIC WALL', 'EPIC_WALL', 'ROYAL TEXTURE'],
      },
    })

    let totalOriginalBytes = 0
    let totalCompressedBytes = 0

    for (const [slug, { dirPath, displayName }] of folderMap.entries()) {
      let catalogue = await Catalogue.findOne({ slug })
      if (!catalogue) {
        catalogue = await Catalogue.create({
          name: displayName,
          slug,
          description: `${displayName} Roll Collection`,
          isActive: true,
        })
      } else if (catalogue.name !== displayName) {
        catalogue.name = displayName
        await catalogue.save()
      }

      const existingManifestItems = Array.isArray(existingManifest[slug])
        ? existingManifest[slug]
        : []

      const alreadyHasCloudinaryManifest =
        existingManifestItems.length > 0 &&
        existingManifestItems.every((item) =>
          item.imagePath?.includes('res.cloudinary.com')
        )

      if (alreadyHasCloudinaryManifest && process.env.FORCE_REUPLOAD !== '1') {
        console.log(
          `\n[Cloudinary] '${displayName}' (${slug}) already has ${existingManifestItems.length} customized Cloudinary WebP patterns in imageManifest.js. Preserving untouched.`
        )
        updatedManifest[slug] = existingManifestItems
        continue
      }

      const rawFiles = fs
        .readdirSync(dirPath)
        .filter((f) => allowedExts.has(path.extname(f).toLowerCase()))

      // Parse and sort files in strict sequence
      const parsedFiles = rawFiles
        .map((file) => {
          const { patternNumber, sequenceNumber } = parseAssetFilename(
            file,
            slug
          )
          return {
            file,
            fullPath: path.join(dirPath, file),
            patternNumber,
            sequenceNumber,
          }
        })
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber)

      // Check existing records in MongoDB to preserve quantities and skip if already compressed
      const existingDocs = await Inventory.find({
        catalogueId: catalogue._id,
      })
        .sort({ sequenceNumber: 1 })
        .lean()

      const allAlreadyOnCloudinary =
        existingDocs.length === parsedFiles.length &&
        existingDocs.every(
          (doc, idx) =>
            doc.patternNumber === parsedFiles[idx]?.patternNumber &&
            doc.imagePath?.includes('res.cloudinary.com')
        )

      if (allAlreadyOnCloudinary && process.env.FORCE_REUPLOAD !== '1') {
        console.log(
          `\n[Cloudinary] '${displayName}' (${slug}) already has all ${existingDocs.length} compressed WebP images synced. Skipping re-upload.`
        )
        updatedManifest[slug] = existingDocs.map((doc) => ({
          sequenceNumber: doc.sequenceNumber,
          patternNumber: doc.patternNumber,
          imagePath: doc.imagePath,
        }))
        continue
      }

      const seqQuantityMap = new Map()
      for (const doc of existingDocs) {
        if (doc.sequenceNumber && doc.quantity > 0) {
          seqQuantityMap.set(doc.sequenceNumber, doc.quantity)
        }
      }

      // Clear old pattern records for this catalogue so only the new sequence remains
      await Inventory.deleteMany({ catalogueId: catalogue._id })

      console.log(
        `\n[Cloudinary] Compressing & uploading ${parsedFiles.length} images for '${displayName}' (${slug}) (${parsedFiles[0]?.patternNumber} -> ${parsedFiles[parsedFiles.length - 1]?.patternNumber})...`
      )

      const items = []
      const BATCH_SIZE = 8

      for (let i = 0; i < parsedFiles.length; i += BATCH_SIZE) {
        const batch = parsedFiles.slice(i, i + BATCH_SIZE)

        const batchResults = await Promise.all(
          batch.map(async ({ fullPath, patternNumber, sequenceNumber }) => {
            const origSize = fs.statSync(fullPath).size
            totalOriginalBytes += origSize

            const safePublicId = `pattern_${patternNumber.replace(
              /[^a-zA-Z0-9_-]/g,
              '_'
            )}`

            // Incoming compression: resize max 800x800 + convert stored master file to compressed WebP (auto:eco)
            const result = await cloudinary.uploader.upload(fullPath, {
              folder: `NH_CRM/${slug}`,
              public_id: safePublicId,
              overwrite: true,
              invalidate: true,
              resource_type: 'image',
              format: 'webp',
              transformation: [
                {
                  width: 800,
                  height: 800,
                  crop: 'limit',
                  quality: 'auto:eco',
                },
              ],
            })

            totalCompressedBytes += result.bytes || 0

            const optimizedUrl = getOptimizedCloudinaryUrl(
              result.public_id,
              800
            )

            const preservedQty = seqQuantityMap.get(sequenceNumber) ?? 0

            await Inventory.findOneAndUpdate(
              { catalogueId: catalogue._id, patternNumber },
              {
                $set: {
                  imagePath: optimizedUrl,
                  sequenceNumber,
                  quantity: preservedQty,
                },
              },
              { upsert: true, new: true }
            )

            const origKB = Math.round(origSize / 1024)
            const compKB = Math.round((result.bytes || 0) / 1024)
            console.log(
              `  ✓ [${slug}] Seq #${sequenceNumber} -> Pattern ${patternNumber} (${origKB} KB -> ${compKB} KB WebP)`
            )
            return {
              sequenceNumber,
              patternNumber,
              imagePath: optimizedUrl,
            }
          })
        )

        items.push(...batchResults)
      }

      items.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
      updatedManifest[slug] = items
    }

    const manifestSource = `// Auto-generated Cloudinary Optimized Image Manifest
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    \`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120" fill="none">
      <rect width="120" height="120" rx="10" fill="#F1F5F9"/>
      <rect x="28" y="32" width="64" height="56" rx="6" stroke="#94A3B8" stroke-width="2.5"/>
      <circle cx="46" cy="50" r="5" fill="#94A3B8"/>
      <path d="M34 78L52 60L64 72L74 62L86 78" stroke="#94A3B8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>\`
  )

export const IMAGE_MANIFEST = ${JSON.stringify(updatedManifest, null, 2)}

export const getManifestForCatalogue = (slug) => {
  const key = String(slug || '').toUpperCase()
  return IMAGE_MANIFEST[key] || []
}
`
    fs.writeFileSync(MANIFEST_FILE_PATH, manifestSource, 'utf8')
    const origMB = (totalOriginalBytes / (1024 * 1024)).toFixed(2)
    const compMB = (totalCompressedBytes / (1024 * 1024)).toFixed(2)
    const savedPct =
      totalOriginalBytes > 0
        ? Math.round((1 - totalCompressedBytes / totalOriginalBytes) * 100)
        : 0
    console.log(
      `\n[Cloudinary] SUCCESS: All catalogues compressed & uploaded (${origMB} MB -> ${compMB} MB, ${savedPct}% size reduction) & MongoDB + imageManifest.js updated!`
    )
  } finally {
    await mongoose.connection.close()
  }
}

uploadAllFolderWise().catch((err) => {
  console.error('[Cloudinary Upload Error]', err.message)
  process.exit(1)
})
