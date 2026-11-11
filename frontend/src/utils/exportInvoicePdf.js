import { jsPDF } from 'jspdf'
import { formatCatalogueLabel } from '../services/catalogueService.js'

const formatCurrencyPdf = (val) => {
  const num = Number(val) || 0
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
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

  // 10.5 cm x 18.5 cm = 105 mm x 185 mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [105, 185],
  })

  const logoDataUrl = await loadLogoAsDataUrl('/Logo.png')
  const pageWidth = doc.internal.pageSize.getWidth() // 105
  const pageHeight = doc.internal.pageSize.getHeight() // 185
  const marginX = 6

  // Header Banner (Height: 25mm)
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 25, 'F')

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginX, 3.5, 14, 14)
  }

  const titleX = logoDataUrl ? marginX + 16 : marginX
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('NH Wallpaper', titleX, 7.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('Wallpaper Wholesaler', titleX, 11)

  doc.setFontSize(5.5)
  doc.setTextColor(226, 232, 240)
  doc.text('Mob: +91 8828251111, +91 9930317192', titleX, 14.5)
  doc.text(
    'Rani Residency, Shop 02, Opp Apha Park Near Taj Darbar, Chirag Nagar, Ghatkopar (W), Mumbai 400086',
    titleX,
    18,
    { maxWidth: 44 }
  )

  // GST & Metadata right side
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.text('GSTIN: 27DXLPR9950M1ZB', pageWidth - marginX, 7, {
    align: 'right',
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text(`Invoice: ${invoice.invoiceNumber}`, pageWidth - marginX, 11, {
    align: 'right',
  })

  const invDateObj = new Date(invoice.invoiceDate || invoice.createdAt)
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
  doc.setFontSize(5.8)
  doc.setTextColor(203, 213, 225)
  doc.text(`Date: ${dateFormatted}`, pageWidth - marginX, 15, {
    align: 'right',
  })
  doc.text(`Time: ${timeFormatted}`, pageWidth - marginX, 18.5, {
    align: 'right',
  })

  // Customer Details Box (Height: 15.5mm)
  let currentY = 27.5
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.rect(marginX, currentY, pageWidth - marginX * 2, 15.5, 'FD')

  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.text('Bill To Customer', marginX + 3, currentY + 4)
  doc.text('Invoice Summary', pageWidth - marginX - 42, currentY + 4)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(`Name: ${invoice.customerName}`, marginX + 3, currentY + 8.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text(`Mobile: +91 ${invoice.mobileNumber}`, marginX + 3, currentY + 12.5)

  doc.text(
    `Items: ${invoice.totalItems} | Qty: ${invoice.totalQuantity} Rolls`,
    pageWidth - marginX - 42,
    currentY + 8.5
  )
  doc.text(
    `Billed By: ${invoice.createdBy?.fullName || invoice.createdBy?.email || 'Admin'}`,
    pageWidth - marginX - 42,
    currentY + 12.5
  )

  // Table Header
  currentY = 45
  const drawTableHeader = (yPos) => {
    doc.setFillColor(241, 245, 249)
    doc.setDrawColor(203, 213, 225)
    doc.rect(marginX, yPos, pageWidth - marginX * 2, 6.5, 'FD')

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text('Sr', marginX + 2, yPos + 4.5)
    doc.text('Catalogue', marginX + 9, yPos + 4.5)
    doc.text('Pattern No.', marginX + 41, yPos + 4.5)
    doc.text('Qty', marginX + 59, yPos + 4.5)
    doc.text('Rate', marginX + 71, yPos + 4.5)
    doc.text('Amount', pageWidth - marginX - 2, yPos + 4.5, { align: 'right' })

    return yPos + 6.5
  }

  currentY = drawTableHeader(currentY)
  const rowHeight = 7

  ;(invoice.items || []).forEach((item, idx) => {
    if (currentY + rowHeight > pageHeight - 44) {
      doc.addPage()
      currentY = drawTableHeader(14)
    }

    doc.setDrawColor(226, 232, 240)
    doc.line(
      marginX,
      currentY + rowHeight,
      pageWidth - marginX,
      currentY + rowHeight
    )

    doc.setTextColor(71, 85, 105)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(String(idx + 1), marginX + 2, currentY + 4.8)

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    const catLabel = formatCatalogueLabel(item.catalogueName || item.catalogueSlug)
    doc.text(
      catLabel.length > 18 ? catLabel.substring(0, 17) + '…' : catLabel,
      marginX + 9,
      currentY + 4.8
    )

    doc.text(String(item.patternNumber), marginX + 41, currentY + 4.8)

    doc.setFont('helvetica', 'normal')
    doc.text(`${item.quantity} Rolls`, marginX + 59, currentY + 4.8)
    doc.text(formatCurrencyPdf(item.rate), marginX + 71, currentY + 4.8)

    doc.setFont('helvetica', 'bold')
    doc.text(
      formatCurrencyPdf(item.subtotal),
      pageWidth - marginX - 2,
      currentY + 4.8,
      { align: 'right' }
    )

    currentY += rowHeight
  })

  // Totals Summary & Signatory
  currentY += 4
  if (currentY + 45 > pageHeight - 12) {
    doc.addPage()
    currentY = 16
  }

  const summaryBoxWidth = 46
  const summaryBoxX = pageWidth - marginX - summaryBoxWidth

  const hasGst = Boolean(invoice.taxRate && invoice.taxRate > 0)
  const summaryBoxHeight = hasGst ? 27 : 23
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.rect(summaryBoxX, currentY, summaryBoxWidth, summaryBoxHeight, 'FD')

  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('Subtotal:', summaryBoxX + 2.5, currentY + 5)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.text(
    formatCurrencyPdf(invoice.subtotal),
    pageWidth - marginX - 2.5,
    currentY + 5,
    { align: 'right' }
  )

  const discountLabel =
    invoice.discountType === 'PERCENTAGE' && invoice.discountValue > 0
      ? `Discount (${invoice.discountValue}%):`
      : 'Discount:'
  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  doc.text(discountLabel, summaryBoxX + 2.5, currentY + 9.5)
  doc.setTextColor(185, 28, 28)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `- ${formatCurrencyPdf(invoice.discountAmount || 0)}`,
    pageWidth - marginX - 2.5,
    currentY + 9.5,
    { align: 'right' }
  )

  let finalYOffset = currentY + 15
  if (hasGst) {
    doc.setTextColor(71, 85, 105)
    doc.setFont('helvetica', 'normal')
    doc.text(`GST (${invoice.taxRate}%):`, summaryBoxX + 2.5, currentY + 14)
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `+ ${formatCurrencyPdf(invoice.taxAmount || 0)}`,
      pageWidth - marginX - 2.5,
      currentY + 14,
      { align: 'right' }
    )
    finalYOffset = currentY + 19.5
  }

  doc.setDrawColor(203, 213, 225)
  doc.line(summaryBoxX + 2, finalYOffset - 2, pageWidth - marginX - 2, finalYOffset - 2)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('Final Total:', summaryBoxX + 2.5, finalYOffset + 3)
  doc.text(
    formatCurrencyPdf(invoice.finalTotal),
    pageWidth - marginX - 2.5,
    finalYOffset + 3,
    { align: 'right' }
  )

  // Signatory
  const sigY = currentY + summaryBoxHeight + 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(15, 23, 42)
  doc.text('For NH Wallpaper', pageWidth - marginX - 3, sigY + 3.5, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.setTextColor(100, 116, 139)
  doc.text('Authorised Signatory', pageWidth - marginX - 3, sigY + 11, { align: 'right' })

  // Terms & Conditions (at bottom of 185mm page)
  const bottomTermsY = pageHeight - 23

  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(marginX, bottomTermsY - 2, pageWidth - marginX, bottomTermsY - 2)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.text('Terms & Conditions :', marginX, bottomTermsY + 1.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5)
  doc.setTextColor(71, 85, 105)
  doc.text('•  Subject to Mumbai Jurisdiction.', marginX, bottomTermsY + 5)
  doc.text('•  No complaint will be entertained after acceptance of the delivery.', marginX, bottomTermsY + 8.5)
  doc.text('•  Goods once sold will not be taken back or exchanged.', marginX, bottomTermsY + 12)
  doc.text('•  Our responsibility ceses after delivery of goods to the carriers.', marginX, bottomTermsY + 15.5)

  doc.setFontSize(5.5)
  doc.setTextColor(148, 163, 184)
  doc.text('Thank you for your business! — NH Wallpaper', pageWidth - marginX, bottomTermsY + 15.5, { align: 'right' })

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
        <td style="padding:4px 3px;"><strong>${item.patternNumber}</strong></td>
        <td style="padding:4px 3px;">${item.quantity} Rolls</td>
        <td style="padding:4px 3px;">${formatCurrencyPdf(item.rate)}</td>
        <td style="text-align:right; padding:4px 3px;"><strong>${formatCurrencyPdf(item.subtotal)}</strong></td>
      </tr>`
    )
    .join('')

  const discountLabel =
    invoice.discountType === 'PERCENTAGE' && invoice.discountValue > 0
      ? `Discount (${invoice.discountValue}%):`
      : 'Discount:'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title></title>
  <style>
    @page {
      size: 105mm 185mm;
      margin: 0; /* Removes browser default headers & footers */
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 105mm;
      height: 185mm;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .invoice-container {
      width: 105mm;
      min-height: 185mm;
      max-width: 105mm;
      margin: 0 auto;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    /* Dark Navy Header Banner matching PDF */
    .header-banner {
      background: #0f172a !important;
      color: #ffffff;
      padding: 10px 6mm 10px 6mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-logo {
      width: 38px;
      height: 38px;
      object-fit: contain;
      border-radius: 50%;
      background: #ffffff;
      flex-shrink: 0;
    }
    .header-brand h1 {
      margin: 0;
      font-size: 14.5px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.01em;
    }
    .header-brand .sub {
      margin: 1px 0 0;
      font-size: 8.5px;
      color: #ffffff;
      font-weight: 500;
    }
    .header-brand .phone {
      margin: 2px 0 0;
      font-size: 7.5px;
      color: #e2e8f0;
    }
    .header-brand .addr {
      margin: 1px 0 0;
      font-size: 6.8px;
      color: #cbd5e1;
      max-width: 210px;
      line-height: 1.25;
    }

    .header-right {
      text-align: right;
    }
    .header-right .gst {
      margin: 0;
      font-size: 8px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.2px;
    }
    .header-right .inv-no {
      margin: 2px 0 0;
      font-size: 8.5px;
      font-weight: 800;
      color: #ffffff;
    }
    .header-right .date-time {
      margin: 2px 0 0;
      font-size: 7.5px;
      color: #cbd5e1;
    }

    /* Content Area below Banner */
    .content-area {
      padding: 8px 6mm 8px 6mm;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    /* Bill To Customer & Invoice Summary Box */
    .summary-card {
      background: #f8fafc !important;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 6px 9px;
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
      font-size: 8px;
      font-weight: 700;
      color: #64748b;
    }
    .card-name {
      margin: 0 0 1px;
      font-size: 10px;
      font-weight: 700;
      color: #0f172a;
    }
    .card-detail {
      margin: 0;
      font-size: 8.5px;
      color: #0f172a;
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
      font-size: 8.5px;
      font-weight: 700;
      padding: 4px 3px;
      text-align: left;
    }
    table.inv-table th:first-child {
      border-left: 1px solid #cbd5e1;
      border-top-left-radius: 3px;
      border-bottom-left-radius: 3px;
    }
    table.inv-table th:last-child {
      border-right: 1px solid #cbd5e1;
      border-top-right-radius: 3px;
      border-bottom-right-radius: 3px;
      text-align: right;
    }
    table.inv-table td {
      padding: 4px 3px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 8.5px;
      color: #0f172a;
    }

    /* Calculations & Totals */
    .calc-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
    }
    .totals-box {
      width: 185px;
      background: #f8fafc !important;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 6px 8px;
    }
    .tot-line {
      display: flex;
      justify-content: space-between;
      font-size: 8px;
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
      font-size: 9.5px;
      font-weight: 800;
      color: #0f172a;
      padding-top: 2px;
    }

    .signatory-wrap {
      margin-top: 10px;
      text-align: right;
    }
    .signatory-comp {
      margin: 0;
      font-size: 9px;
      font-weight: 700;
      color: #0f172a;
    }
    .signatory-title {
      margin: 14px 0 0;
      font-size: 7.5px;
      color: #64748b;
    }

    /* Terms & Conditions Footer */
    .terms-footer {
      margin-top: auto;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
    }
    .terms-title {
      margin: 0 0 3px;
      font-size: 8px;
      font-weight: 700;
      color: #0f172a;
    }
    .terms-list {
      margin: 0;
      padding-left: 10px;
      font-size: 6.8px;
      color: #475569;
      line-height: 1.35;
    }
    .terms-thanks {
      margin: 3px 0 0;
      font-size: 7px;
      color: #94a3b8;
      text-align: right;
    }

    @media print {
      body {
        margin: 0 !important;
        padding: 0 !important;
      }
      .invoice-container {
        width: 105mm !important;
        height: 185mm !important;
        max-height: 185mm !important;
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
          <p class="card-detail">Billed By: ${invoice.createdBy?.fullName || invoice.createdBy?.email || 'NH Stock Administrator'}</p>
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
            <p class="signatory-title">Authorised Signatory</p>
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
