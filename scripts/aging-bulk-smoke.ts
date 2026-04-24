/**
 * Smoke test for bulk ageing import: 500 synthetic rows, verify counts, cleanup.
 * Run: npx tsx scripts/aging-bulk-smoke.ts
 */
import { prisma } from '../src/lib/prisma';
import { importAgingData, type ParsedAgingRow } from '../src/lib/aging-service';

const N = 500;
const CO = 'SMKCO';
const DOC_PREFIX = 'SMOKE-';

function baseRow(i: number): ParsedAgingRow {
  return {
    companyCode: CO,
    companyName: 'Smoke Co',
    customerCode: 'CUST-1',
    customerName: 'Customer One',
    reconAccount: '',
    reconAccountDescription: '',
    postingDate: new Date('2024-01-15'),
    docDate: new Date('2024-01-10'),
    netDueDate: new Date('2024-02-01'),
    documentNo: `${DOC_PREFIX}${i}`,
    documentType: 'INV',
    refNo: '',
    invoiceRefNo: '',
    profitCenter: '',
    profitCenterDescr: '',
    specialGL: '',
    specialGLDescr: '',
    totalBalance: '100.00',
    notDue: '0',
    bucket0to30: '100.00',
    bucket31to90: '0',
    bucket91to180: '0',
    bucket181to365: '0',
    bucket366to730: '0',
    bucket731to1095: '0',
    bucket1096to1460: '0',
    bucket1461to1845: '0',
    bucketAbove1845: '0',
    maxDaysBucket: '0 - 30 days',
    paymentDate: null,
    paymentDocNo: '',
    paymentAmount: '0',
    fromBillDate: null,
    fromDueDate: null,
    weights: '',
    weightedDaysBillDate: '',
    weightedDaysDueDate: '',
    emailTo: 'a@b.com',
    emailCc: '',
    rowIndex: 1000 + i,
    generationMonth: '',
  };
}

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('No user in DB. Run prisma/seed or create a user.');
    process.exit(1);
  }

  const rows: ParsedAgingRow[] = [];
  for (let i = 0; i < N; i++) rows.push(baseRow(i));

  const t0 = Date.now();
  const r = await importAgingData(user.id, 'smoke-bulk.xlsx', rows);
  const ms = Date.now() - t0;

  const lineCount = await prisma.agingLineItem.count({ where: { importId: r.importId } });
  if (lineCount !== N) {
    console.error('Expected', N, 'line items, got', lineCount);
    process.exit(1);
  }

  console.log('OK', { ms, lineCount, excludedCount: r.excludedCount, chaseCount: r.chaseCount, importId: r.importId });

  await prisma.agingImport.delete({ where: { id: r.importId } });
  const delCh = await prisma.invoiceChase.deleteMany({
    where: { userId: user.id, companyCode: CO, documentNo: { startsWith: DOC_PREFIX } },
  });
  console.log('Cleanup: import deleted, invoice chases removed:', delCh.count);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
