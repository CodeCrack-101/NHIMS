import { v2 as cloudinary } from 'cloudinary'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
  secure: true,
})

// Generate an optimized delivery URL (WebP/AVIF auto-format + auto-quality for free tier efficiency)
export const getOptimizedCloudinaryUrl = (publicId, width = 800) => {
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [
      {
        fetch_format: 'auto',
        quality: 'auto',
        width,
        crop: 'limit',
      },
    ],
  })
}

export default cloudinary
