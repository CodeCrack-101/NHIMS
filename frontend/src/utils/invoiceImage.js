import { formatCatalogueLabel } from '../services/catalogueService.js'

/**
 * Renders an invoice onto an HTML canvas (same layout as the downloaded PDF)
 * and returns it as a PNG Blob – used for sharing invoice images on WhatsApp.
 */

const S = 6 // pixels per millimetre (A4 210mm -> 1260px wide, crisp on phones)
const PAGE_W = 210
const MIN_PAGE_H = 297
const MARGIN_X = 14
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
  const rowHeight = 10
  const tableStartY = 69
  const itemsEndY = tableStartY + 9 + items.length * rowHeight
  // Single tall image: grow the page if there are many items
  const pageH = Math.max(MIN_PAGE_H, itemsEndY + 8 + 70 + 40)

  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W * S
  canvas.height = pageH * S
  const ctx = canvas.getContext('2d')
  const p = createPainter(ctx)
  const right = PAGE_W - MARGIN_X

  // White page background
  p.rect(0, 0, PAGE_W, pageH, [255, 255, 255])

  // ---------- Header Banner ----------
  p.rect(0, 0, PAGE_W, 38, [15, 23, 42])

  const logo = await loadImage('/Logo.png')
  if (logo) {
    ctx.drawImage(logo, MARGIN_X * S, 6 * S, 22 * S, 22 * S)
  }

  const titleX = logo ? MARGIN_X + 26 : MARGIN_X
  p.color([255, 255, 255])
  p.font('bold', 16)
  p.text('NH Wallpaper', titleX, 11)

  p.font('normal', 8.5)
  p.text('Wallpaper Wholesaler', titleX, 16)

  p.font('normal', 7.5)
  p.color([226, 232, 240])
  p.text('Mob: +91 8828251111, +91 9930317192', titleX, 21)
  p.wrapText(
    'Rani Residency, Shop No 02, Opp Apha Park Building Near Taj Darbar Hotel, Chirag Nagar, Ghatkopar (W), Mumbai 400086',
    titleX,
    26,
    100,
    3.1
  )

  p.color([255, 255, 255])
  p.font('bold', 8)
  p.text('GSTIN: 27DXLPR9950M1ZB', right, 9, 'right')
  p.font('bold', 8.5)
  p.text(`Invoice: ${invoice.invoiceNumber}`, right, 14.5, 'right')

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
  p.font('normal', 8)
  p.color([203, 213, 225])
  p.text(`Date: ${dateFormatted}`, right, 20, 'right')
  p.text(`Time: ${timeFormatted}`, right, 25, 'right')

  // ---------- Customer Box ----------
  let y = 42
  p.rect(MARGIN_X, y, PAGE_W - MARGIN_X * 2, 22, [248, 250, 252], [203, 213, 225])

  p.color([100, 116, 139])
  p.font('bold', 8.5)
  p.text('Bill To Customer', MARGIN_X + 5, y + 6)
  p.text('Invoice Summary', right - 65, y + 6)

  p.color([15, 23, 42])
  p.font('bold', 11)
  p.text(`Name: ${invoice.customerName}`, MARGIN_X + 5, y + 13)

  p.font('normal', 10)
  p.text(`Mobile: +91 ${invoice.mobileNumber}`, MARGIN_X + 5, y + 19)
  p.text(
    `Total Items: ${invoice.totalItems}  |  Total Qty: ${invoice.totalQuantity} Rolls`,
    right - 65,
    y + 13
  )
  p.text(
    `Billed By: ${invoice.createdBy?.fullName || invoice.createdBy?.email || 'Admin'}`,
    right - 65,
    y + 19
  )

  // ---------- Items Table ----------
  y = tableStartY
  p.rect(MARGIN_X, y, PAGE_W - MARGIN_X * 2, 9, [241, 245, 249], [203, 213, 225])
  p.color([15, 23, 42])
  p.font('bold', 9.5)
  p.text('Sr No', MARGIN_X + 4, y + 6)
  p.text('Catalogue', MARGIN_X + 24, y + 6)
  p.text('Pattern No.', MARGIN_X + 72, y + 6)
  p.text('Qty', MARGIN_X + 110, y + 6)
  p.text('Rate', MARGIN_X + 134, y + 6)
  p.text('Amount', right - 4, y + 6, 'right')
  y += 9

  items.forEach((item, idx) => {
    p.line(MARGIN_X, y + rowHeight, right, y + rowHeight, [226, 232, 240])

    p.color([71, 85, 105])
    p.font('normal', 9.5)
    p.text(idx + 1, MARGIN_X + 4, y + 6.8)

    p.color([15, 23, 42])
    p.font('bold', 9.5)
    p.text(formatCatalogueLabel(item.catalogueName || item.catalogueSlug), MARGIN_X + 24, y + 6.8)
    p.text(item.patternNumber, MARGIN_X + 72, y + 6.8)

    p.font('normal', 9.5)
    p.text(`${item.quantity} Rolls`, MARGIN_X + 110, y + 6.8)
    p.text(formatCurrency(item.rate), MARGIN_X + 134, y + 6.8)

    p.font('bold', 9.5)
    p.text(formatCurrency(item.subtotal), right - 4, y + 6.8, 'right')

    y += rowHeight
  })

  // ---------- Totals Summary ----------
  y += 8
  const summaryW = 66
  const summaryX = right - summaryW
  const hasGst = Boolean(invoice.taxRate && invoice.taxRate > 0)
  p.rect(summaryX, y, summaryW, hasGst ? 38 : 34, [248, 250, 252], [203, 213, 225])

  p.font('normal', 8.5)
  p.color([71, 85, 105])
  p.text('Subtotal:', summaryX + 4, y + 7)
  p.font('bold', 8.5)
  p.color([15, 23, 42])
  p.text(formatCurrency(invoice.subtotal), right - 3, y + 7, 'right')

  const discountLabel =
    invoice.discountType === 'PERCENTAGE' && invoice.discountValue > 0
      ? `Discount (${invoice.discountValue}%):`
      : 'Discount:'
  p.font('normal', 8.5)
  p.color([71, 85, 105])
  p.text(discountLabel, summaryX + 4, y + 14)
  p.font('bold', 8.5)
  p.color([185, 28, 28])
  p.text(`- ${formatCurrency(invoice.discountAmount || 0)}`, right - 3, y + 14, 'right')

  let finalY = y + 22
  if (hasGst) {
    p.font('normal', 8.5)
    p.color([71, 85, 105])
    p.text(`GST (${invoice.taxRate}%):`, summaryX + 4, y + 21)
    p.font('bold', 8.5)
    p.color([15, 23, 42])
    p.text(`+ ${formatCurrency(invoice.taxAmount || 0)}`, right - 3, y + 21, 'right')
    finalY = y + 28
  }

  p.line(summaryX + 3, finalY - 3, right - 3, finalY - 3, [203, 213, 225])
  p.font('bold', 10)
  p.color([15, 23, 42])
  p.text('Final Total:', summaryX + 4, finalY + 4)
  p.text(formatCurrency(invoice.finalTotal), right - 3, finalY + 4, 'right')

  // ---------- Signature ----------
  const sigY = y + 42
  p.font('bold', 10)
  p.color([15, 23, 42])
  p.text('For NH Wallpaper', right - 5, sigY + 5, 'right')
  p.font('normal', 8)
  p.color([100, 116, 139])
  p.text('Authorised Signatory', right - 5, sigY + 18, 'right')

  // ---------- Terms & Conditions (bottom) ----------
  const termsY = pageH - 34
  p.line(MARGIN_X, termsY - 3, right, termsY - 3, [226, 232, 240], 0.4)

  p.font('bold', 8)
  p.color([15, 23, 42])
  p.text('Terms & Conditions :', MARGIN_X, termsY + 2)

  p.font('normal', 7)
  p.color([71, 85, 105])
  p.text('•  Subject to Mumbai Jurisdiction.', MARGIN_X, termsY + 7)
  p.text('•  No complaint will be entertained after acceptance of the delivery.', MARGIN_X, termsY + 12)
  p.text('•  Goods once sold will not be taken back or exchanged.', MARGIN_X, termsY + 17)
  p.text('•  Our responsibility ceases after delivery of goods to the carriers.', MARGIN_X, termsY + 22)

  p.font('normal', 7.5)
  p.color([148, 163, 184])
  p.text('Thank you for your business! — NH Wallpaper', right, termsY + 22, 'right')

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to render invoice image'))),
      'image/png'
    )
  })
}
