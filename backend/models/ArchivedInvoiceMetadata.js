import mongoose from 'mongoose'

const archivedInvoiceMetadataSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    archiveId: {
      type: String,
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
      index: true,
    },
    catalogues: [
      {
        type: String,
        trim: true,
        index: true,
      },
    ],
    patternNumbers: [
      {
        type: String,
        trim: true,
        index: true,
      },
    ],
    totalItems: {
      type: Number,
      required: true,
      min: 1,
    },
    totalQuantity: {
      type: Number,
      required: true,
      min: 1,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    finalTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    // Retain full snapshot in lightweight JSON representation for historical lookup without hitting active live tables
    fullSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

export const ArchivedInvoiceMetadata = mongoose.model(
  'ArchivedInvoiceMetadata',
  archivedInvoiceMetadataSchema
)
