import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { REPORT_LABELS, reportColumns, reportCell, type ReportType, type ReportRow } from './report-format'

let fontCache: string | undefined
async function loadFont() {
  if (fontCache) return fontCache
  const response = await fetch('/fonts/NotoSans-Regular.ttf')
  if (!response.ok) throw new Error('Report font could not be loaded')
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192))
  fontCache = btoa(binary)
  return fontCache
}
export async function createReportPdf(type: ReportType, rows: ReportRow[], from: string, to: string, fontData?: string) {
  const doc = new jsPDF({ orientation: type === 'income-statement' ? 'portrait' : 'landscape', unit: 'mm', format: 'a4', putOnlyUsedFonts: true })
  doc.addFileToVFS('NotoSans.ttf', fontData ?? await loadFont())
  doc.addFont('NotoSans.ttf', 'NotoSans', 'normal')
  doc.setFont('NotoSans', 'normal')
  doc.setProperties({ title: `${REPORT_LABELS[type]} - your estate`, author: 'your estate' })
  if (type === 'income-statement') {
    doc.setProperties({title:`Income Statement | ${from} to ${to}`,author:'Verdant'})
    autoTable(doc, {
      head:[['Income / Expense','Amount (NGN)','Total (NGN)']],
      body:rows.map(r=>[String(r.label)+(r.kind==='expense'?`\n${r.date} | ${r.category}`:''),r.detail==null?'':Number(r.detail).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2}),r.total==null?'':Number(r.total).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})]),
      margin:{top:42,bottom:20,left:14,right:14},
      styles:{font:'NotoSans',fontStyle:'normal',fontSize:8,cellPadding:2,overflow:'linebreak'},
      headStyles:{fillColor:[29,73,56],fontStyle:'normal'},
      columnStyles:{0:{cellWidth:104},1:{halign:'right',cellWidth:39},2:{halign:'right',cellWidth:39}},
      rowPageBreak:'avoid',
      didParseCell: data => {
        if(data.section!=='body')return
        const row=rows[data.row.index]
        if(['section','subtotal','income','surplus','deficit'].includes(String(row.kind)))data.cell.styles.fillColor=[235,241,235]
        if(row.kind==='deficit')data.cell.styles.textColor=[180,30,30]
        if(row.kind==='street'&&data.column.index===0)data.cell.styles.cellPadding={top:2,bottom:2,left:8,right:2}
      },
      willDrawPage:()=>{doc.setTextColor(29,73,56);doc.setFontSize(17);doc.text('Income Statement',14,16);doc.setTextColor(40);doc.setFontSize(10);doc.text(`Verdant | ${from} to ${to}`,14,24);doc.setFontSize(8);doc.text('Cash basis: successful payments received (WAT) less dated expenses.',14,31);doc.text('Street assignments reflect current house records.',14,36)},
    })
    const count=doc.getNumberOfPages()
    for(let page=1;page<=count;page++){doc.setPage(page);doc.setTextColor(90);doc.setFontSize(8);doc.text('All amounts in Nigerian naira (NGN)',14,287);doc.text(`Page ${page} of ${count}`,196,287,{align:'right'})}
    return doc
  }
  const columns = reportColumns(type)
  const amountKey = type === 'collected' || type === 'expenses' ? 'amount' : 'outstanding'
  const total = rows.reduce((sum,r) => sum + Number(r[amountKey] ?? 0),0)
  const heading = () => {
    doc.setTextColor(29,73,56); doc.setFontSize(17)
    doc.text('your estate', 14, 15)
    doc.setTextColor(35); doc.setFontSize(11)
    doc.text(`${REPORT_LABELS[type]} | ${from} to ${to}`, 14, 23)
    doc.setFontSize(9)
    doc.text(`${rows.length} records | Total: NGN ${total.toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}`,14,30)
    if (type === 'future') doc.text('Projected rows are estimates, not issued invoices.',14,36)
  }
  autoTable(doc, {
    head: [columns.map(c => c.label)],
    body: rows.map(r => columns.map(c => ['amount','outstanding'].includes(c.key) ? Number(r[c.key] ?? 0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2}) : reportCell(r,c.key))),
    margin: { top: type === 'future' ? 42 : 36, bottom: 17, left: 14, right: 14 },
    styles: { font: 'NotoSans', fontStyle: 'normal', fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [29,73,56], fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [245,248,245] },
    columnStyles: { [columns.length-1]: { halign: 'right', cellWidth: 36 } },
    rowPageBreak: 'avoid',
    willDrawPage: heading,
  })
  const count = doc.getNumberOfPages()
  for (let page=1; page<=count; page++) {
    doc.setPage(page); doc.setFontSize(8); doc.setTextColor(100)
    doc.text('Estate records | All amounts in Nigerian naira (NGN)',14,201)
    doc.text(`Page ${page} of ${count}`,283,201,{align:'right'})
  }
  return doc
}
