import mongoose from 'mongoose'

const invoiceItemSchema = new mongoose.Schema(
  {
    catalogueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Catalogue',
      required: true,
    },
    catalogueName: {
      type: String,
      required: true,
      trim: true,
    },
    catalogueSlug: {
      type: String,
      trim: true,
      default: '',
    },
    patternId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
    },
    patternNumber: {
      type: String,
      required: true,
      trim: true,
    },
    imagePath: {
      type: String,
      default: '',
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
)

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
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
      default: Date.now,
      index: true,
    },
    items: {
      type: [invoiceItemSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one billing item is required.',
      },
    },
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
    discountType: {
      type: String,
      enum: ['PERCENTAGE', 'FIXED'],
      default: 'PERCENTAGE',
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxRate: {
      type: Number,
      default: 0, // e.g. 18 for 18% GST, default 0
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    finalTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

export const Invoice = mongoose.model('Invoice', invoiceSchema)
