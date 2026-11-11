import { formatCatalogueLabel } from '../services/catalogueService.js'
import { generateInvoiceImageBlob } from './invoiceImage.js'

const buildWhatsAppUrl = (mobileNumber, text) => {
  const cleanPhone = String(mobileNumber || '').replace(/\D/g, '').slice(-10)
  const encoded = encodeURIComponent(text)
  return cleanPhone.length === 10
    ? `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`
}

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Sends the invoice as an IMAGE (PNG, same design as the PDF) to WhatsApp.
 *
 * - Mobile / supported browsers: opens the native share sheet with the image
 *   attached -> choose WhatsApp -> image goes straight to the chat.
 * - Desktop fallback: copies the image to clipboard + downloads it, then opens
 *   the customer's WhatsApp chat so you can simply press Ctrl+V and send.
 *
 * Returns: 'shared' | 'copied' | 'downloaded' | 'cancelled'
 */
export const sendInvoiceImageToWhatsApp = async (invoice) => {
  if (!invoice) return 'cancelled'

  const blob = await generateInvoiceImageBlob(invoice)
  const fileName = `${invoice.invoiceNumber}.png`
  const file = new File([blob], fileName, { type: 'image/png' })
  const caption = `NH Wallpaper – Invoice ${invoice.invoiceNumber}\nCustomer: ${invoice.customerName}\nFinal Amount: ${formatINR(invoice.finalTotal)}\nThank you for your business!`

  // 1. Native share sheet with image file (Android, iOS, Windows/Chrome, etc.)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Invoice ${invoice.invoiceNumber}`,
        text: caption,
      })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // otherwise continue to fallback
    }
  }

  // 2. Desktop fallback: copy image to clipboard + download + open chat
  let copied = false
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
      copied = true
    }
  } catch {
    copied = false
  }

  downloadBlob(blob, fileName)
  window.open(buildWhatsAppUrl(invoice.mobileNumber, caption), '_blank', 'noopener,noreferrer')

  return copied ? 'copied' : 'downloaded'
}

/**
 * Format currency in Indian Rupees format
 */
const formatINR = (val) => {
  const n = Number(val) || 0
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Generates formatted text message and opens WhatsApp Web/App
 */
export const sendInvoiceToWhatsApp = (invoice) => {
  if (!invoice) return

  const cleanPhone = String(invoice.mobileNumber || '').replace(/\D/g, '').slice(-10)
  const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : ''

  const dateStr = new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  // Format line items
  const itemsText = (invoice.items || [])
    .map((item, idx) => {
      const cat = formatCatalogueLabel(item.catalogueName || item.catalogueSlug)
      return `${idx + 1}. *${cat}* | Pattern: *#${item.patternNumber}*\n   Qty: ${item.quantity} Rolls × ₹${item.rate} = *₹${item.subtotal}*`
    })
    .join('\n\n')

  const discountLine =
    invoice.discountAmount > 0
      ? `\n*Discount:* - ₹${Number(invoice.discountAmount).toFixed(2)}`
      : ''

  const taxLine =
    invoice.taxAmount > 0
      ? `\n*GST (${invoice.taxRate}%):* + ₹${Number(invoice.taxAmount).toFixed(2)}`
      : ''

  const message = `*NH WALLPAPER – INVOICE* 🧾
----------------------------------------
*Invoice No:* ${invoice.invoiceNumber}
*Date:* ${dateStr}
*Customer:* ${invoice.customerName}
*Mobile:* +91 ${invoice.mobileNumber}
----------------------------------------
*ITEMS ORDERED:*

${itemsText}
----------------------------------------
*Total Rolls:* ${invoice.totalQuantity} Rolls
*Subtotal:* ${formatINR(invoice.subtotal)}${discountLine}${taxLine}
*FINAL AMOUNT:* *${formatINR(invoice.finalTotal)}*
----------------------------------------
📍 *NH Wallpaper*
Rani Residency, Shop No 02, Opp Apha Park Building Near Taj Darbar Hotel, Chirag Nagar, Ghatkopar (W), Mumbai 400086
📞 Mob: +91 8828251111 / +91 9930317192

_Thank you for your business!_`

  const encoded = encodeURIComponent(message)
  const whatsappUrl = phoneParam
    ? `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`

  window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
}
