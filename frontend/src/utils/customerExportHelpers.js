import jsPDF from 'jspdf'
import { generateCsvContent } from '../utils/exportHelpers.js'

/**
 * Trigger browser file download
 */
export const downloadBlobFile = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Export Customer List to CSV
 */
export const exportCustomersListCsv = (customers, filename = 'NH_Wallpaper_Customers.csv') => {
  if (!customers || customers.length === 0) return
  const rows = customers.map((c, idx) => ({
    'Sr No': idx + 1,
    'Customer Name': c.customerName || 'N/A',
    'Mobile Number': c.mobileNumber ? `="${c.mobileNumber}"` : 'N/A',
    'Total Bills': c.totalInvoices || 0,
    'Total Rolls Purchased': c.totalQuantity || 0,
    'Total Spend (Rs)': Number(c.totalSpend || 0).toFixed(2),
    'First Purchase': c.firstPurchaseDate ? new Date(c.firstPurchaseDate).toLocaleDateString('en-IN') : 'N/A',
    'Last Purchase': c.lastPurchaseDate ? new Date(c.lastPurchaseDate).toLocaleDateString('en-IN') : 'N/A',
  }))

  const csv = generateCsvContent(rows)
  downloadBlobFile(csv, filename, 'text/csv;charset=utf-8;')
}

/**
 * Export a Single Customer's Bills to CSV
 */
export const exportCustomerBillsCsv = (customer, bills, filename) => {
  if (!bills || bills.length === 0) return
  const rows = bills.map((b, idx) => ({
    'Sr No': idx + 1,
    'Invoice Number': b.invoiceNumber,
    'Invoice Date': new Date(b.invoiceDate).toLocaleDateString('en-IN'),
    'Customer Name': b.customerName,
    'Mobile Number': b.mobileNumber ? `="${b.mobileNumber}"` : 'N/A',
    'Items Summary': (b.items || [])
      .map((it) => `${it.catalogueName} (${it.patternNumber}) x ${it.quantity}`)
      .join(' | '),
    'Total Items': b.totalItems,
    'Total Quantity': b.totalQuantity,
    'Subtotal (Rs)': Number(b.subtotal || 0).toFixed(2),
    'Discount (Rs)': Number(b.discountAmount || 0).toFixed(2),
    'Tax (Rs)': Number(b.taxAmount || 0).toFixed(2),
    'Grand Total (Rs)': Number(b.finalTotal ?? b.grandTotal ?? 0).toFixed(2),
  }))

  const finalName =
    filename ||
    `Customer_Bills_${(customer?.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '_')}_${customer?.mobileNumber || ''}.csv`

  const csv = generateCsvContent(rows)
  downloadBlobFile(csv, finalName, 'text/csv;charset=utf-8;')
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
 * Generate a PDF Statement for a Customer's Billing History
 */
export const generateCustomerStatementPdf = async (customer, bills) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14

  const logoDataUrl = await loadLogoAsDataUrl('/Logo.png')

  // Top Dark Navy Header Banner
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 36, 'F')

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginX, 5, 22, 22)
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
    { maxWidth: 105 }
  )

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('CUSTOMER STATEMENT', pageWidth - marginX, 14, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(203, 213, 225)
  doc.text(
    `Date: ${new Date().toLocaleDateString('en-IN')}`,
    pageWidth - marginX,
    20,
    { align: 'right' }
  )

  let y = 43

  // Customer Details Box
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 24, 2, 2, 'FD')

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Customer Information', marginX + 4, y + 6)
  doc.text('Statement Summary', pageWidth / 2 + 6, y + 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Name: ${customer?.customerName || 'N/A'}`, marginX + 4, y + 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(71, 85, 105)
  doc.text(`Mobile: +91 ${customer?.mobileNumber || 'N/A'}`, marginX + 4, y + 19)

  const totalSpend = (bills || []).reduce(
    (acc, b) => acc + (Number(b.finalTotal ?? b.grandTotal) || 0),
    0
  )
  const totalRolls = (bills || []).reduce(
    (acc, b) => acc + (Number(b.totalQuantity) || 0),
    0
  )

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `Total Invoices: ${bills?.length || 0}  |  Total Rolls: ${totalRolls}`,
    pageWidth / 2 + 6,
    y + 13
  )
  doc.setFont('helvetica', 'bold')
  doc.text(
    `Total Purchases: Rs. ${totalSpend.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    pageWidth / 2 + 6,
    y + 19
  )

  // Invoices Table
  y += 32
  doc.setFillColor(241, 245, 249)
  doc.setDrawColor(203, 213, 225)
  doc.rect(marginX, y, pageWidth - marginX * 2, 9, 'FD')

  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Sr No', marginX + 4, y + 6)
  doc.text('Invoice No', marginX + 20, y + 6)
  doc.text('Date', marginX + 66, y + 6)
  doc.text('Rolls', marginX + 96, y + 6)
  doc.text('Subtotal', marginX + 122, y + 6)
  doc.text('Final Total (Rs)', pageWidth - marginX - 4, y + 6, { align: 'right' })

  y += 9
  const rowHeight = 8.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)

  ;(bills || []).forEach((b, idx) => {
    if (y + rowHeight > pageHeight - 38) {
      doc.addPage()
      y = 20
      // Table header on new page
      doc.setFillColor(241, 245, 249)
      doc.setDrawColor(203, 213, 225)
      doc.rect(marginX, y, pageWidth - marginX * 2, 9, 'FD')
      doc.setTextColor(15, 23, 42)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Sr No', marginX + 4, y + 6)
      doc.text('Invoice No', marginX + 20, y + 6)
      doc.text('Date', marginX + 66, y + 6)
      doc.text('Rolls', marginX + 96, y + 6)
      doc.text('Subtotal', marginX + 122, y + 6)
      doc.text('Final Total (Rs)', pageWidth - marginX - 4, y + 6, { align: 'right' })
      y += 9
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
    }

    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252)
    doc.rect(marginX, y, pageWidth - marginX * 2, rowHeight, 'F')
    doc.setDrawColor(241, 245, 249)
    doc.line(marginX, y + rowHeight, pageWidth - marginX, y + rowHeight)

    doc.setTextColor(71, 85, 105)
    doc.text(String(idx + 1), marginX + 4, y + 5.5)

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(String(b.invoiceNumber || ''), marginX + 20, y + 5.5)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    const invDate = b.invoiceDate ? new Date(b.invoiceDate).toLocaleDateString('en-IN') : 'N/A'
    doc.text(invDate, marginX + 66, y + 5.5)
    doc.text(String(b.totalQuantity || 0), marginX + 98, y + 5.5)

    const sub = Number(b.subtotal || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    doc.text(`Rs. ${sub}`, marginX + 122, y + 5.5)

    const fin = Number(b.finalTotal ?? b.grandTotal ?? 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(`Rs. ${fin}`, pageWidth - marginX - 4, y + 5.5, { align: 'right' })

    y += rowHeight
  })

  // Summary row at bottom of table
  y += 4
  doc.setFillColor(241, 245, 249)
  doc.setDrawColor(203, 213, 225)
  doc.rect(marginX, y, pageWidth - marginX * 2, 9, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)
  doc.text('Total Lifetime Purchases:', marginX + 4, y + 6)
  doc.text(
    `Rs. ${totalSpend.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    pageWidth - marginX - 4,
    y + 6,
    { align: 'right' }
  )

  // Signatory & Footer
  const sigY = y + 14
  if (sigY + 25 <= pageHeight - 15) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(15, 23, 42)
    doc.text('For NH Wallpaper', pageWidth - marginX - 4, sigY + 5, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text('Authorised Signatory', pageWidth - marginX - 4, sigY + 16, { align: 'right' })
  }

  const bottomTermsY = pageHeight - 18
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.4)
  doc.line(marginX, bottomTermsY - 2, pageWidth - marginX, bottomTermsY - 2)

  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text('NH Wallpaper — Wholesaler & Supplier', marginX, bottomTermsY + 4)
  doc.text('Thank you for your business!', pageWidth - marginX, bottomTermsY + 4, { align: 'right' })

  const pdfFileName = `Statement_${(customer?.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '_')}_${customer?.mobileNumber || ''}.pdf`
  doc.save(pdfFileName)
}
