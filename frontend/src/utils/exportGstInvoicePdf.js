import { jsPDF } from 'jspdf'

const formatINR = (val) => {
  const num = Number(val) || 0
  return `₹ ${num.toLocaleString('en-IN', {
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

/**
 * Standard A4 GST Tax Invoice Generator
 * Follows the EXACT structure and typography shown in the user's reference image
 */
export const generateGstTaxInvoicePdfDoc = async (inv) => {
  if (!inv) return null

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210 x 297 mm
  })

  const logoDataUrl = await loadLogoAsDataUrl('/Logo.png')
  const pageWidth = 210
  const marginX = 10
  const usableWidth = pageWidth - marginX * 2 // 190 mm
  let currentY = 10

  // 1. Top "Tax Invoice" Bar
  doc.setDrawColor(51, 65, 85)
  doc.setLineWidth(0.35)
  doc.rect(marginX, currentY, usableWidth, 8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('Tax Invoice', pageWidth / 2, currentY + 5.5, { align: 'center' })
  currentY += 8

  // 2. Header Box: Left = NH Wallpaper details, Right = Invoice No, Date, Place of Supply
  const headerBoxHeight = 36
  doc.rect(marginX, currentY, usableWidth, headerBoxHeight)

  const headerSplitX = marginX + 125
  doc.line(headerSplitX, currentY, headerSplitX, currentY + headerBoxHeight)

  // Company Logo & Details (Left)
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', marginX + 3, currentY + 3, 20, 20)
  }

  const compTextX = logoDataUrl ? marginX + 26 : marginX + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text('NH WALLPAPER', compTextX, currentY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(51, 65, 85)
  doc.text(
    'Rani Residency, Shop No. 2-3, Opp Alpha park Building Near Taj Darbar Hotel\nChirag Nagar Ghatkopar (w) Mumbai - 400086',
    compTextX,
    currentY + 10.5,
    { maxWidth: 95 }
  )

  doc.text('Phone: 8828251111', compTextX, currentY + 20)
  doc.text('Email: wallpaper9511@gmail.com', compTextX + 45, currentY + 20)

  doc.setFont('helvetica', 'bold')
  doc.text('GSTIN: 27DXLPR9950M1ZB', compTextX, currentY + 25)
  doc.text('State: 27-Maharashtra', compTextX + 45, currentY + 25)

  // Invoice Meta (Right side)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)

  doc.text('Invoice No: ', headerSplitX + 4, currentY + 7)
  doc.setFont('helvetica', 'bold')
  doc.text(String(inv.invoiceNumber || ''), headerSplitX + 22, currentY + 7)

  doc.setFont('helvetica', 'normal')
  const invDate = new Date(inv.invoiceDate || Date.now()).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  doc.text(`Date: ${invDate}`, headerSplitX + 4, currentY + 13)

  doc.text('Place of Supply: ', headerSplitX + 4, currentY + 19)
  doc.setFont('helvetica', 'bold')
  doc.text(String(inv.placeOfSupply || '27-Maharashtra'), headerSplitX + 4, currentY + 24, {
    maxWidth: 55,
  })

  currentY += headerBoxHeight

  // 3. Bill To & Ship To Boxes
  const billBoxHeight = 38
  doc.rect(marginX, currentY, usableWidth, billBoxHeight)

  const halfWidth = usableWidth / 2
  const midX = marginX + halfWidth
  doc.line(midX, currentY, midX, currentY + billBoxHeight)

  // Bill To (Left)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text('Bill To:', marginX + 3, currentY + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text(String(inv.billTo?.firmName || '').toUpperCase(), marginX + 3, currentY + 10, {
    maxWidth: halfWidth - 6,
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(51, 65, 85)
  const billAddr = [inv.billTo?.address, inv.billTo?.city, inv.billTo?.state, inv.billTo?.pincode]
    .filter(Boolean)
    .join(', ')
  doc.text(billAddr || 'India', marginX + 3, currentY + 15, { maxWidth: halfWidth - 6 })

  doc.text(`Contact No: ${inv.billTo?.contactNumber || 'N/A'}`, marginX + 3, currentY + 25)
  if (inv.billTo?.gstin) {
    doc.setFont('helvetica', 'bold')
    doc.text(`GSTIN Number: ${inv.billTo.gstin}`, marginX + 3, currentY + 29)
  }
  doc.setFont('helvetica', 'normal')
  doc.text(`State: ${inv.billTo?.stateCode ? `${inv.billTo.stateCode}-` : ''}${inv.billTo?.state || inv.placeOfSupply}`, marginX + 3, currentY + 33)

  // Ship To (Right)
  const ship = inv.shipTo || inv.billTo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text('Ship To:', midX + 3, currentY + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text(String(ship?.firmName || '').toUpperCase(), midX + 3, currentY + 10, {
    maxWidth: halfWidth - 6,
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(51, 65, 85)
  const shipAddr = [ship?.address, ship?.city, ship?.state, ship?.pincode].filter(Boolean).join(', ')
  doc.text(shipAddr || 'India', midX + 3, currentY + 15, { maxWidth: halfWidth - 6 })

  doc.text(`Contact: ${ship?.contactNumber || 'N/A'}`, midX + 3, currentY + 25)
  if (ship?.gstin) {
    doc.setFont('helvetica', 'bold')
    doc.text(`GSTIN/UIN: ${ship.gstin}`, midX + 3, currentY + 29)
  }
  doc.setFont('helvetica', 'normal')
  doc.text(`State Name: ${ship?.state || inv.placeOfSupply}`, midX + 3, currentY + 33)

  currentY += billBoxHeight

  // 4. Items Table
  // Columns: # | Item Name | HSN/SAC | Quantity | Unit | Price/Unit (₹) | GST(₹) | Amount (₹)
  const items = inv.items || []
  const colDef = [
    { header: '#', width: 8, align: 'center' },
    { header: 'Item Name', width: 62, align: 'left' },
    { header: 'HSN/SAC', width: 20, align: 'center' },
    { header: 'Quantity', width: 18, align: 'right' },
    { header: 'Unit', width: 14, align: 'center' },
    { header: 'Price/\nUnit (₹)', width: 22, align: 'right' },
    { header: 'GST(₹)', width: 22, align: 'right' },
    { header: 'Amount\n(₹)', width: 24, align: 'right' },
  ]

  // Render Table Header
  const thHeight = 9
  doc.setFillColor(248, 250, 252)
  doc.rect(marginX, currentY, usableWidth, thHeight, 'FD')

  let colCursorX = marginX
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(15, 23, 42)

  colDef.forEach((col) => {
    const textX =
      col.align === 'center'
        ? colCursorX + col.width / 2
        : col.align === 'right'
        ? colCursorX + col.width - 2
        : colCursorX + 2
    doc.text(col.header, textX, currentY + 4, { align: col.align })
    colCursorX += col.width
    if (colCursorX < marginX + usableWidth) {
      doc.line(colCursorX, currentY, colCursorX, currentY + thHeight)
    }
  })

  currentY += thHeight
  const tableStartY = currentY

  // Table Rows
  const rowHeight = 8.5
  items.forEach((it, idx) => {
    let x = marginX
    const yText = currentY + 5.5

    // #
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(15, 23, 42)
    doc.text(String(idx + 1), x + colDef[0].width / 2, yText, { align: 'center' })
    x += colDef[0].width

    // Item Name
    doc.setFont('helvetica', 'bold')
    doc.text(String(it.itemName || ''), x + 2, yText, { maxWidth: colDef[1].width - 4 })
    x += colDef[1].width

    // HSN/SAC
    doc.setFont('helvetica', 'normal')
    doc.text(String(it.hsnCode || '39219099'), x + colDef[2].width / 2, yText, { align: 'center' })
    x += colDef[2].width

    // Quantity
    doc.text(String(it.quantity || 0), x + colDef[3].width - 2, yText, { align: 'right' })
    x += colDef[3].width

    // Unit
    doc.text(String(it.unit || 'Rol'), x + colDef[4].width / 2, yText, { align: 'center' })
    x += colDef[4].width

    // Price/Unit
    doc.text(`₹ ${Number(it.pricePerUnit || 0).toFixed(2)}`, x + colDef[5].width - 2, yText, {
      align: 'right',
    })
    x += colDef[5].width

    // GST(₹) & Rate %
    const gstAmtStr = `₹ ${Number(it.gstAmount || 0).toFixed(2)}`
    const gstRateStr = `(${Number(it.gstRate || 0).toFixed(1)}%)`
    doc.text(`${gstAmtStr}\n${gstRateStr}`, x + colDef[6].width - 2, currentY + 3.5, {
      align: 'right',
    })
    x += colDef[6].width

    // Amount
    doc.setFont('helvetica', 'bold')
    doc.text(`₹ ${Number(it.totalAmount || 0).toFixed(2)}`, x + colDef[7].width - 2, yText, {
      align: 'right',
    })

    currentY += rowHeight
    doc.setDrawColor(226, 232, 240)
    doc.line(marginX, currentY, marginX + usableWidth, currentY)
  })

  // Table Totals Row (Total quantity, Total GST, Total Amount)
  const totalsRowHeight = 8.5
  doc.setFillColor(248, 250, 252)
  doc.rect(marginX, currentY, usableWidth, totalsRowHeight, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 23, 42)
  doc.text('Total', marginX + 4, currentY + 5.5)

  // Total Quantity column position
  const qtyColX = marginX + colDef[0].width + colDef[1].width + colDef[2].width
  doc.text(String(inv.totalQuantity || 0), qtyColX + colDef[3].width - 2, currentY + 5.5, {
    align: 'right',
  })

  // Total Tax column position
  const taxColX = qtyColX + colDef[3].width + colDef[4].width + colDef[5].width
  doc.text(`₹ ${Number(inv.totalTax || 0).toFixed(2)}`, taxColX + colDef[6].width - 2, currentY + 5.5, {
    align: 'right',
  })

  // Final Total column position
  const amtColX = taxColX + colDef[6].width
  doc.text(`₹ ${Number(inv.finalTotal || 0).toFixed(2)}`, amtColX + colDef[7].width - 2, currentY + 5.5, {
    align: 'right',
  })

  // Table outer vertical lines
  currentY += totalsRowHeight
  doc.setDrawColor(51, 65, 85)
  doc.rect(marginX, tableStartY - thHeight, usableWidth, currentY - (tableStartY - thHeight))

  let vx = marginX
  colDef.forEach((col) => {
    vx += col.width
    if (vx < marginX + usableWidth) {
      doc.line(vx, tableStartY - thHeight, vx, currentY)
    }
  })

  // 5. Sub Total & Words Box
  const summaryBoxHeight = 16
  doc.rect(marginX, currentY, usableWidth, summaryBoxHeight)
  const sumMidX = marginX + 85
  doc.line(sumMidX, currentY, sumMidX, currentY + summaryBoxHeight)

  doc.line(marginX, currentY + 8, marginX + usableWidth, currentY + 8)

  // Sub Total (Row 1 Left)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(`Sub Total: ₹ ${Number(inv.subTotal || 0).toFixed(2)}`, marginX + 3, currentY + 5.5)

  // Total in Words (Row 1 Right)
  doc.setFont('helvetica', 'bold')
  doc.text(
    `Total: ₹ ${Number(inv.finalTotal || 0).toFixed(2)} (${inv.finalTotalInWords || ''})`,
    sumMidX + 3,
    currentY + 5.5,
    { maxWidth: usableWidth - 88 }
  )

  // Received & Balance (Row 2)
  doc.setFont('helvetica', 'normal')
  doc.text(`Received: ₹ ${Number(inv.receivedAmount || 0).toFixed(2)}`, marginX + 3, currentY + 13.5)
  doc.text(`Balance: ₹ ${Number(inv.balanceAmount || 0).toFixed(2)}`, sumMidX + 3, currentY + 13.5)

  currentY += summaryBoxHeight + 4

  // 6. Tax Breakdown Table (HSN/SAC wise) + Payment Mode Box
  const taxTableW = 120
  const taxBoxX = marginX
  const taxThH = 7

  // Tax breakdown Table
  doc.setDrawColor(51, 65, 85)
  doc.rect(taxBoxX, currentY, taxTableW, 24)

  // Header of Tax breakdown
  doc.setFillColor(248, 250, 252)
  doc.rect(taxBoxX, currentY, taxTableW, taxThH, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(15, 23, 42)

  // Columns for tax table: HSN/SAC (25mm) | Taxable Amount (30mm) | IGST / CGST+SGST (35mm) | Total Tax (30mm)
  doc.text('HSN/\nSAC', taxBoxX + 12.5, currentY + 3.2, { align: 'center' })
  doc.text('Taxable\nAmount (₹)', taxBoxX + 40, currentY + 3.2, { align: 'center' })
  doc.text(inv.isInterState ? 'IGST' : 'CGST + SGST', taxBoxX + 72.5, currentY + 4.5, { align: 'center' })
  doc.text('Total Tax(₹)', taxBoxX + 105, currentY + 4.5, { align: 'center' })

  doc.line(taxBoxX + 25, currentY, taxBoxX + 25, currentY + 24)
  doc.line(taxBoxX + 55, currentY, taxBoxX + 55, currentY + 24)
  doc.line(taxBoxX + 90, currentY, taxBoxX + 90, currentY + 24)
  doc.line(taxBoxX, currentY + taxThH, taxBoxX + taxTableW, currentY + taxThH)

  // Data row for Tax breakdown
  const taxRowY = currentY + taxThH + 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(String(items[0]?.hsnCode || '39219099'), taxBoxX + 12.5, taxRowY, { align: 'center' })
  doc.text(Number(inv.subTotal || 0).toFixed(2), taxBoxX + 52, taxRowY, { align: 'right' })

  if (inv.isInterState) {
    doc.text(`18.0% | ${Number(inv.igstAmount || inv.totalTax || 0).toFixed(2)}`, taxBoxX + 88, taxRowY, {
      align: 'right',
    })
  } else {
    doc.text(
      `C: ${Number(inv.cgstAmount || 0).toFixed(2)} | S: ${Number(inv.sgstAmount || 0).toFixed(2)}`,
      taxBoxX + 88,
      taxRowY,
      { align: 'right' }
    )
  }
  doc.text(Number(inv.totalTax || 0).toFixed(2), taxBoxX + taxTableW - 3, taxRowY, { align: 'right' })

  // Total row for Tax breakdown
  const taxTotalY = currentY + 16
  doc.line(taxBoxX, taxTotalY, taxBoxX + taxTableW, taxTotalY)
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL', taxBoxX + 12.5, taxTotalY + 5, { align: 'center' })
  doc.text(Number(inv.subTotal || 0).toFixed(2), taxBoxX + 52, taxTotalY + 5, { align: 'right' })
  doc.text(Number(inv.totalTax || 0).toFixed(2), taxBoxX + 88, taxTotalY + 5, { align: 'right' })
  doc.text(Number(inv.totalTax || 0).toFixed(2), taxBoxX + taxTableW - 3, taxTotalY + 5, {
    align: 'right',
  })

  // Payment Mode Box (Right of tax table)
  const payBoxX = taxBoxX + taxTableW + 6
  const payBoxW = usableWidth - taxTableW - 6
  doc.rect(payBoxX, currentY, payBoxW, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Payment Mode: ', payBoxX + 4, currentY + 6.5)
  doc.setFont('helvetica', 'bold')
  doc.text(String(inv.paymentMode || 'Gpay'), payBoxX + 27, currentY + 6.5)

  // Payment Status Stamp (PAID or UNPAID)
  const statusStampY = currentY + 12
  const isPaid = (inv.paymentStatus || 'PAID') === 'PAID'
  if (isPaid) {
    doc.setFillColor(240, 253, 244)
    doc.setDrawColor(34, 197, 94)
    doc.setLineWidth(0.5)
    doc.roundedRect(payBoxX, statusStampY, payBoxW, 12, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(22, 163, 74)
    doc.text('PAID', payBoxX + payBoxW / 2, statusStampY + 5.5, { align: 'center' })
    doc.setFontSize(5.5)
    doc.text('AMOUNT RECEIVED', payBoxX + payBoxW / 2, statusStampY + 9.5, { align: 'center' })
  } else {
    doc.setFillColor(254, 242, 242)
    doc.setDrawColor(239, 68, 68)
    doc.setLineWidth(0.5)
    doc.roundedRect(payBoxX, statusStampY, payBoxW, 12, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(220, 38, 38)
    doc.text('UNPAID', payBoxX + payBoxW / 2, statusStampY + 5.5, { align: 'center' })
    doc.setFontSize(5.5)
    doc.text('PAYMENT DUE', payBoxX + payBoxW / 2, statusStampY + 9.5, { align: 'center' })
  }

  currentY += 28

  // 7. Signature Box (Exact match with photo: "For NH WALLPAPER:" + Signature + "Authorized Signatory")
  const sigBoxW = 95
  const sigBoxH = 34
  const sigBoxX = pageWidth - marginX - sigBoxW
  doc.setDrawColor(51, 65, 85)
  doc.setLineWidth(0.35)
  doc.rect(sigBoxX, currentY, sigBoxW, sigBoxH)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text('For NH WALLPAPER:', sigBoxX + 4, currentY + 6)

  // Artistic Signatory Line (vector signature placeholder matching photo)
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.4)
  const signBaseX = sigBoxX + sigBoxW / 2 - 15
  const signBaseY = currentY + 18
  doc.lines(
    [
      [4, -8],
      [3, 7],
      [4, -10],
      [5, 9],
      [6, -6],
      [8, 5],
      [15, -2],
      [-25, 4],
    ],
    signBaseX,
    signBaseY
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text('Authorized Signatory', sigBoxX + sigBoxW / 2, currentY + sigBoxH - 4, { align: 'center' })

  return doc
}

export const downloadGstInvoicePdf = async (invoice) => {
  if (!invoice) return
  const doc = await generateGstTaxInvoicePdfDoc(invoice)
  if (!doc) return
  doc.save(`GST_Invoice_${invoice.invoiceNumber}.pdf`)
}

export const printGstInvoiceDocument = async (invoice) => {
  if (!invoice) return
  const doc = await generateGstTaxInvoicePdfDoc(invoice)
  if (!doc) return

  const blob = doc.output('blob')
  const blobUrl = URL.createObjectURL(blob)

  let printIframe = document.getElementById('gst-invoice-print-frame')
  if (!printIframe) {
    printIframe = document.createElement('iframe')
    printIframe.id = 'gst-invoice-print-frame'
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
      } catch {
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
