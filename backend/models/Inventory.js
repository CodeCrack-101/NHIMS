import mongoose from 'mongoose'

const inventorySchema = new mongoose.Schema(
  {
    catalogueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Catalogue',
      required: true,
      index: true,
    },
    patternNumber: {
      type: String,
      required: true,
      trim: true,
    },
    sequenceNumber: {
      type: Number,
      default: 0,
      index: true,
    },
    imagePath: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    rate: {
      type: Number,
      required: true,
      default: 1250,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
)

// Unique compound index preventing duplicate pattern records within the same catalogue
inventorySchema.index({ catalogueId: 1, patternNumber: 1 }, { unique: true })

export const Inventory = mongoose.model('Inventory', inventorySchema)
