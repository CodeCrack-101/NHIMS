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

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const logoDataUrl = await loadLogoAsDataUrl('/Logo.png')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14

  // Header Banner
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 38, 'F')

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginX, 6, 22, 22)
  }

  const titleX = logoDataUrl ? marginX + 26 : marginX
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('NH Wallpaper', titleX, 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Wallpaper Wholesaler', titleX, 16)

  doc.setFontSize(7.5)
  doc.setTextColor(226, 232, 240)
  doc.text('Mob: +91 8828251111, +91 9930317192', titleX, 21)
  doc.text(
    'Rani Residency, Shop No 02, Opp Apha Park Building Near Taj Darbar Hotel, Chirag Nagar, Ghatkopar (W), Mumbai 400086',
    titleX,
    26,
    { maxWidth: 100 }
  )

  // GST Number right above the Invoice Number
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('GSTIN: 27DXLPR9950M1ZB', pageWidth - marginX, 9, {
    align: 'right',
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(`Invoice: ${invoice.invoiceNumber}`, pageWidth - marginX, 14.5, {
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
  doc.setFontSize(8)
  doc.setTextColor(203, 213, 225)
  doc.text(`Date: ${dateFormatted}`, pageWidth - marginX, 20, {
    align: 'right',
  })
  doc.text(`Time: ${timeFormatted}`, pageWidth - marginX, 25, {
    align: 'right',
  })

  // Customer Details Box
  let currentY = 42
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.rect(marginX, currentY, pageWidth - marginX * 2, 22, 'FD')

  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('Bill To Customer', marginX + 5, currentY + 6)
  doc.text('Invoice Summary', pageWidth - marginX - 65, currentY + 6)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Name: ${invoice.customerName}`, marginX + 5, currentY + 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Mobile: +91 ${invoice.mobileNumber}`, marginX + 5, currentY + 19)

  doc.text(
    `Total Items: ${invoice.totalItems}  |  Total Qty: ${invoice.totalQuantity} Rolls`,
    pageWidth - marginX - 65,
    currentY + 13
  )
  doc.text(
    `Billed By: ${invoice.createdBy?.fullName || invoice.createdBy?.email || 'Admin'}`,
    pageWidth - marginX - 65,
    currentY + 19
  )

  // Table Header
  currentY = 69
  const drawTableHeader = (yPos) => {
    doc.setFillColor(241, 245, 249)
    doc.setDrawColor(203, 213, 225)
    doc.rect(marginX, yPos, pageWidth - marginX * 2, 9, 'FD')

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('Sr No', marginX + 4, yPos + 6)
    doc.text('Catalogue', marginX + 24, yPos + 6)
    doc.text('Pattern No.', marginX + 72, yPos + 6)
    doc.text('Qty', marginX + 110, yPos + 6)
    doc.text('Rate', marginX + 134, yPos + 6)
    doc.text('Amount', pageWidth - marginX - 4, yPos + 6, { align: 'right' })

    return yPos + 9
  }

  currentY = drawTableHeader(currentY)
  const rowHeight = 10

  ;(invoice.items || []).forEach((item, idx) => {
    if (currentY + rowHeight > pageHeight - 55) {
      doc.addPage()
      currentY = drawTableHeader(20)
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
    doc.setFontSize(9.5)
    doc.text(String(idx + 1), marginX + 4, currentY + 6.8)

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(
      formatCatalogueLabel(item.catalogueName || item.catalogueSlug),
      marginX + 24,
      currentY + 6.8
    )

    doc.text(String(item.patternNumber), marginX + 72, currentY + 6.8)

    doc.setFont('helvetica', 'normal')
    doc.text(`${item.quantity} Rolls`, marginX + 110, currentY + 6.8)
    doc.text(formatCurrencyPdf(item.rate), marginX + 134, currentY + 6.8)

    doc.setFont('helvetica', 'bold')
    doc.text(
      formatCurrencyPdf(item.subtotal),
      pageWidth - marginX - 4,
      currentY + 6.8,
      { align: 'right' }
    )

    currentY += rowHeight
  })

  // Terms & Conditions and Signature Section (Matching user reference photo)
  currentY += 8
  if (currentY + 65 > pageHeight - 15) {
    doc.addPage()
    currentY = 24
  }

  const termsBoxWidth = 110
  const summaryBoxWidth = 66
  const summaryBoxX = pageWidth - marginX - summaryBoxWidth

  // Right Box: Totals Summary
  const hasGst = Boolean(invoice.taxRate && invoice.taxRate > 0)
  const summaryBoxHeight = hasGst ? 38 : 34
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.rect(summaryBoxX, currentY, summaryBoxWidth, summaryBoxHeight, 'FD')

  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Subtotal:', summaryBoxX + 4, currentY + 7)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.text(
    formatCurrencyPdf(invoice.subtotal),
    pageWidth - marginX - 3,
    currentY + 7,
    { align: 'right' }
  )

  const discountLabel =
    invoice.discountType === 'PERCENTAGE' && invoice.discountValue > 0
      ? `Discount (${invoice.discountValue}%):`
      : 'Discount:'
  doc.setTextColor(71, 85, 105)
  doc.setFont('helvetica', 'normal')
  doc.text(discountLabel, summaryBoxX + 4, currentY + 14)
  doc.setTextColor(185, 28, 28)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `- ${formatCurrencyPdf(invoice.discountAmount || 0)}`,
    pageWidth - marginX - 3,
    currentY + 14,
    { align: 'right' }
  )

  let finalYOffset = currentY + 22
  if (hasGst) {
    doc.setTextColor(71, 85, 105)
    doc.setFont('helvetica', 'normal')
    doc.text(`GST (${invoice.taxRate}%):`, summaryBoxX + 4, currentY + 21)
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `+ ${formatCurrencyPdf(invoice.taxAmount || 0)}`,
      pageWidth - marginX - 3,
      currentY + 21,
      { align: 'right' }
    )
    finalYOffset = currentY + 28
  }

  doc.setDrawColor(203, 213, 225)
  doc.line(summaryBoxX + 3, finalYOffset - 3, pageWidth - marginX - 3, finalYOffset - 3)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Final Total:', summaryBoxX + 4, finalYOffset + 4)
  doc.text(
    formatCurrencyPdf(invoice.finalTotal),
    pageWidth - marginX - 3,
    finalYOffset + 4,
    { align: 'right' }
  )

  // Authorised Signatory box on the right below summary
  const sigY = currentY + 42
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('For NH Wallpaper', pageWidth - marginX - 5, sigY + 5, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Authorised Signatory', pageWidth - marginX - 5, sigY + 18, { align: 'right' })

  // EKE DAM NEECHE (Bottom of Page Footer): Terms & Conditions
  const bottomTermsY = pageHeight - 34

  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(marginX, bottomTermsY - 3, pageWidth - marginX, bottomTermsY - 3)

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('Terms & Conditions :', marginX, bottomTermsY + 2)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(71, 85, 105)
  doc.text('•  Subject to Mumbai Jurisdiction.', marginX, bottomTermsY + 7)
  doc.text('•  No complaint will be entertained after acceptance of the delivery.', marginX, bottomTermsY + 12)
  doc.text('•  Goods once sold will not be taken back or exchanged.', marginX, bottomTermsY + 17)
  doc.text('•  Our responsibility ceses after delivery of goods to the carriers.', marginX, bottomTermsY + 22)

  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text('Thank you for your business! — NH Wallpaper', pageWidth - marginX, bottomTermsY + 22, { align: 'right' })

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
        <td style="color:#475569;">${idx + 1}</td>
        <td style="padding-left:14px;"><strong>${formatCatalogueLabel(item.catalogueName || item.catalogueSlug)}</strong></td>
        <td><strong>${item.patternNumber}</strong></td>
        <td>${item.quantity} Rolls</td>
        <td>${formatCurrencyPdf(item.rate)}</td>
        <td style="text-align:right;"><strong>${formatCurrencyPdf(item.subtotal)}</strong></td>
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
      size: A4 portrait;
      margin: 0; /* Removes browser default headers (time, date, title) & footers (url, page) */
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .invoice-container {
      width: 100%;
      max-width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    /* Dark Navy Header Banner matching PDF */
    .header-banner {
      background: #0f172a !important;
      color: #ffffff;
      padding: 16px 14mm 16px 14mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .header-logo {
      width: 54px;
      height: 54px;
      object-fit: contain;
      border-radius: 50%;
      background: #ffffff;
      flex-shrink: 0;
    }
    .header-brand h1 {
      margin: 0;
      font-size: 21px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.01em;
    }
    .header-brand .sub {
      margin: 2px 0 0;
      font-size: 11px;
      color: #ffffff;
      font-weight: 500;
    }
    .header-brand .phone {
      margin: 3px 0 0;
      font-size: 10px;
      color: #e2e8f0;
    }
    .header-brand .addr {
      margin: 2px 0 0;
      font-size: 9.5px;
      color: #cbd5e1;
      max-width: 440px;
      line-height: 1.35;
    }

    .header-right {
      text-align: right;
    }
    .header-right .gst {
      margin: 0;
      font-size: 10.5px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.3px;
    }
    .header-right .inv-no {
      margin: 4px 0 0;
      font-size: 11.5px;
      font-weight: 800;
      color: #ffffff;
    }
    .header-right .date-time {
      margin: 3px 0 0;
      font-size: 10.5px;
      color: #cbd5e1;
    }

    /* Content Area below Banner */
    .content-area {
      padding: 12px 14mm 16px 14mm;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    /* Bill To Customer & Invoice Summary Box */
    .summary-card {
      background: #f8fafc !important;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 16px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
    }
    .card-col {
      display: flex;
      flex-direction: column;
    }
    .card-header-lbl {
      margin: 0 0 4px;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
    }
    .card-name {
      margin: 0 0 3px;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .card-detail {
      margin: 0;
      font-size: 12.5px;
      color: #0f172a;
    }

    /* Items Table */
    table.inv-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    table.inv-table th {
      background: #f1f5f9 !important;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      color: #0f172a;
      font-size: 12px;
      font-weight: 700;
      padding: 8px 10px;
      text-align: left;
    }
    table.inv-table th:first-child {
      border-left: 1px solid #cbd5e1;
      border-top-left-radius: 4px;
      border-bottom-left-radius: 4px;
      width: 48px;
    }
    table.inv-table th:last-child {
      border-right: 1px solid #cbd5e1;
      border-top-right-radius: 4px;
      border-bottom-right-radius: 4px;
      text-align: right;
    }
    table.inv-table td {
      padding: 9px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12.5px;
      color: #0f172a;
    }

    /* Calculations & Totals */
    .calc-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 6px;
    }
    .totals-box {
      width: 255px;
      background: #f8fafc !important;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 14px;
    }
    .tot-line {
      display: flex;
      justify-content: space-between;
      font-size: 11.5px;
      color: #475569;
      padding: 3px 0;
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
      margin: 6px 0;
    }
    .tot-final {
      display: flex;
      justify-content: space-between;
      font-size: 13.5px;
      font-weight: 800;
      color: #0f172a;
      padding-top: 2px;
    }

    .signatory-wrap {
      margin-top: 18px;
      text-align: right;
    }
    .signatory-comp {
      margin: 0;
      font-size: 12.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .signatory-title {
      margin: 22px 0 0;
      font-size: 10px;
      color: #64748b;
    }

    /* Terms & Conditions Footer */
    .terms-footer {
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
    }
    .terms-title {
      margin: 0 0 5px;
      font-size: 10.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .terms-list {
      margin: 0;
      padding-left: 14px;
      font-size: 9.5px;
      color: #475569;
      line-height: 1.55;
    }
    .terms-thanks {
      margin: 6px 0 0;
      font-size: 9.5px;
      color: #94a3b8;
      text-align: right;
    }

    @media print {
      body {
        margin: 0 !important;
        padding: 0 !important;
      }
      .invoice-container {
        width: 100% !important;
        min-height: 100vh !important;
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
          <p class="addr">Rani Residency, Shop No 02, Opp Apha Park Building Near Taj Darbar Hotel, Chirag Nagar, Ghatkopar (W), Mumbai 400086</p>
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
          <p class="card-detail">Total Items: ${invoice.totalItems} &nbsp;|&nbsp; Total Qty: ${invoice.totalQuantity} Rolls</p>
          <p class="card-detail">Billed By: ${invoice.createdBy?.fullName || invoice.createdBy?.email || 'NH Stock Administrator'}</p>
        </div>
      </div>

      <!-- Items Table -->
      <table class="inv-table">
        <thead>
          <tr>
            <th>Sr No</th>
            <th style="padding-left:14px;">Catalogue</th>
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
