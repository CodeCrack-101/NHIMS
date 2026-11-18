import { jsPDF } from 'jspdf'
import { formatCatalogueLabel } from '../services/catalogueService.js'

const formatCurrencyPdf = (val) => {
  const num = Number(val) || 0
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const formatNumberPdf = (val) => {
  const num = Number(val) || 0
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const loadLogoAsDataUrl = (src = '/Logo.png') =>
  new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 160
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })

/**
 * 1. PDF DOWNLOAD & PRINT ENGINE: 4 x 10 Inches Auto-Fitting Single Page Engine
 */
const generateInvoicePdfDoc = async (invoice) => {
  if (!invoice) return

  const items = invoice.items || []
  const n = items.length

  // Dynamic automatic scaling strictly for 4x10 inches (101.6 mm x 254 mm)
  let scale = 1.0
  let rowHeight = 7.5
  let tableFontSize = 7.5
  let headerHeight = 24
  let customerBoxHeight = 14

  if (n <= 3) {
    scale = 1.10
    rowHeight = 9.8
    tableFontSize = 8.4
    headerHeight = 26
    customerBoxHeight = 15
  } else if (n <= 6) {
    scale = 1.0
    rowHeight = 8.2
    tableFontSize = 7.6
    headerHeight = 24
    customerBoxHeight = 14
  } else if (n <= 10) {
    scale = 0.88
    rowHeight = 6.6
    tableFontSize = 6.8
    headerHeight = 22
    customerBoxHeight = 12.5
  } else if (n <= 16) {
    scale = 0.78
    rowHeight = 5.2
    tableFontSize = 6.0
    headerHeight = 20
    customerBoxHeight = 11.5
  } else if (n <= 22) {
    scale = 0.68
    rowHeight = 4.4
    tableFontSize = 5.2
    headerHeight = 18.5
    customerBoxHeight = 10.5
  } else {
    scale = 0.60
    rowHeight = 3.8
    tableFontSize = 4.6
    headerHeight = 17
    customerBoxHeight = 9.5
  }

  // Exact 4 x 10 inch paper dimensions: 101.6 mm x 254 mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [101.6, 254],
  })

  const logoDataUrl = await loadLogoAsDataUrl('/Logo.png')
  const pageWidth = 101.6
  const pageHeight = 254
  const marginX = 4.0
  const usableWidth = pageWidth - marginX * 2 // 93.6 mm

  // Payment Status resolution
  const isUnpaid = (invoice.paymentStatus || '').toUpperCase() === 'UNPAID'

  // 1. Header Banner
  const topY = 3.5
  doc.setFillColor(15, 23, 42)
  doc.roundedRect(marginX, topY, usableWidth, headerHeight, 2, 2, 'F')

  const logoSize = Math.round(headerHeight * 0.72)
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginX + 2.5, topY + (headerHeight - logoSize) / 2, logoSize, logoSize)
  }

  const titleX = logoDataUrl ? marginX + logoSize + 4.5 : marginX + 3.5
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5 * scale)
  doc.text('NH Wallpaper', titleX, topY + 5.2 * scale)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.2 * scale)
  doc.setTextColor(255, 255, 255)
  doc.text('Wallpaper Wholesaler', titleX, topY + 9.0 * scale)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.4 * scale)
  doc.setTextColor(226, 232, 240)
  doc.text('Mob: +91 8828251111, 9930317192', titleX, topY + 12.5 * scale)

  doc.setFontSize(4.6 * scale)
  doc.setTextColor(203, 213, 225)
  doc.text(
    'Rani Residency, Shop 02, Opp Apha Park, Chirag Ngr, Ghatkopar(W), Mumbai 400086',
    titleX,
    topY + 15.8 * scale,
    { maxWidth: 36 * scale }
  )

  // GST & Metadata right side inside Header Banner
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.6 * scale)
  doc.text('GSTIN: 27DXLPR9950M1ZB', pageWidth - marginX - 3, topY + 5.2 * scale, {
    align: 'right',
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.2 * scale)
  doc.text(`Invoice: ${invoice.invoiceNumber}`, pageWidth - marginX - 3, topY + 9.5 * scale, {
    align: 'right',
  })

  const invDateObj = new Date(invoice.invoiceDate || invoice.createdAt || Date.now())
  const dateFormatted = invDateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timeFormatted = invDateObj.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.2 * scale)
  doc.setTextColor(203, 213, 225)
  doc.text(`Date: ${dateFormatted}`, pageWidth - marginX - 3, topY + 13.2 * scale, {
    align: 'right',
  })
  doc.text(`Time: ${timeFormatted}`, pageWidth - marginX - 3, topY + 16.5 * scale, {
    align: 'right',
  })

  // 2. Customer Details Box
  let currentY = topY + headerHeight + (scale < 0.8 ? 1.8 : 2.5)
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(marginX, currentY, usableWidth, customerBoxHeight, 1.5, 1.5, 'FD')

  // Vertical divider inside Customer Box
  const custSplitX = marginX + usableWidth * 0.55
  doc.setDrawColor(226, 232, 240)
  doc.line(custSplitX, currentY + 1.2, custSplitX, currentY + customerBoxHeight - 1.2)

  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5 * scale)
  doc.text('BILL TO CUSTOMER', marginX + 3, currentY + 3.8 * scale)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8 * scale)
  doc.text(invoice.customerName || 'Walk-in Customer', marginX + 3, currentY + 7.5 * scale, {
    maxWidth: custSplitX - marginX - 4,
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5 * scale)
  doc.setTextColor(71, 85, 105)
  doc.text(`+91 ${invoice.mobileNumber || 'N/A'}`, marginX + 3, currentY + 11.2 * scale)

  // Invoice Summary Right Column inside Customer Box
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.5 * scale)
  doc.text('INVOICE SUMMARY', custSplitX + 3, currentY + 3.8 * scale)

  const billerDisplayName = invoice.billerName || invoice.createdBy?.fullName || invoice.createdBy?.email || 'Admin'
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5 * scale)
  doc.setTextColor(71, 85, 105)
  doc.text(
    `Items: ${invoice.totalItems || items.length}  |  Qty: ${invoice.totalQuantity || 0} Rolls`,
    custSplitX + 3,
    currentY + 7.5 * scale
  )
  doc.text(
    `Billed By: ${billerDisplayName}`,
    custSplitX + 3,
    currentY + 11.2 * scale
  )

  // Status Badge in the Customer Box (Top right corner of box)
  const statusBoxW = isUnpaid ? 22 * scale : 15 * scale
  const statusBoxH = 4.2 * scale
  const statusBoxX = pageWidth - marginX - statusBoxW - 2.5
  const statusBoxY = currentY + 8.2 * scale

  if (isUnpaid) {
    doc.setFillColor(254, 226, 226) // light red
    doc.setDrawColor(239, 68, 68)   // red border
    doc.roundedRect(statusBoxX, statusBoxY, statusBoxW, statusBoxH, 0.8, 0.8, 'FD')
    doc.setTextColor(185, 28, 28)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.2 * scale)
    doc.text('UNPAID', statusBoxX + statusBoxW / 2, statusBoxY + 3.0 * scale, { align: 'center' })
  } else {
    doc.setFillColor(220, 252, 231) // light green
    doc.setDrawColor(34, 197, 94)   // green border
    doc.roundedRect(statusBoxX, statusBoxY, statusBoxW, statusBoxH, 0.8, 0.8, 'FD')
    doc.setTextColor(21, 128, 61)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.5 * scale)
    doc.text('PAID', statusBoxX + statusBoxW / 2, statusBoxY + 3.0 * scale, { align: 'center' })
  }

  // 3. Items Table
  currentY += customerBoxHeight + (scale < 0.8 ? 1.8 : 2.5)

  // Table Column Positions tailored for 101.6mm width
  const colX = {
    sr: marginX + 2,
    srW: 6,
    cat: marginX + 9,
    catW: 28,
    pat: marginX + 38,
    patW: 19,
    qty: marginX + 58,
    qtyW: 10,
    rate: marginX + 69,
    rateW: 11,
    amt: pageWidth - marginX - 2, // right-aligned
  }

  const thH = Math.round(6.5 * (scale < 0.8 ? 0.85 : 1.0))
  doc.setFillColor(241, 245, 249)
  doc.roundedRect(marginX, currentY, usableWidth, thH, 1.5, 1.5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(tableFontSize)
  doc.setTextColor(15, 23, 42)
  const thTextY = currentY + thH * 0.68

  doc.text('Sr', colX.sr, thTextY)
  doc.text('Catalogue', colX.cat, thTextY)
  doc.text('Pattern', colX.pat, thTextY)
  doc.text('Qty', colX.qty, thTextY)
  doc.text('Rate', colX.rate, thTextY)
  doc.text('Amount', colX.amt, thTextY, { align: 'right' })

  currentY += thH + 0.4
  const tableStartY = currentY - thH - 0.4

  items.forEach((item, index) => {
    const isEven = index % 2 === 0
    if (isEven) {
      doc.setFillColor(250, 250, 250)
      doc.rect(marginX, currentY, usableWidth, rowHeight, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(tableFontSize)
    doc.setTextColor(71, 85, 105)
    const textY = currentY + rowHeight * 0.68

    doc.text(String(index + 1), colX.sr, textY)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    const catLabel = formatCatalogueLabel(item.catalogueName || item.catalogueSlug)
    doc.text(catLabel, colX.cat, textY, { maxWidth: colX.catW })

    doc.text(String(item.patternNumber || '—'), colX.pat, textY, { maxWidth: colX.patW })

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(String(item.quantity), colX.qty, textY)
    doc.text(formatNumberPdf(item.rate), colX.rate, textY)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(formatNumberPdf(item.subtotal), colX.amt, textY, { align: 'right' })

    // Row underline
    doc.setDrawColor(241, 245, 249)
    doc.setLineWidth(0.2)
    doc.line(marginX, currentY + rowHeight, pageWidth - marginX, currentY + rowHeight)

    currentY += rowHeight
  })

  const tableBottomY = currentY

  // Outer border & Vertical Dividers for Table
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  doc.rect(marginX, tableStartY, usableWidth, tableBottomY - tableStartY)

  const verticalLines = [
    colX.cat - 1.5,
    colX.pat - 1.5,
    colX.qty - 1.5,
    colX.rate - 1.5,
    colX.amt - 13.5,
  ]
  verticalLines.forEach((vx) => {
    doc.line(vx, tableStartY, vx, tableBottomY)
  })

  // 4. Totals & Calculations Box
  currentY += scale < 0.8 ? 2 : 3
  const summaryBoxWidth = Math.round(52 * scale)
  const summaryBoxX = pageWidth - marginX - summaryBoxWidth

  const showDiscount = invoice.discountAmount && invoice.discountAmount > 0
  const showGst = invoice.taxRate && invoice.taxRate > 0

  let numSummaryLines = 3 // Subtotal + Final + Payment Status
  if (showDiscount) numSummaryLines++
  if (showGst) numSummaryLines++

  const summaryLineH = scale < 0.8 ? 4.2 : 5.0
  const summaryBoxHeight = numSummaryLines * summaryLineH + 5

  // Background and border for summary box
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(summaryBoxX, currentY, summaryBoxWidth, summaryBoxHeight, 2, 2, 'FD')

  let boxLineY = currentY + summaryLineH * 0.75
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.2 * scale)
  doc.setTextColor(71, 85, 105)
  doc.text('Subtotal:', summaryBoxX + 2.5, boxLineY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(formatCurrencyPdf(invoice.subtotal), summaryBoxX + summaryBoxWidth - 2.5, boxLineY, {
    align: 'right',
  })

  if (showDiscount) {
    boxLineY += summaryLineH
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(185, 28, 28)
    const discountLabel =
      invoice.discountType === 'PERCENTAGE' && invoice.discountValue > 0
        ? `Discount (${invoice.discountValue}%):`
        : 'Discount:'
    doc.text(discountLabel, summaryBoxX + 2.5, boxLineY)
    doc.text(`- ${formatCurrencyPdf(invoice.discountAmount || 0)}`, summaryBoxX + summaryBoxWidth - 2.5, boxLineY, {
      align: 'right',
    })
  }

  if (showGst) {
    boxLineY += summaryLineH
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(`GST (${invoice.taxRate}%):`, summaryBoxX + 2.5, boxLineY)
    doc.text(`+ ${formatCurrencyPdf(invoice.taxAmount || 0)}`, summaryBoxX + summaryBoxWidth - 2.5, boxLineY, {
      align: 'right',
    })
  }

  // Divider inside summary box
  boxLineY += 1.8
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.25)
  doc.line(summaryBoxX + 1.5, boxLineY, summaryBoxX + summaryBoxWidth - 1.5, boxLineY)

  boxLineY += summaryLineH * 0.85
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5 * scale)
  doc.setTextColor(15, 23, 42)
  doc.text('Final Total:', summaryBoxX + 2.5, boxLineY)
  doc.text(formatCurrencyPdf(invoice.finalTotal), summaryBoxX + summaryBoxWidth - 2.5, boxLineY, {
    align: 'right',
  })

  // Prominent Payment Status Line at bottom of summary box
  boxLineY += summaryLineH * 0.95
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8 * scale)
  if (isUnpaid) {
    doc.setTextColor(185, 28, 28)
    doc.text('Status:', summaryBoxX + 2.5, boxLineY)
    doc.text('UNPAID (Pending)', summaryBoxX + summaryBoxWidth - 2.5, boxLineY, { align: 'right' })
  } else {
    doc.setTextColor(21, 128, 61)
    doc.text('Status:', summaryBoxX + 2.5, boxLineY)
    doc.text('PAID (Received)', summaryBoxX + summaryBoxWidth - 2.5, boxLineY, { align: 'right' })
  }

  // Large Stamp / Watermark on the left side of Summary Box (optional visible stamp)
  const stampX = marginX + 4
  const stampY = currentY + 2
  const stampW = 34 * scale
  const stampH = 12 * scale

  if (isUnpaid) {
    // UNPAID Stamp Box
    doc.setFillColor(254, 242, 242)
    doc.setDrawColor(239, 68, 68)
    doc.setLineWidth(0.6)
    doc.roundedRect(stampX, stampY, stampW, stampH, 1.5, 1.5, 'FD')

    doc.setTextColor(220, 38, 38)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10 * scale)
    doc.text('UNPAID', stampX + stampW / 2, stampY + 5.5 * scale, { align: 'center' })

    doc.setFontSize(5.2 * scale)
    doc.text('PAYMENT PENDING', stampX + stampW / 2, stampY + 9.5 * scale, { align: 'center' })
  } else {
    // PAID Stamp Box
    doc.setFillColor(240, 253, 244)
    doc.setDrawColor(34, 197, 94)
    doc.setLineWidth(0.6)
    doc.roundedRect(stampX, stampY, stampW, stampH, 1.5, 1.5, 'FD')

    doc.setTextColor(22, 163, 74)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5 * scale)
    doc.text('PAID', stampX + stampW / 2, stampY + 5.5 * scale, { align: 'center' })

    doc.setFontSize(5.2 * scale)
    doc.text('AMOUNT RECEIVED', stampX + stampW / 2, stampY + 9.5 * scale, { align: 'center' })
  }

  // Signatory
  const sigY = currentY + summaryBoxHeight + 1.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.2 * scale)
  doc.setTextColor(15, 23, 42)
  doc.text('For NH Wallpaper', pageWidth - marginX - 2.5, sigY + 2.5 * scale, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.8 * scale)
  doc.setTextColor(100, 116, 139)
  doc.text('Authorised Signatory', pageWidth - marginX - 2.5, sigY + 7.5 * scale, { align: 'right' })

  // 5. Terms & Conditions (Strictly at bottom of single 4x10 page)
  const bottomTermsY = pageHeight - (scale < 0.8 ? 16 : 20)

  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.25)
  doc.line(marginX, bottomTermsY - 1.5, pageWidth - marginX, bottomTermsY - 1.5)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5.8 * scale)
  doc.text('Terms & Conditions :', marginX, bottomTermsY + 1.5 * scale)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(4.8 * scale)
  doc.setTextColor(71, 85, 105)
  const termGap = scale < 0.8 ? 2.5 : 3.0
  doc.text('•  Subject to Mumbai Jurisdiction.', marginX, bottomTermsY + termGap + 0.5)
  doc.text('•  No complaint will be entertained after acceptance of delivery.', marginX, bottomTermsY + termGap * 2 + 0.5)
  doc.text('•  Goods once sold will not be taken back or exchanged.', marginX, bottomTermsY + termGap * 3 + 0.5)
  doc.text('•  Our responsibility ceses after delivery of goods to carriers.', marginX, bottomTermsY + termGap * 4 + 0.5)

  doc.setFontSize(5.2 * scale)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.text('Thank you! — NH Wallpaper', pageWidth - marginX, bottomTermsY + termGap * 4 + 0.5, { align: 'right' })

  return doc
}

/**
 * 1. PDF DOWNLOAD: 4 x 10 Inches Auto-Fitting Single Page Engine
 */
export const downloadInvoicePdf = async (invoice) => {
  if (!invoice) return
  const doc = await generateInvoicePdfDoc(invoice)
  if (!doc) return
  doc.save(`${invoice.invoiceNumber}.pdf`)
}

/**
 * 2. BROWSER PRINT / THERMAL PRINTER: 4 x 10 Inches Dynamic Adaptive Engine
 * Direct browser print dialog via hidden iframe without downloading
 */
export const printInvoiceDocument = async (invoice) => {
  if (!invoice) return
  const doc = await generateInvoicePdfDoc(invoice)
  if (!doc) return

  const blob = doc.output('blob')
  const blobUrl = URL.createObjectURL(blob)

  let printIframe = document.getElementById('invoice-print-frame')
  if (!printIframe) {
    printIframe = document.createElement('iframe')
    printIframe.id = 'invoice-print-frame'
    printIframe.style.position = 'fixed'
    printIframe.style.right = '0'
    printIframe.style.bottom = '0'
    printIframe.style.width = '0'
    printIframe.style.height = '0'
    printIframe.style.border = '0'
    document.body.appendChild(printIframe)
  }

  printIframe.src = blobUrl
  printIframe.onload = () => {
    setTimeout(() => {
      try {
        printIframe.contentWindow?.focus()
        printIframe.contentWindow?.print()
      } catch (err) {
        const win = window.open(blobUrl, '_blank')
        if (win) {
          win.onload = () => {
            win.focus()
            win.print()
          }
        }
      } finally {
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl)
        }, 60000)
      }
    }, 250)
  }
}
