import mongoose from 'mongoose'

const inventoryLogSchema = new mongoose.Schema(
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
    previousQuantity: {
      type: Number,
      required: true,
    },
    newQuantity: {
      type: Number,
      required: true,
    },
    changeAmount: {
      type: Number,
      required: true,
    },
    actionType: {
      type: String,
      enum: ['INCREASE', 'DECREASE'],
      required: true,
    },
    invoiceNumber: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ['MANUAL', 'BILLING_DEDUCTION'],
      default: 'MANUAL',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

export const InventoryLog = mongoose.model('InventoryLog', inventoryLogSchema)
