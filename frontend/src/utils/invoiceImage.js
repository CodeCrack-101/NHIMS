import { formatCatalogueLabel } from '../services/catalogueService.js'

/**
 * Renders an invoice onto an HTML canvas (same layout as the downloaded PDF)
 * and returns it as a PNG Blob – used for sharing invoice images on WhatsApp.
 */

const S = 6 // pixels per millimetre
const PAGE_W = 105
const MIN_PAGE_H = 185
const MARGIN_X = 6
const FONT_FAMILY = 'Helvetica, Arial, sans-serif'

const formatCurrency = (val) => {
  const num = Number(val) || 0
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })

const createPainter = (ctx) => {
  const ptToPx = (size) => size * 0.3528 * S

  return {
    font(weight, size) {
      ctx.font = `${weight === 'bold' ? 700 : 400} ${ptToPx(size)}px ${FONT_FAMILY}`
    },
    color(rgb) {
      ctx.fillStyle = `rgb(${rgb.join(',')})`
    },
    text(str, x, y, align = 'left') {
      ctx.textAlign = align
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(String(str ?? ''), x * S, y * S)
    },
    wrapText(str, x, y, maxWidthMm, lineHeightMm) {
      const words = String(str || '').split(' ')
      let line = ''
      let cursorY = y
      ctx.textAlign = 'left'
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > maxWidthMm * S && line) {
          ctx.fillText(line, x * S, cursorY * S)
          line = word
          cursorY += lineHeightMm
        } else {
          line = test
        }
      }
      if (line) ctx.fillText(line, x * S, cursorY * S)
    },
    rect(x, y, w, h, fill, stroke) {
      if (fill) {
        ctx.fillStyle = `rgb(${fill.join(',')})`
        ctx.fillRect(x * S, y * S, w * S, h * S)
      }
      if (stroke) {
        ctx.strokeStyle = `rgb(${stroke.join(',')})`
        ctx.lineWidth = 0.25 * S
        ctx.strokeRect(x * S, y * S, w * S, h * S)
      }
    },
    line(x1, y1, x2, y2, rgb, widthMm = 0.25) {
      ctx.strokeStyle = `rgb(${rgb.join(',')})`
      ctx.lineWidth = widthMm * S
      ctx.beginPath()
      ctx.moveTo(x1 * S, y1 * S)
      ctx.lineTo(x2 * S, y2 * S)
      ctx.stroke()
    },
  }
}

export const generateInvoiceImageBlob = async (invoice) => {
  if (!invoice) throw new Error('Invoice is required')

  const items = invoice.items || []
  const rowHeight = 7
  const tableStartY = 45
  const itemsEndY = tableStartY + 6.5 + items.length * rowHeight
  // Single tall image: grow page if items exceed
  const pageH = Math.max(MIN_PAGE_H, itemsEndY + 4 + 30 + 26)

  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W * S
  canvas.height = pageH * S
  const ctx = canvas.getContext('2d')
  const p = createPainter(ctx)
  const right = PAGE_W - MARGIN_X

  // White page background
  p.rect(0, 0, PAGE_W, pageH, [255, 255, 255])

  // ---------- Header Banner (25mm high) ----------
  p.rect(0, 0, PAGE_W, 25, [15, 23, 42])

  const logo = await loadImage('/Logo.png')
  if (logo) {
    ctx.drawImage(logo, MARGIN_X * S, 3.5 * S, 14 * S, 14 * S)
  }

  const titleX = logo ? MARGIN_X + 16 : MARGIN_X
  p.color([255, 255, 255])
  p.font('bold', 11)
  p.text('NH Wallpaper', titleX, 7.5)

  p.font('normal', 6.5)
  p.text('Wallpaper Wholesaler', titleX, 11)

  p.font('normal', 5.5)
  p.color([226, 232, 240])
  p.text('Mob: +91 8828251111, +91 9930317192', titleX, 14.5)
  p.wrapText(
    'Rani Residency, Shop No 02, Opp Apha Park Near Taj Darbar, Chirag Nagar, Ghatkopar (W), Mumbai 400086',
    titleX,
    18,
    44,
    2.5
  )

  p.color([255, 255, 255])
  p.font('bold', 6)
  p.text('GSTIN: 27DXLPR9950M1ZB', right, 7, 'right')
  p.font('bold', 6.5)
  p.text(`Invoice: ${invoice.invoiceNumber}`, right, 11, 'right')

  const invDate = new Date(invoice.invoiceDate || invoice.createdAt)
  const dateFormatted = invDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timeFormatted = invDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  p.font('normal', 5.8)
  p.color([203, 213, 225])
  p.text(`Date: ${dateFormatted}`, right, 15, 'right')
  p.text(`Time: ${timeFormatted}`, right, 18.5, 'right')

  // ---------- Customer Box (15.5mm high) ----------
  let y = 27.5
  p.rect(MARGIN_X, y, PAGE_W - MARGIN_X * 2, 15.5, [248, 250, 252], [203, 213, 225])

  p.color([100, 116, 139])
  p.font('bold', 6)
  p.text('Bill To Customer', MARGIN_X + 3, y + 4)
  p.text('Invoice Summary', right - 42, y + 4)

  p.color([15, 23, 42])
  p.font('bold', 7.5)
  p.text(`Name: ${invoice.customerName}`, MARGIN_X + 3, y + 8.5)

  p.font('normal', 6.5)
  p.text(`Mobile: +91 ${invoice.mobileNumber}`, MARGIN_X + 3, y + 12.5)
  p.text(
    `Items: ${invoice.totalItems} | Qty: ${invoice.totalQuantity} Rolls`,
    right - 42,
    y + 8.5
  )
  p.text(
    `Billed By: ${invoice.createdBy?.fullName || invoice.createdBy?.email || 'Admin'}`,
    right - 42,
    y + 12.5
  )

  // ---------- Items Table ----------
  y = tableStartY
  p.rect(MARGIN_X, y, PAGE_W - MARGIN_X * 2, 6.5, [241, 245, 249], [203, 213, 225])
  p.color([15, 23, 42])
  p.font('bold', 6.5)
  p.text('Sr', MARGIN_X + 2, y + 4.5)
  p.text('Catalogue', MARGIN_X + 9, y + 4.5)
  p.text('Pattern No.', MARGIN_X + 41, y + 4.5)
  p.text('Qty', MARGIN_X + 59, y + 4.5)
  p.text('Rate', MARGIN_X + 71, y + 4.5)
  p.text('Amount', right - 2, y + 4.5, 'right')
  y += 6.5

  items.forEach((item, idx) => {
    p.line(MARGIN_X, y + rowHeight, right, y + rowHeight, [226, 232, 240])

    p.color([71, 85, 105])
    p.font('normal', 6.5)
    p.text(String(idx + 1), MARGIN_X + 2, y + 4.8)

    p.color([15, 23, 42])
    p.font('bold', 6.5)
    const catLabel = formatCatalogueLabel(item.catalogueName || item.catalogueSlug)
    p.text(catLabel.length > 18 ? catLabel.substring(0, 17) + '…' : catLabel, MARGIN_X + 9, y + 4.8)
    p.text(String(item.patternNumber), MARGIN_X + 41, y + 4.8)

    p.font('normal', 6.5)
    p.text(`${item.quantity} Rolls`, MARGIN_X + 59, y + 4.8)
    p.text(formatCurrency(item.rate), MARGIN_X + 71, y + 4.8)

    p.font('bold', 6.5)
    p.text(formatCurrency(item.subtotal), right - 2, y + 4.8, 'right')

    y += rowHeight
  })

  // ---------- Totals Summary ----------
  y += 4
  const summaryW = 46
  const summaryX = right - summaryW
  const hasGst = Boolean(invoice.taxRate && invoice.taxRate > 0)
  const summaryH = hasGst ? 27 : 23
  p.rect(summaryX, y, summaryW, summaryH, [248, 250, 252], [203, 213, 225])

  p.font('normal', 6.5)
  p.color([71, 85, 105])
  p.text('Subtotal:', summaryX + 2.5, y + 5)
  p.font('bold', 6.5)
  p.color([15, 23, 42])
  p.text(formatCurrency(invoice.subtotal), right - 2.5, y + 5, 'right')

  const discountLabel =
    invoice.discountType === 'PERCENTAGE' && invoice.discountValue > 0
      ? `Discount (${invoice.discountValue}%):`
      : 'Discount:'
  p.font('normal', 6.5)
  p.color([71, 85, 105])
  p.text(discountLabel, summaryX + 2.5, y + 9.5)
  p.font('bold', 6.5)
  p.color([185, 28, 28])
  p.text(`- ${formatCurrency(invoice.discountAmount || 0)}`, right - 2.5, y + 9.5, 'right')

  let finalY = y + 15
  if (hasGst) {
    p.font('normal', 6.5)
    p.color([71, 85, 105])
    p.text(`GST (${invoice.taxRate}%):`, summaryX + 2.5, y + 14)
    p.font('bold', 6.5)
    p.color([15, 23, 42])
    p.text(`+ ${formatCurrency(invoice.taxAmount || 0)}`, right - 2.5, y + 14, 'right')
    finalY = y + 19.5
  }

  p.line(summaryX + 2, finalY - 2, right - 2, finalY - 2, [203, 213, 225])
  p.font('bold', 7.5)
  p.color([15, 23, 42])
  p.text('Final Total:', summaryX + 2.5, finalY + 3)
  p.text(formatCurrency(invoice.finalTotal), right - 2.5, finalY + 3, 'right')

  // ---------- Signature ----------
  const sigY = y + summaryH + 2
  p.font('bold', 7)
  p.color([15, 23, 42])
  p.text('For NH Wallpaper', right - 3, sigY + 3.5, 'right')
  p.font('normal', 5.5)
  p.color([100, 116, 139])
  p.text('Authorised Signatory', right - 3, sigY + 11, 'right')

  // ---------- Terms & Conditions (bottom) ----------
  const termsY = pageH - 23
  p.line(MARGIN_X, termsY - 3, right, termsY - 3, [226, 232, 240], 0.3)

  p.font('bold', 6)
  p.color([15, 23, 42])
  p.text('Terms & Conditions :', MARGIN_X, termsY)

  p.font('normal', 5.2)
  p.color([71, 85, 105])
  p.text('•  Subject to Mumbai Jurisdiction.', MARGIN_X, termsY + 3.8)
  p.text('•  No complaint will be entertained after acceptance of the delivery.', MARGIN_X, termsY + 7.2)
  p.text('•  Goods once sold will not be taken back or exchanged.', MARGIN_X, termsY + 10.6)
  p.text('•  Our responsibility ceases after delivery of goods to the carriers.', MARGIN_X, termsY + 14)

  p.font('normal', 5.5)
  p.color([148, 163, 184])
  p.text('Thank you for your business! — NH Wallpaper', right, termsY + 14, 'right')

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to render invoice image'))),
      'image/png'
    )
  })
}
