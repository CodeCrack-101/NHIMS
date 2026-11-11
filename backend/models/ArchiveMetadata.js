import mongoose from 'mongoose'

const archiveMetadataSchema = new mongoose.Schema(
  {
    archiveId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    quarterLabel: {
      type: String, // e.g. "2026-Q1" or "Custom (2026-01-01 to 2026-03-31)"
      required: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    invoiceCount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    totalSales: {
      type: Number,
      required: true,
      min: 0,
    },
    totalDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },
    catalogueSummary: [
      {
        catalogueName: String,
        rollsCount: Number,
        revenue: Number,
      },
    ],
    // Verification & Integrity
    manifestChecksum: {
      type: String,
      required: true,
    },
    zipChecksum: {
      type: String,
      default: '',
    },
    filesIncluded: [
      {
        fileName: String,
        fileSize: Number,
        sha256: String,
      },
    ],
    // R2 storage pointers (if uploaded)
    r2Bucket: {
      type: String,
      default: '',
    },
    r2ObjectKey: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['EXPORTED', 'VERIFIED', 'CLEANED_ACTIVE', 'RESTORED'],
      default: 'EXPORTED',
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    cleanedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

export const ArchiveMetadata = mongoose.model(
  'ArchiveMetadata',
  archiveMetadataSchema
)
