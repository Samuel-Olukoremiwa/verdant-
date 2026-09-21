import type { ReportRow } from './report-format'
export type StatementPayment = {amount: number | string; invoices: {due_type_id?: string | null; due_types: {name: string} | null; houses: {street_id?: string | null; streets: {name: string} | null} | null} | null}
export type StatementExpense = {amount: number | string; description: string; category: string; expense_date: string}
// Aggregate in kobo so fractional naira do not accumulate rounding drift.
export function incomeStatementRows(payments: StatementPayment[], expenses: StatementExpense[]): ReportRow[] {
 const groups=new Map<string,{name:string;total:number;streets:Map<string,{name:string;total:number}>}>()
 let income=0,spent=0
 const kobo=(value:number|string)=>{const n=Number(value);if(!Number.isFinite(n)||n<0)throw new Error('Invalid statement amount');return Math.round(n*100)}
 for(const p of payments){const amount=kobo(p.amount),inv=p.invoices,name=inv?.due_types?.name||'Unallocated income',key=inv?.due_type_id||name;const group=groups.get(key)||{name,total:0,streets:new Map()};const streetName=inv?.houses?.streets?.name||'Unassigned street',streetKey=inv?.houses?.street_id||streetName;const street=group.streets.get(streetKey)||{name:streetName,total:0};street.total+=amount;group.streets.set(streetKey,street);group.total+=amount;groups.set(key,group);income+=amount}
 const rows:ReportRow[]=[{kind:'section',label:'INCOME',detail:null,total:null}]
 for(const group of [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name))){rows.push({kind:'income',label:group.name,detail:null,total:group.total/100});for(const street of [...group.streets.values()].sort((a,b)=>a.name.localeCompare(b.name)))rows.push({kind:'street',label:street.name,detail:street.total/100,total:null})}
 rows.push({kind:'subtotal',label:'TOTAL INCOME',detail:null,total:income/100},{kind:'section',label:'EXPENSES',detail:null,total:null})
 for(const e of expenses){const amount=kobo(e.amount);spent+=amount;rows.push({kind:'expense',label:e.description||e.category,category:e.category,date:e.expense_date,detail:amount/100,total:null})}
 rows.push({kind:'subtotal',label:'TOTAL EXPENSES',detail:null,total:spent/100},{kind:income<spent?'deficit':'surplus',label:income<spent?'DEFICIT':'SURPLUS',detail:null,total:Math.abs(income-spent)/100})
 return rows
}
