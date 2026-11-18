import mongoose from 'mongoose'

const gstInvoiceItemSchema = new mongoose.Schema(
  {
    itemType: {
      type: String,
      enum: ['CATALOGUE', 'CUSTOM'],
      default: 'CUSTOM',
    },
    // When itemType is CATALOGUE
    catalogueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Catalogue',
      default: null,
    },
    catalogueName: {
      type: String,
      trim: true,
      default: '',
    },
    patternId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      default: null,
    },
    patternNumber: {
      type: String,
      trim: true,
      default: '',
    },
    // Display item name (e.g. "UV marble roll 4x10" or "Royal Texture - 7015")
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    hsnCode: {
      type: String,
      trim: true,
      default: '39219099', // Standard wallpaper / PVC sheet HSN
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },
    unit: {
      type: String,
      enum: ['Rol', 'Pcs', 'Box', 'Meter', 'Sq.Ft', 'Bundle', 'Kg'],
      default: 'Rol',
      trim: true,
    },
    pricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },
    gstRate: {
      type: Number,
      default: 18, // 18%, 12%, 5%, 28%, 0%
      min: 0,
    },
    // Calculated per item
    taxableAmount: {
      type: Number,
      default: 0,
    },
    gstAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
)

const gstInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    // Place of supply: e.g. "33-Tamil Nadu" or "27-Maharashtra"
    placeOfSupply: {
      type: String,
      required: true,
      trim: true,
      default: '27-Maharashtra',
    },
    supplyStateCode: {
      type: String,
      trim: true,
      default: '27',
    },
    supplyStateName: {
      type: String,
      trim: true,
      default: 'Maharashtra',
    },

    // Bill To details
    billTo: {
      firmName: {
        type: String,
        required: true,
        trim: true,
      },
      address: {
        type: String,
        trim: true,
        default: '',
      },
      city: {
        type: String,
        trim: true,
        default: '',
      },
      state: {
        type: String,
        trim: true,
        default: '',
      },
      stateCode: {
        type: String,
        trim: true,
        default: '',
      },
      pincode: {
        type: String,
        trim: true,
        default: '',
      },
      contactNumber: {
        type: String,
        required: true,
        trim: true,
      },
      gstin: {
        type: String,
        trim: true,
        uppercase: true,
        default: '',
      },
    },

    // Ship To details (Can be same as Bill To)
    shipTo: {
      firmName: {
        type: String,
        trim: true,
        default: '',
      },
      address: {
        type: String,
        trim: true,
        default: '',
      },
      city: {
        type: String,
        trim: true,
        default: '',
      },
      state: {
        type: String,
        trim: true,
        default: '',
      },
      stateCode: {
        type: String,
        trim: true,
        default: '',
      },
      pincode: {
        type: String,
        trim: true,
        default: '',
      },
      contactNumber: {
        type: String,
        trim: true,
        default: '',
      },
      gstin: {
        type: String,
        trim: true,
        uppercase: true,
        default: '',
      },
    },

    items: {
      type: [gstInvoiceItemSchema],
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
      min: 0,
    },

    // Financial totals
    subTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    // Intra-state (CGST + SGST) vs Inter-state (IGST)
    isInterState: {
      type: Boolean,
      default: false,
    },
    cgstAmount: {
      type: Number,
      default: 0,
    },
    sgstAmount: {
      type: Number,
      default: 0,
    },
    igstAmount: {
      type: Number,
      default: 0,
    },
    totalTax: {
      type: Number,
      default: 0,
    },
    finalTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    finalTotalInWords: {
      type: String,
      trim: true,
      default: '',
    },

    // Payment details
    receivedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'UNPAID', 'PARTIAL'],
      default: 'PAID',
      index: true,
    },
    paymentMode: {
      type: String,
      enum: ['Gpay', 'Cash', 'Bank Transfer (NEFT/RTGS)', 'Cheque', 'PhonePe', 'Paytm', 'UPI'],
      default: 'Gpay',
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
    },

    billerName: {
      type: String,
      trim: true,
      default: 'Shifa',
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

export const GstInvoice = mongoose.model('GstInvoice', gstInvoiceSchema)
