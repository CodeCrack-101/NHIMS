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

export const downloadInvoicePdf = async (invoice) => {
  if (!invoice) return

  const items = invoice.items || []
  const n = items.length

  // Dynamic Scale Factor based on item count so everything fits on a single page
  // 1-7 items: full normal scale (1.0)
  // 8-12 items: compact scale (0.85)
  // 13-18 items: dense scale (0.72)
  // 19+ items: ultra dense scale (0.62)
  let scale = 1.0
  if (n > 18) {
    scale = 0.60
  } else if (n > 12) {
    scale = 0.72
  } else if (n > 7) {
    scale = 0.85
  }

  // Standard A4 format with millimetre units
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const logoDataUrl = await loadLogoAsDataUrl('/Logo.png')
  const pageWidth = doc.internal.pageSize.getWidth() // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight() // 297 mm
  const marginX = 12

  // 1. Header Banner
  const headerHeight = Math.round(30 * (scale < 0.7 ? 0.75 : scale < 0.9 ? 0.88 : 1.0))
  const topY = scale < 0.75 ? 6 : 10
  doc.setFillColor(15, 23, 42)
  doc.roundedRect(marginX, topY, pageWidth - marginX * 2, headerHeight, 3, 3, 'F')

  const logoSize = Math.round(22 * (scale < 0.75 ? 0.8 : 1.0))
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginX + 3.5, topY + 2.5, logoSize, logoSize)
  }

  const titleX = logoDataUrl ? marginX + logoSize + 8 : marginX + 6
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14 * scale + 1)
  doc.text('NH Wallpaper', titleX, topY + 7 * (scale < 0.8 ? 0.9 : 1.1))

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8 * scale)
  doc.setTextColor(255, 255, 255)
  doc.text('Wallpaper Wholesaler', titleX, topY + 12 * (scale < 0.8 ? 0.9 : 1.05))

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7 * scale)
  doc.setTextColor(226, 232, 240)
  doc.text('Mob: +91 8828251111, +91 9930317192', titleX, topY + 16.5 * (scale < 0.8 ? 0.9 : 1.05))

  doc.setFontSize(6.2 * scale)
  doc.setTextColor(203, 213, 225)
  doc.text(
    'Rani Residency, Shop 02, Opp Apha Park Near Taj Darbar, Chirag Nagar, Ghatkopar (W), Mumbai 400086',
    titleX,
    topY + 20.5 * (scale < 0.8 ? 0.9 : 1.05),
    { maxWidth: 75 }
  )

  // GST & Metadata right side inside Header Banner
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5 * scale)
  doc.text('GSTIN: 27DXLPR9950M1ZB', pageWidth - marginX - 4, topY + 7 * (scale < 0.8 ? 0.9 : 1.1), {
    align: 'right',
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9 * scale)
  doc.text(`Invoice: ${invoice.invoiceNumber}`, pageWidth - marginX - 4, topY + 13 * (scale < 0.8 ? 0.9 : 1.05), {
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
    second: '2-digit',
    hour12: true,
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7 * scale)
  doc.setTextColor(203, 213, 225)
  doc.text(`Date: ${dateFormatted}`, pageWidth - marginX - 4, topY + 18 * (scale < 0.8 ? 0.9 : 1.05), {
    align: 'right',
  })
  doc.text(`Time: ${timeFormatted}`, pageWidth - marginX - 4, topY + 22.5 * (scale < 0.8 ? 0.9 : 1.05), {
    align: 'right',
  })

  // 2. Customer Details Box
  let currentY = topY + headerHeight + (scale < 0.75 ? 2.5 : 4)
  const customerBoxHeight = Math.round(18 * (scale < 0.75 ? 0.75 : scale < 0.9 ? 0.88 : 1.0))
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(marginX, currentY, pageWidth - marginX * 2, customerBoxHeight, 2, 2, 'FD')

  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7 * scale)
  doc.text('BILL TO CUSTOMER', marginX + 3.5, currentY + 4 * (scale < 0.8 ? 0.85 : 1))
  doc.text('INVOICE SUMMARY', pageWidth - marginX - 70, currentY + 4 * (scale < 0.8 ? 0.85 : 1))

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5 * scale)
  doc.text(`Name: ${invoice.customerName}`, marginX + 3.5, currentY + 9 * (scale < 0.8 ? 0.85 : 1))

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5 * scale)
  doc.text(`Mobile: +91 ${invoice.mobileNumber}`, marginX + 3.5, currentY + 13.5 * (scale < 0.8 ? 0.85 : 1))

  const billerDisplayName = invoice.billerName || invoice.createdBy?.fullName || invoice.createdBy?.email || 'Admin'

  const itemsCount = invoice.totalItems || items.length
  const qtyCount = invoice.totalQuantity || items.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0)
  doc.text(
    `Items: ${itemsCount} | Qty: ${qtyCount} Rolls`,
    pageWidth - marginX - 70,
    currentY + 9 * (scale < 0.8 ? 0.85 : 1)
  )
  doc.text(
    `Billed By: ${billerDisplayName}`,
    pageWidth - marginX - 70,
    currentY + 13.5 * (scale < 0.8 ? 0.85 : 1)
  )

  // 3. Table Header & Items
  currentY += customerBoxHeight + (scale < 0.75 ? 2.5 : 4)
  const headerRowHeight = Math.max(5.5, 8.5 * scale)
  doc.setFillColor(241, 245, 249)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(marginX, currentY, pageWidth - marginX * 2, headerRowHeight, 1.2, 1.2, 'FD')

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.8 * scale)
  const textYOffset = headerRowHeight * 0.7
  doc.text('Sr', marginX + 3, currentY + textYOffset)
  doc.text('Catalogue', marginX + 16, currentY + textYOffset)
  doc.text('Pattern No.', marginX + 80, currentY + textYOffset)
  doc.text('Qty', marginX + 120, currentY + textYOffset)
  doc.text('Rate', marginX + 145, currentY + textYOffset)
  doc.text('Amount', pageWidth - marginX - 4, currentY + textYOffset, { align: 'right' })

  currentY += headerRowHeight
  const rowHeight = Math.max(4.6, 8.2 * scale)

  items.forEach((item, idx) => {
    doc.setDrawColor(226, 232, 240)
    doc.line(
      marginX,
      currentY + rowHeight,
      pageWidth - marginX,
      currentY + rowHeight
    )

    doc.setTextColor(71, 85, 105)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5 * scale)
    const rowTextY = currentY + rowHeight * 0.72
    doc.text(String(idx + 1), marginX + 3, rowTextY)

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    const catLabel = formatCatalogueLabel(item.catalogueName || item.catalogueSlug)
    doc.text(
      catLabel.length > 34 ? catLabel.substring(0, 33) + '…' : catLabel,
      marginX + 16,
      rowTextY
    )

    doc.text(String(item.patternNumber), marginX + 80, rowTextY)

    doc.setFont('helvetica', 'normal')
    doc.text(String(item.quantity), marginX + 120, rowTextY)
    doc.text(formatNumberPdf(item.rate), marginX + 145, rowTextY)

    doc.setFont('helvetica', 'bold')
    doc.text(
      formatNumberPdf(item.subtotal),
      pageWidth - marginX - 4,
      rowTextY,
      { align: 'right' }
    )

    currentY += rowHeight
  })

  // 4. Totals Summary & Signatory
  currentY += scale < 0.75 ? 2.5 : 4
  const summaryBoxWidth = Math.round(72 * (scale < 0.75 ? 0.9 : 1.0))
  const summaryBoxX = pageWidth - marginX - summaryBoxWidth

  const hasGst = Boolean(invoice.taxRate && invoice.taxRate > 0)
  const summaryBoxHeight = hasGst ? Math.max(20, 32 * scale) : Math.max(16, 25 * scale)
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(summaryBoxX, currentY, summaryBoxWidth, summaryBoxHeight, 1.5, 1.5, 'FD')

  const lineSpacing = summaryBoxHeight / (hasGst ? 4.3 : 3.4)
  let sY = currentY + lineSpacing * 0.8

  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5 * scale)
  doc.text('Subtotal:', summaryBoxX + 3.5, sY)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.text(
    formatCurrencyPdf(invoice.subtotal),
    pageWidth - marginX - 3.5,
    sY,
    { align: 'right' }
  )

  const discountLabel =
    invoice.discountType === 'PERCENTAGE' && invoice.discountValue > 0
      ? `Discount (${invoice.discountValue}%):`
      : 'Discount:'
  sY += lineSpacing
  doc.setTextColor(185, 28, 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5 * scale)
  doc.text(discountLabel, summaryBoxX + 3.5, sY)
  doc.text(
    `- ${formatCurrencyPdf(invoice.discountAmount || 0)}`,
    pageWidth - marginX - 3.5,
    sY,
    { align: 'right' }
  )

  if (hasGst) {
    sY += lineSpacing
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(`GST (${invoice.taxRate}%):`, summaryBoxX + 3.5, sY)
    doc.text(
      `+ ${formatCurrencyPdf(invoice.taxAmount || 0)}`,
      pageWidth - marginX - 3.5,
      sY,
      { align: 'right' }
    )
  }

  sY += lineSpacing
  doc.setDrawColor(203, 213, 225)
  doc.line(summaryBoxX + 3.5, sY - lineSpacing * 0.5, pageWidth - marginX - 3.5, sY - lineSpacing * 0.5)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9 * scale)
  doc.text('Final Total:', summaryBoxX + 3.5, sY)
  doc.text(
    formatCurrencyPdf(invoice.finalTotal),
    pageWidth - marginX - 3.5,
    sY,
    { align: 'right' }
  )

  // Signatory
  const sigY = currentY + summaryBoxHeight + 1.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5 * scale)
  doc.setTextColor(15, 23, 42)
  doc.text('For NH Wallpaper', pageWidth - marginX - 3.5, sigY + 3 * scale, { align: 'right' })

  if (billerDisplayName) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5 * scale)
    doc.setTextColor(30, 41, 59)
    doc.text(billerDisplayName, pageWidth - marginX - 3.5, sigY + 7 * scale, { align: 'right' })
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8 * scale)
  doc.setTextColor(100, 116, 139)
  doc.text('Authorised Signatory', pageWidth - marginX - 3.5, sigY + 11 * scale, { align: 'right' })

  // 5. Terms & Conditions (at bottom of single page)
  const bottomTermsY = pageHeight - (scale < 0.75 ? 16 : 22)

  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.3)
  doc.line(marginX, bottomTermsY - 1.5, pageWidth - marginX, bottomTermsY - 1.5)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5 * scale)
  doc.text('Terms & Conditions :', marginX, bottomTermsY + 2 * scale)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5 * scale)
  doc.setTextColor(71, 85, 105)
  const termGap = scale < 0.75 ? 3.2 : 3.8
  doc.text('•  Subject to Mumbai Jurisdiction.', marginX, bottomTermsY + termGap + 1)
  doc.text('•  No complaint will be entertained after acceptance of the delivery.', marginX, bottomTermsY + termGap * 2 + 1)
  doc.text('•  Goods once sold will not be taken back or exchanged.', marginX, bottomTermsY + termGap * 3 + 1)
  doc.text('•  Our responsibility ceses after delivery of goods to the carriers.', marginX, bottomTermsY + termGap * 4 + 1)

  doc.setFontSize(7 * scale)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.text('Thank you for your business! — NH Wallpaper', pageWidth - marginX, bottomTermsY + termGap * 4 + 1, { align: 'right' })

  doc.save(`${invoice.invoiceNumber}.pdf`)
}

export const printInvoiceDocument = (invoice) => {
  if (!invoice) return

  const invDateObj = new Date(invoice.invoiceDate || invoice.createdAt || Date.now())
  const dateFormatted = invDateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timeFormatted = invDateObj.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })

  const rowsHtml = (invoice.items || [])
    .map(
      (item, idx) => `
      <tr>
        <td style="color:#475569; width:22px; padding:4px 3px;">${idx + 1}</td>
        <td style="padding:4px 3px;"><strong>${formatCatalogueLabel(item.catalogueName || item.catalogueSlug)}</strong></td>
        <td style="padding:4px 3px; white-space:nowrap;"><strong>${item.patternNumber}</strong></td>
        <td style="padding:4px 3px; white-space:nowrap;">${item.quantity}</td>
        <td style="padding:4px 3px; white-space:nowrap;">${formatNumberPdf(item.rate)}</td>
        <td style="text-align:right; padding:4px 3px; white-space:nowrap;"><strong>${formatNumberPdf(item.subtotal)}</strong></td>
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
  <title></title>
  <style>
    @page {
      size: 4in 6in;
      margin: 4mm 3mm 4mm 3mm; /* Printer physical margin support so header & footer never cut */
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
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .invoice-container {
      width: 100%;
      max-width: 98mm;
      margin: 0 auto;
      padding: 2mm 1mm;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }

    /* Dark Navy Header Banner matching PDF */
    .header-banner {
      background: #0f172a !important;
      color: #ffffff;
      padding: 10px 8px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .header-logo {
      width: 44px;
      height: 44px;
      object-fit: contain;
      border-radius: 50%;
      background: #ffffff;
      flex-shrink: 0;
    }
    .header-brand h1 {
      margin: 0;
      font-size: 17px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.01em;
    }
    .header-brand .sub {
      margin: 2px 0 0;
      font-size: 10.5px;
      color: #ffffff;
      font-weight: 600;
    }
    .header-brand .phone {
      margin: 2px 0 0;
      font-size: 9px;
      color: #e2e8f0;
      font-weight: 500;
    }
    .header-brand .addr {
      margin: 2px 0 0;
      font-size: 8px;
      color: #cbd5e1;
      max-width: 220px;
      line-height: 1.25;
    }

    .header-right {
      text-align: right;
    }
    .header-right .gst {
      margin: 0;
      font-size: 9px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.2px;
    }
    .header-right .inv-no {
      margin: 3px 0 0;
      font-size: 10.5px;
      font-weight: 800;
      color: #ffffff;
    }
    .header-right .date-time {
      margin: 2px 0 0;
      font-size: 8.5px;
      color: #cbd5e1;
    }

    /* Content Area below Banner */
    .content-area {
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    /* Bill To Customer & Invoice Summary Box */
    .summary-card {
      background: #f8fafc !important;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .card-col {
      display: flex;
      flex-direction: column;
    }
    .card-header-lbl {
      margin: 0 0 2px;
      font-size: 9px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .card-name {
      margin: 0 0 2px;
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
    }
    .card-detail {
      margin: 0;
      font-size: 10px;
      font-weight: 600;
      color: #1e293b;
      line-height: 1.35;
    }

    /* Items Table */
    table.inv-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    table.inv-table th {
      background: #f1f5f9 !important;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      color: #0f172a;
      font-size: 10.5px;
      font-weight: 700;
      padding: 5px 4px;
      text-align: left;
    }
    table.inv-table th:first-child {
      border-left: 1px solid #cbd5e1;
      border-top-left-radius: 4px;
      border-bottom-left-radius: 4px;
    }
    table.inv-table th:last-child {
      border-right: 1px solid #cbd5e1;
      border-top-right-radius: 4px;
      border-bottom-right-radius: 4px;
      text-align: right;
    }
    table.inv-table td {
      padding: 5px 4px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 10.5px;
      color: #0f172a;
    }

    /* Calculations & Totals */
    .calc-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
      margin-bottom: 10px;
    }
    .totals-box {
      width: 210px;
      background: #f8fafc !important;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 7px 10px;
    }
    .tot-line {
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #475569;
      padding: 2px 0;
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
      margin: 4px 0;
    }
    .tot-final {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      padding-top: 2px;
    }

    .signatory-wrap {
      margin-top: 8px;
      text-align: right;
    }
    .signatory-comp {
      margin: 0;
      font-size: 10.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .signatory-title {
      margin: 14px 0 0;
      font-size: 9px;
      color: #64748b;
    }

    /* Terms & Conditions Footer */
    .terms-footer {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #cbd5e1;
    }
    .terms-title {
      margin: 0 0 3px;
      font-size: 9.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .terms-list {
      margin: 0;
      padding-left: 14px;
      font-size: 8px;
      color: #475569;
      line-height: 1.4;
    }
    .terms-thanks {
      margin: 4px 0 0;
      font-size: 8.5px;
      font-weight: 600;
      color: #64748b;
      text-align: right;
    }

    @media print {
      body {
        margin: 0 !important;
        padding: 0 !important;
      }
      .invoice-container {
        width: 100% !important;
        max-width: 100% !important;
        padding: 0 !important;
        page-break-inside: avoid;
        page-break-after: avoid;
      }
      table.inv-table tr {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Dark Navy Header Banner matching PDF -->
    <div class="header-banner">
      <div class="header-left">
        <img class="header-logo" src="/Logo.png" alt="NH Wallpaper" onerror="this.style.display='none'" />
        <div class="header-brand">
          <h1>NH Wallpaper</h1>
          <p class="sub">Wallpaper Wholesaler</p>
          <p class="phone">Mob: +91 8828251111, +91 9930317192</p>
          <p class="addr">Rani Residency, Shop 02, Opp Apha Park Near Taj Darbar, Chirag Nagar, Ghatkopar (W), Mumbai 400086</p>
        </div>
      </div>
      <div class="header-right">
        <p class="gst">GSTIN: 27DXLPR9950M1ZB</p>
        <p class="inv-no">Invoice: ${invoice.invoiceNumber}</p>
        <p class="date-time">Date: ${dateFormatted}</p>
        <p class="date-time">Time: ${timeFormatted}</p>
      </div>
    </div>

    <div class="content-area">
      <!-- Bill To Customer & Invoice Summary Box -->
      <div class="summary-card">
        <div class="card-col">
          <p class="card-header-lbl">Bill To Customer</p>
          <p class="card-name">Name: ${invoice.customerName}</p>
          <p class="card-detail">Mobile: +91 ${invoice.mobileNumber}</p>
        </div>
        <div class="card-col" style="text-align: left;">
          <p class="card-header-lbl">Invoice Summary</p>
          <p class="card-detail">Items: ${invoice.totalItems} &nbsp;|&nbsp; Qty: ${invoice.totalQuantity} Rolls</p>
          <p class="card-detail">Billed By: ${billerDisplayName}</p>
        </div>
      </div>

      <!-- Items Table -->
      <table class="inv-table">
        <thead>
          <tr>
            <th style="width:22px;">Sr</th>
            <th>Catalogue</th>
            <th>Pattern No.</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
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
            <p style="margin: 4px 0 0; font-size: 9.5px; font-weight: 700; color: #0f172a;">${billerDisplayName}</p>
            <p class="signatory-title" style="margin-top: 4px;">Authorised Signatory</p>
          </div>
        </div>
      </div>

      <!-- Terms & Conditions Footer -->
      <div class="terms-footer">
        <p class="terms-title">Terms &amp; Conditions :</p>
        <ul class="terms-list">
          <li>Subject to Mumbai Jurisdiction.</li>
          <li>No complaint will be entertained after acceptance of the delivery.</li>
          <li>Goods once sold will not be taken back or exchanged.</li>
          <li>Our responsibility ceses after delivery of goods to the carriers.</li>
        </ul>
        <p class="terms-thanks">Thank you for your business! — NH Wallpaper</p>
      </div>
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
