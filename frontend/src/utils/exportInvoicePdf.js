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
 * 1. PDF DOWNLOAD: 4 x 10 Inches Auto-Fitting Single Page Engine
 */
export const downloadInvoicePdf = async (invoice) => {
  if (!invoice) return

  const items = invoice.items || []
  const n = items.length

  // Dynamic automatic scaling strictly for 4x10 inches (101.6 mm x 254 mm)
  // Low quantity (1-4): Fonts increase (8.5-11pt), row padding expands, spacious layout.
  // Medium quantity (5-10): Standard readable font (7-8pt), balanced spacing.
  // High quantity (11-25+): Fonts decrease automatically (5-6.5pt), table padding condenses so it NEVER overflows and stays on 1 single page!
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
  const summaryBoxWidth = Math.round(48 * scale)
  const summaryBoxX = pageWidth - marginX - summaryBoxWidth

  const showDiscount = invoice.discountAmount && invoice.discountAmount > 0
  const showGst = invoice.taxRate && invoice.taxRate > 0

  let numSummaryLines = 2 // Subtotal + Final
  if (showDiscount) numSummaryLines++
  if (showGst) numSummaryLines++

  const summaryLineH = scale < 0.8 ? 4.2 : 5.0
  const summaryBoxHeight = numSummaryLines * summaryLineH + 4

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

  doc.save(`${invoice.invoiceNumber}.pdf`)
}

/**
 * 2. BROWSER PRINT / THERMAL PRINTER: 4 x 10 Inches Dynamic Adaptive Engine
 */
export const printInvoiceDocument = (invoice) => {
  if (!invoice) return

  const items = invoice.items || []
  const n = items.length

  // Dynamic CSS variables based on content count:
  // Few items: Generous font & cell padding
  // Many items: Auto decrease font & compact padding to guarantee 1 single page
  let itemFontSize = '10px'
  let itemPadding = '6px 5px'
  let headerPad = '10px 8px'
  let summaryPad = '8px 10px'
  let termsPad = '7px 0 0'
  let termsMarginTop = '10px'

  if (n <= 3) {
    itemFontSize = '11px'
    itemPadding = '8px 6px'
    headerPad = '12px 10px'
    summaryPad = '10px 12px'
    termsPad = '10px 0 0'
    termsMarginTop = '18px'
  } else if (n <= 6) {
    itemFontSize = '10.5px'
    itemPadding = '6px 5px'
    headerPad = '10px 8px'
    summaryPad = '8px 10px'
    termsMarginTop = '14px'
  } else if (n <= 10) {
    itemFontSize = '9.5px'
    itemPadding = '4.5px 4px'
    headerPad = '8px 8px'
    summaryPad = '6px 8px'
    termsMarginTop = '8px'
  } else if (n <= 16) {
    itemFontSize = '8.5px'
    itemPadding = '3px 3.5px'
    headerPad = '7px 7px'
    summaryPad = '5px 7px'
    termsMarginTop = '6px'
  } else {
    itemFontSize = '7.8px'
    itemPadding = '2.2px 3px'
    headerPad = '6px 6px'
    summaryPad = '4px 6px'
    termsMarginTop = '4px'
  }

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

  const rowsHtml = items
    .map(
      (item, idx) => `
      <tr>
        <td style="color:#475569; width:20px; padding:${itemPadding}; text-align:center;">${idx + 1}</td>
        <td style="padding:${itemPadding};"><strong>${formatCatalogueLabel(item.catalogueName || item.catalogueSlug)}</strong></td>
        <td style="padding:${itemPadding}; white-space:nowrap;"><strong>${item.patternNumber}</strong></td>
        <td style="padding:${itemPadding}; white-space:nowrap; text-align:center;">${item.quantity}</td>
        <td style="padding:${itemPadding}; white-space:nowrap;">${formatNumberPdf(item.rate)}</td>
        <td style="text-align:right; padding:${itemPadding}; white-space:nowrap;"><strong>${formatNumberPdf(item.subtotal)}</strong></td>
      </tr>`
    )
    .join('')

  const discountLabel =
    invoice.discountType === 'PERCENTAGE' && invoice.discountValue > 0
      ? `Discount (${invoice.discountValue}%):`
      : 'Discount:'

  const billerDisplayName = invoice.billerName || invoice.createdBy?.fullName || invoice.createdBy?.email || 'Admin'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice - ${invoice.invoiceNumber}</title>
  <style>
    @page {
      size: 4in 10in;
      margin: 3mm 3mm 3mm 3mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .invoice-container {
      width: 100%;
      max-width: 98mm;
      margin: 0 auto;
      padding: 1mm 1mm;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      page-break-after: avoid;
      page-break-inside: avoid;
    }

    /* Dark Navy Header Banner */
    .header-banner {
      background: #0f172a !important;
      color: #ffffff;
      padding: ${headerPad};
      border-radius: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-logo {
      width: 40px;
      height: 40px;
      object-fit: contain;
      border-radius: 50%;
      background: #ffffff;
      flex-shrink: 0;
    }
    .header-brand h1 {
      margin: 0;
      font-size: 15px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.01em;
    }
    .header-brand .sub {
      margin: 1px 0 0;
      font-size: 9.5px;
      color: #ffffff;
      font-weight: 600;
    }
    .header-brand .phone {
      margin: 1px 0 0;
      font-size: 8.5px;
      color: #e2e8f0;
      font-weight: 500;
    }
    .header-brand .addr {
      margin: 1px 0 0;
      font-size: 7.5px;
      color: #cbd5e1;
      max-width: 190px;
      line-height: 1.2;
    }

    .header-right {
      text-align: right;
    }
    .header-right .gst {
      margin: 0;
      font-size: 8.5px;
      font-weight: 700;
      color: #ffffff;
    }
    .header-right .inv-no {
      margin: 2px 0 0;
      font-size: 10px;
      font-weight: 800;
      color: #ffffff;
    }
    .header-right .date-time {
      margin: 1px 0 0;
      font-size: 8px;
      color: #cbd5e1;
    }

    /* Bill To Customer & Invoice Summary Box */
    .summary-card {
      background: #f8fafc !important;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: ${summaryPad};
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
    }
    .card-col {
      display: flex;
      flex-direction: column;
    }
    .card-header-lbl {
      margin: 0 0 2px;
      font-size: 8.5px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .card-name {
      margin: 0 0 1px;
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
    }
    .card-detail {
      margin: 0;
      font-size: 9px;
      font-weight: 600;
      color: #1e293b;
      line-height: 1.3;
    }

    /* Items Table */
    table.inv-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
      border: 1px solid #cbd5e1;
    }
    table.inv-table th {
      background: #f1f5f9 !important;
      border: 1px solid #cbd5e1;
      color: #0f172a;
      font-size: ${itemFontSize};
      font-weight: 700;
      padding: ${itemPadding};
      text-align: left;
    }
    table.inv-table th:last-child {
      text-align: right;
    }
    table.inv-table td {
      border: 1px solid #e2e8f0;
      font-size: ${itemFontSize};
      color: #0f172a;
    }

    /* Calculations & Totals */
    .calc-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 3px;
      margin-bottom: 6px;
    }
    .totals-box {
      width: 190px;
      background: #f8fafc !important;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 6px 8px;
    }
    .tot-line {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #475569;
      padding: 1.5px 0;
    }
    .tot-line.bold-val {
      font-weight: 700;
      color: #0f172a;
    }
    .tot-line.discount {
      color: #b91c1c;
      font-weight: 700;
    }
    .tot-divider {
      border-top: 1px solid #cbd5e1;
      margin: 3px 0;
    }
    .tot-final {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      padding-top: 2px;
    }

    .signatory-wrap {
      margin-top: 6px;
      text-align: right;
    }
    .signatory-comp {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      color: #0f172a;
    }
    .signatory-title {
      margin: 12px 0 0;
      font-size: 8.5px;
      color: #64748b;
    }

    /* Terms & Conditions Footer */
    .terms-footer {
      margin-top: ${termsMarginTop};
      padding-top: 5px;
      border-top: 1px solid #cbd5e1;
    }
    .terms-title {
      margin: 0 0 2px;
      font-size: 8.5px;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
    }
    .terms-list {
      margin: 0;
      padding-left: 14px;
      font-size: 7.5px;
      color: #475569;
      line-height: 1.35;
    }
    .thank-you-note {
      text-align: right;
      font-size: 8px;
      font-weight: 700;
      color: #64748b;
      margin: 4px 0 0;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header Banner -->
    <div class="header-banner">
      <div class="header-left">
        <img src="/Logo.png" alt="NH" class="header-logo" onerror="this.style.display='none'" />
        <div class="header-brand">
          <h1>NH Wallpaper</h1>
          <p class="sub">Wallpaper Wholesaler</p>
          <p class="phone">Mob: +91 8828251111, 9930317192</p>
          <p class="addr">Rani Residency, Shop 02, Opp Apha Park, Chirag Ngr, Ghatkopar(W), Mumbai 400086</p>
        </div>
      </div>
      <div class="header-right">
        <p class="gst">GSTIN: 27DXLPR9950M1ZB</p>
        <p class="inv-no">Invoice: ${invoice.invoiceNumber}</p>
        <p class="date-time">Date: ${dateFormatted}</p>
        <p class="date-time">Time: ${timeFormatted}</p>
      </div>
    </div>

    <!-- Bill To Customer & Invoice Summary Box -->
    <div class="summary-card">
      <div class="card-col">
        <p class="card-header-lbl">Bill To Customer</p>
        <p class="card-name">${invoice.customerName || 'Walk-in Customer'}</p>
        <p class="card-detail">Mobile: +91 ${invoice.mobileNumber || 'N/A'}</p>
      </div>
      <div class="card-col" style="text-align: left;">
        <p class="card-header-lbl">Invoice Summary</p>
        <p class="card-detail">Items: ${invoice.totalItems || items.length}  |  Qty: ${invoice.totalQuantity || 0} Rolls</p>
        <p class="card-detail">Billed By: ${billerDisplayName}</p>
      </div>
    </div>

    <!-- Items Table -->
    <table class="inv-table">
      <thead>
        <tr>
          <th style="width:20px; text-align:center;">Sr</th>
          <th>Catalogue</th>
          <th>Pattern</th>
          <th style="text-align:center;">Qty</th>
          <th>Rate</th>
          <th style="text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Totals & Signatory -->
    <div class="calc-row">
      <div>
        <div class="totals-box">
          <div class="tot-line">
            <span>Subtotal:</span>
            <strong class="tot-line bold-val" style="padding:0;">${formatCurrencyPdf(invoice.subtotal)}</strong>
          </div>
          <div class="tot-line discount">
            <span>${discountLabel}</span>
            <span>- ${formatCurrencyPdf(invoice.discountAmount || 0)}</span>
          </div>
          ${
            invoice.taxRate && invoice.taxRate > 0
              ? `
          <div class="tot-line bold-val">
            <span>GST (${invoice.taxRate}%):</span>
            <span>+ ${formatCurrencyPdf(invoice.taxAmount || 0)}</span>
          </div>`
              : ''
          }
          <div class="tot-divider"></div>
          <div class="tot-final">
            <span>Final Total:</span>
            <span>${formatCurrencyPdf(invoice.finalTotal)}</span>
          </div>
        </div>

        <div class="signatory-wrap">
          <p class="signatory-comp">For NH Wallpaper</p>
          <p class="signatory-title">Authorised Signatory</p>
        </div>
      </div>
    </div>

    <!-- Terms & Conditions Footer -->
    <div class="terms-footer">
      <p class="terms-title">Terms &amp; Conditions :</p>
      <ul class="terms-list">
        <li>Subject to Mumbai Jurisdiction.</li>
        <li>No complaint will be entertained after acceptance of delivery.</li>
        <li>Goods once sold will not be taken back or exchanged.</li>
        <li>Our responsibility ceses after delivery of goods to carriers.</li>
      </ul>
      <p class="thank-you-note">Thank you for your business! — NH Wallpaper</p>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`

  try {
    const printWin = window.open('', '_blank', 'width=900,height=720')
    if (printWin) {
      printWin.document.open()
      printWin.document.write(html)
      printWin.document.close()
      printWin.focus()
      setTimeout(() => {
        try {
          printWin.focus()
          printWin.print()
        } catch {}
      }, 500)
    } else {
      // Hidden iframe fallback if popup was blocked
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      document.body.appendChild(iframe)
      const doc = iframe.contentWindow.document
      doc.open()
      doc.write(html)
      doc.close()
      iframe.contentWindow.focus()
      setTimeout(() => {
        try {
          iframe.contentWindow.print()
        } catch {}
        setTimeout(() => {
          try {
            document.body.removeChild(iframe)
          } catch {}
        }, 2000)
      }, 400)
    }
  } catch (err) {
    console.error('Failed to print invoice document:', err)
  }
}
