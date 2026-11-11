import { zipSync, strToU8 } from 'fflate'
import jsPDF from 'jspdf'

/**
 * Generate CSV string from array of objects
 */
export const generateCsvContent = (rows) => {
  if (!rows || rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const csvRows = [headers.join(',')]

  for (const row of rows) {
    const values = headers.map((header) => {
      const val = row[header] === null || row[header] === undefined ? '' : String(row[header])
      const escaped = val.replace(/"/g, '""')
      return `"${escaped}"`
    })
    csvRows.push(values.join(','))
  }

  return csvRows.join('\r\n')
}

/**
 * Generate HTML Table for Excel workbook with 8 sheets
 */
export const generateMultiSheetExcelXml = ({
  invoices = [],
  flatItems = [],
  catalogueSummary = [],
  patternSummary = [],
  dailySales = [],
  summary = {},
}) => {
  const sanitize = (val) => {
    if (val === null || val === undefined) return ''
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  // Helper to build worksheet XML
  const buildWorksheetXml = (sheetName, headers, rows) => {
    let rowsXml = `<Row ss:StyleID="HeaderStyle">`
    headers.forEach((h) => {
      rowsXml += `<Cell><Data ss:Type="String">${sanitize(h)}</Data></Cell>`
    })
    rowsXml += `</Row>`

    rows.forEach((row) => {
      rowsXml += `<Row>`
      headers.forEach((h) => {
        const val = row[h]
        const isNum = typeof val === 'number'
        rowsXml += `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${sanitize(val)}</Data></Cell>`
      })
      rowsXml += `</Row>`
    })

    return `
      <Worksheet ss:Name="${sanitize(sheetName)}">
        <Table>
          ${rowsXml}
        </Table>
      </Worksheet>
    `
  }

  // 1. Invoice Summary
  const invoiceSummaryRows = invoices.map((inv) => ({
    'Invoice Number': inv.invoiceNumber,
    'Date': new Date(inv.invoiceDate).toLocaleDateString(),
    'Customer Name': inv.customerName,
    'Mobile Number': inv.mobileNumber,
    'Total Rolls': inv.totalQuantity,
    'Subtotal (INR)': inv.subtotal,
    'Discount (INR)': inv.discountAmount,
    'Final Total (INR)': inv.finalTotal,
  }))

  // 2. Invoice Items
  const invoiceItemsRows = flatItems.map((item) => ({
    'Invoice Number': item.invoiceNumber,
    'Customer': item.customerName,
    'Catalogue': item.catalogueName,
    'Pattern Number': item.patternNumber,
    'Quantity': item.quantity,
    'Rate (INR)': item.rate,
    'Subtotal (INR)': item.subtotal,
  }))

  // 3. Catalogue Summary
  const catalogueRows = catalogueSummary.map((cat) => ({
    'Catalogue Name': cat.catalogueName,
    'Total Rolls Sold': cat.rollsCount,
    'Total Revenue (INR)': cat.revenue,
  }))

  // 4. Pattern-wise Sales
  const patternRows = patternSummary.map((p) => ({
    'Pattern': p.patternKey || p.patternNumber,
    'Total Rolls Sold': p.rollsCount,
    'Total Revenue (INR)': p.revenue,
  }))

  // 5. Daily Sales
  const dailyRows = dailySales.map((d) => ({
    'Date': d.date || d._id,
    'Rolls Sold': d.rollsSold,
    'Revenue (INR)': d.totalSales,
  }))

  // 6. Monthly Sales
  const monthlyRows = [
    {
      'Metric': 'Total Invoices Count',
      'Value': summary.totalBills || invoices.length,
    },
    {
      'Metric': 'Total Rolls Sold',
      'Value': summary.totalRollsSold || 0,
    },
    {
      'Metric': 'Total Revenue',
      'Value': summary.totalSales || 0,
    },
  ]

  // 7. Customer Summary
  const customerMap = new Map()
  invoices.forEach((inv) => {
    const prev = customerMap.get(inv.mobileNumber) || {
      'Customer Name': inv.customerName,
      'Mobile': inv.mobileNumber,
      'Total Bills': 0,
      'Total Rolls': 0,
      'Total Spent': 0,
    }
    prev['Total Bills'] += 1
    prev['Total Rolls'] += inv.totalQuantity
    prev['Total Spent'] += inv.finalTotal
    customerMap.set(inv.mobileNumber, prev)
  })
  const customerRows = Array.from(customerMap.values())

  // 8. Discount Summary
  const discountRows = invoices.map((inv) => ({
    'Invoice Number': inv.invoiceNumber,
    'Customer Name': inv.customerName,
    'Discount Value': inv.discountValue,
    'Discount Type': inv.discountType,
    'Discount Amount (INR)': inv.discountAmount,
  }))

  const xmlContent = `<?xml version="1.0"?>
  <?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
    xmlns:html="http://www.w3.org/TR/REC-html40">
    <Styles>
      <Style ss:ID="Default" ss:Name="Normal">
        <Alignment ss:Vertical="Bottom"/>
        <Borders/>
        <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
        <Interior/>
        <NumberFormat/>
        <Protection/>
      </Style>
      <Style ss:ID="HeaderStyle">
        <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
        <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
        <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      </Style>
    </Styles>
    ${buildWorksheetXml('Invoice Summary', Object.keys(invoiceSummaryRows[0] || { 'Invoice Number': '' }), invoiceSummaryRows)}
    ${buildWorksheetXml('Invoice Items', Object.keys(invoiceItemsRows[0] || { 'Invoice Number': '' }), invoiceItemsRows)}
    ${buildWorksheetXml('Catalogue Summary', Object.keys(catalogueRows[0] || { 'Catalogue Name': '' }), catalogueRows)}
    ${buildWorksheetXml('Pattern-wise Sales', Object.keys(patternRows[0] || { 'Pattern': '' }), patternRows)}
    ${buildWorksheetXml('Daily Sales', Object.keys(dailyRows[0] || { 'Date': '' }), dailyRows)}
    ${buildWorksheetXml('Monthly Sales', Object.keys(monthlyRows[0] || { 'Metric': '' }), monthlyRows)}
    ${buildWorksheetXml('Customer Summary', Object.keys(customerRows[0] || { 'Customer Name': '' }), customerRows)}
    ${buildWorksheetXml('Discount Summary', Object.keys(discountRows[0] || { 'Invoice Number': '' }), discountRows)}
  </Workbook>`

  return xmlContent
}

/**
 * Generate PDF Report using jsPDF
 */
export const generateReportsPdf = ({
  filters = {},
  summary = {},
  invoices = [],
}) => {
  const doc = new jsPDF()
  const pageHeight = doc.internal.pageSize.height

  // Brand Header
  doc.setFontSize(18)
  doc.setTextColor(30, 41, 59)
  doc.text('NH ENTERPRISE – AUDIT & BILLING REPORT', 14, 20)

  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(`Generated On: ${new Date().toLocaleString()}`, 14, 27)
  doc.text(
    `Filter Applied: ${filters.filterType || 'Default'} | Catalogue: ${
      filters.catalogue || 'All'
    } | Pattern: ${filters.patternNumber || 'All'}`,
    14,
    33
  )

  // Summary Cards Bar
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(14, 38, 182, 22, 2, 2, 'FD')

  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(`Total Bills: ${summary.totalBills || 0}`, 20, 50)
  doc.text(`Rolls Sold: ${summary.totalRollsSold || 0}`, 65, 50)
  doc.text(`Revenue: Rs ${summary.totalSales || 0}`, 110, 50)
  doc.text(`Discounts: Rs ${summary.totalDiscount || 0}`, 155, 50)

  // Table header
  let y = 70
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('Recent Invoices Statement', 14, y)

  y += 7
  doc.setFillColor(241, 245, 249)
  doc.rect(14, y - 4, 182, 7, 'F')
  doc.setFontSize(8)
  doc.text('INVOICE NO', 16, y)
  doc.text('DATE', 55, y)
  doc.text('CUSTOMER', 85, y)
  doc.text('ROLLS', 135, y)
  doc.text('TOTAL (INR)', 165, y)

  y += 6
  doc.setFont('helvetica', 'normal')

  invoices.slice(0, 40).forEach((inv) => {
    if (y > pageHeight - 20) {
      doc.addPage()
      y = 20
    }
    doc.text(String(inv.invoiceNumber || ''), 16, y)
    doc.text(new Date(inv.invoiceDate).toLocaleDateString(), 55, y)
    doc.text(String(inv.customerName || '').slice(0, 20), 85, y)
    doc.text(String(inv.totalQuantity || 0), 135, y)
    doc.text(`Rs ${inv.finalTotal || 0}`, 165, y)
    y += 6
  })

  return doc
}

/**
 * Generate Complete ZIP Archive with manifest, Excel, CSVs, and JSON
 */
export const buildQuarterlyZipPackage = ({
  archiveId,
  manifest,
  invoices,
  flatItems,
  catalogueSummary,
  patternSummary,
  dailySales = [],
  summary = {},
}) => {
  const excelXml = generateMultiSheetExcelXml({
    invoices,
    flatItems,
    catalogueSummary,
    patternSummary,
    dailySales,
    summary,
  })

  const invoicesCsv = generateCsvContent(invoices)
  const itemsCsv = generateCsvContent(flatItems)
  const catalogueCsv = generateCsvContent(catalogueSummary)
  const patternCsv = generateCsvContent(patternSummary)
  const jsonBackup = JSON.stringify({ manifest, invoices, flatItems }, null, 2)
  const manifestString = JSON.stringify(manifest, null, 2)

  const zipFiles = {
    'archive_manifest.json': strToU8(manifestString),
    'quarterly_backup.json': strToU8(jsonBackup),
    'NH_Quarterly_Workbook.xml': strToU8(excelXml),
    'csv_reports/invoices.csv': strToU8(invoicesCsv),
    'csv_reports/invoice_items.csv': strToU8(itemsCsv),
    'csv_reports/catalogue_summary.csv': strToU8(catalogueCsv),
    'csv_reports/pattern_summary.csv': strToU8(patternCsv),
  }

  const zipped = zipSync(zipFiles)
  return zipped
}
