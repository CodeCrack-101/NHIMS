import { jsPDF } from 'jspdf'

const getPdfThumbnailUrl = (url) => {
  if (!url) return ''
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace(
      /c_limit,f_auto,q_auto,w_\d+/,
      'c_fill,f_jpg,h_180,q_auto,w_180'
    )
  }
  return url
}

const fetchImageAsJpegDataUrl = (url) =>
  new Promise((resolve) => {
    if (!url) {
      resolve(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 160
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = getPdfThumbnailUrl(url)
  })

export const downloadStockOrderPdf = async ({
  catalogueSlug,
  reportTitle,
  items = [],
  fileName = 'Stock_Order_Report.pdf',
}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // Preload all pattern images in parallel
  const imageDataUrls = await Promise.all(
    items.map((item) => fetchImageAsJpegDataUrl(item.imagePath))
  )

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14

  const drawHeader = (isFirstPage) => {
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageWidth, 24, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('NH Wallpaper Stock', marginX, 11)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(reportTitle, marginX, 18)

    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    doc.text(`Date: ${dateStr}  |  Patterns: ${items.length}`, pageWidth - marginX, 15, {
      align: 'right',
    })

    const tableHeaderY = isFirstPage ? 30 : 30
    doc.setFillColor(241, 245, 249)
    doc.rect(marginX, tableHeaderY, pageWidth - marginX * 2, 9, 'F')

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text('#', marginX + 4, tableHeaderY + 6)
    doc.text('IMAGE', marginX + 18, tableHeaderY + 6)
    doc.text('PATTERN NUMBER', marginX + 52, tableHeaderY + 6)
    doc.text('QUANTITY', marginX + 115, tableHeaderY + 6)
    doc.text('STATUS', marginX + 152, tableHeaderY + 6)

    return tableHeaderY + 11
  }

  let currentY = drawHeader(true)
  const rowHeight = 24

  items.forEach((item, index) => {
    if (currentY + rowHeight > pageHeight - 14) {
      doc.addPage()
      currentY = drawHeader(false)
    }

    // Subtle row separator line
    doc.setDrawColor(226, 232, 240)
    doc.line(marginX, currentY + rowHeight, pageWidth - marginX, currentY + rowHeight)

    // 1. Index
    doc.setTextColor(71, 85, 105)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(String(index + 1), marginX + 4, currentY + 13)

    // 2. Pattern Thumbnail Image (20mm x 20mm)
    const imgData = imageDataUrls[index]
    if (imgData) {
      doc.addImage(imgData, 'JPEG', marginX + 18, currentY + 2, 20, 20)
      doc.setDrawColor(203, 213, 225)
      doc.rect(marginX + 18, currentY + 2, 20, 20)
    } else {
      doc.setDrawColor(203, 213, 225)
      doc.rect(marginX + 18, currentY + 2, 20, 20)
      doc.setFontSize(7)
      doc.text('No Img', marginX + 23, currentY + 13)
    }

    // 3. Pattern Number
    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.text(String(item.patternNumber), marginX + 52, currentY + 13)

    // 4. Stock Quantity & 5. Status (High / Medium / Low)
    let statusLabel = 'High'
    if (item.quantity < 10) {
      statusLabel = 'Low'
      doc.setTextColor(185, 28, 28)
    } else if (item.quantity < 60) {
      statusLabel = 'Medium'
      doc.setTextColor(180, 83, 9)
    } else {
      statusLabel = 'High'
      doc.setTextColor(21, 128, 61)
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.text(`${item.quantity} Rolls`, marginX + 115, currentY + 13)
    doc.text(statusLabel, marginX + 152, currentY + 13)

    currentY += rowHeight
  })

  doc.save(fileName)
}
