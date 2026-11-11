import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import authRoutes from './routes/auth.routes.js'
import catalogueRoutes from './routes/catalogue.routes.js'
import inventoryRoutes from './routes/inventory.routes.js'
import billingRoutes from './routes/billing.routes.js'
import reportsRoutes from './routes/reports.routes.js'
import customerRoutes from './routes/customer.routes.js'
import { generalApiRateLimiter } from './middleware/rateLimit.middleware.js'
import { errorHandler } from './middleware/error.middleware.js'
import { AppError } from './utils/AppError.js'

const app = express()

// Trust reverse proxy in production for accurate client IP rate-limiting
if (env.IS_PROD) {
  app.set('trust proxy', 1)
}

// Security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'", env.CLIENT_URL],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
)

// Strict CORS configuration restricted to the frontend origin
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Idempotency-Key'],
  })
)

app.use(cookieParser())
app.use(express.json({ limit: '16kb' }))
app.use(express.urlencoded({ extended: false, limit: '16kb' }))

// Recursive sanitizer to strip keys starting with '$' or containing '.' (NoSQL injection defense)
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key]
    } else if (typeof obj[key] === 'object') {
      sanitizeObject(obj[key])
    }
  }
}

app.use((req, _res, next) => {
  sanitizeObject(req.body)
  sanitizeObject(req.query)
  sanitizeObject(req.params)
  next()
})

app.use('/api', generalApiRateLimiter)

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    service: 'Enterprise CRM Authentication API',
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/catalogues', catalogueRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/customers', customerRoutes)

app.use((_req, _res, next) => {
  next(new AppError('Requested API endpoint does not exist.', 404, 'NOT_FOUND'))
})

app.use(errorHandler)

export default app
