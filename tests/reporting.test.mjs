import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(name) {
 const source=fs.readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8')
 const loaded={exports:{}}
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,Date,Intl,Map,Set,Error})
 return loaded.exports
}
const {summarize,estateDate,houseBalances}=load('dashboard')
const {periodRange,reportCsv}=load('report-format')
const {readAll}=load('read-all')
test('dashboard counts advance payments by receipt date, expenses by date, and invoiced debt separately',()=>{
 const invoices=[{id:'i',house_id:'h',amount:5000,amount_paid:2000,due_date:'2026-10-31',due_types:{name:'Service Charge'},houses:{address:'House A',street_id:'s',streets:{name:'Street A'}}}]
 const payments=[{amount:2000,paid_at:'2026-09-30T22:59:59.999Z',invoices:{due_types:{name:'Service Charge'}}},{amount:500,paid_at:'2026-09-30T23:00:00Z',invoices:{due_types:{name:'Service Charge'}}}]
 const expenses=[{amount:700,expense_date:'2026-09-01'},{amount:50,expense_date:'2026-10-01'}]
 const sept=summarize(invoices,payments,expenses,'2026-09');assert.equal(sept.billed,0);assert.equal(sept.collected,2000);assert.equal(sept.spent,700);assert.equal(sept.balance,1300)
 const oct=summarize(invoices,payments,expenses,'2026-10');assert.equal(oct.billed,5000);assert.equal(oct.collected,500);assert.equal(oct.outstanding,3000);assert.equal(oct.homes,1)
 assert.equal(summarize(invoices,payments,expenses).balance,1750)
 assert.equal(estateDate(new Date('2026-09-30T23:00:00Z')),'2026-10-01')
 assert.equal(houseBalances(invoices)[0].paid,2000)
})
test('period presets handle year boundaries, leap February and estate timezone',()=>{
 assert.equal(periodRange('last-month',new Date('2026-01-03')).from,'2025-12-01')
 assert.equal(periodRange('next-month',new Date('2026-12-10')).to,'2027-01-31')
 assert.equal(periodRange('month',new Date('2024-02-10')).to,'2024-02-29')
 assert.equal(periodRange('month',new Date('2026-09-30T23:30:00Z')).from,'2026-10-01')
 assert.equal(periodRange('quarter',new Date('2026-05-10')).to,'2026-06-30')
})
test('CSV uses report labels, quotes text and neutralizes spreadsheet formulas',()=>{
 const csv=reportCsv('expenses',[{house:'Maintenance',charge:'=HYPERLINK("bad")\nnext',amount:500,date:'2026-09-20'}])
 assert.ok(csv.includes('"Category","Description","Date","Amount (NGN)"'))
 assert.ok(csv.includes('"\'=HYPERLINK(""bad"")\nnext"'))
 assert.ok(!csv.includes('Reference'))
})
test('pagination includes more than 1000 records and rejects partial results on failure',async()=>{
 const calls=[];const rows=await readAll(async(from,to)=>{calls.push([from,to]);return {data:Array.from({length:from<1000?500:7},(_,i)=>from+i),error:null}})
 assert.equal(rows.length,1007);assert.equal(rows[1006],1006);assert.equal(calls.length,3)
 await assert.rejects(readAll(async()=>({data:null,error:{message:'unavailable'}})),/unavailable/)
})
