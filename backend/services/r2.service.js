import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../config/env.js'

let r2Client = null

export const getR2Client = () => {
  if (r2Client) return r2Client

  const endpoint =
    process.env.CLOUDFLARE_R2_ENDPOINT ||
    (process.env.CLOUDFLARE_R2_ACCOUNT_ID
      ? `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : null)

  const accessKeyId =
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
    process.env.R2_ACCESS_KEY_ID ||
    process.env.CLOUDFLARE_R2_TOKEN

  const secretAccessKey =
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
    process.env.R2_SECRET_ACCESS_KEY

  if (!endpoint || !accessKeyId) {
    return null
  }

  r2Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  return r2Client
}

export const uploadToR2 = async ({ key, body, contentType }) => {
  const client = getR2Client()
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'nh-billing-archives'

  if (!client) {
    return {
      uploaded: false,
      reason: 'R2 client credentials not configured. Local archive generated successfully.',
      key,
    }
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  })

  await client.send(command)
  return {
    uploaded: true,
    bucket: bucketName,
    key,
  }
}

export const getR2PresignedDownloadUrl = async (key, expiresInSeconds = 3600) => {
  const client = getR2Client()
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'nh-billing-archives'

  if (!client) {
    return null
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  })

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}
