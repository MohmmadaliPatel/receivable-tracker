import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';
import {
  getBucketSortDaysFromMaxDaysField,
  lineAmountForAgingLineItem,
  parseMaxDaysBucketCell,
} from '@/lib/aging-bucket-utils';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyCodeFilterRaw = searchParams.get('companyCode')?.trim();
    const companyCodes = companyCodeFilterRaw
      ? companyCodeFilterRaw.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : [];

    const latestImport = await prisma.agingImport.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestImport) {
      return NextResponse.json({
        hasImport: false,
        invoiceCountLatest: 0,
        outstandingInvoices: 0,
        responseReceived: 0,
        cleared: 0,
        highTouchNoReply: 0,
        bucketBreakdown: [] as { bucket: string; invoiceCount: number; outstandingAmount: number }[],
        chasedBreakdown: {
          byEmails: [] as { emailsSent: string; invoiceCount: number; outstandingAmount: number }[],
          byBucket: [] as {
            bucket: string;
            invoiceCount: number;
            outstandingAmount: number;
            topCustomers: { customerName: string; invoiceCount: number }[];
          }[],
        },
        customerSummary: [] as {
          key: string;
          customerName: string;
          customerCode: string;
          invoiceCount: number;
          outstandingAmount: number;
          withResponse: number;
        }[],
        companyBreakdown: [] as {
          companyCode: string;
          companyName: string;
          invoiceCount: number;
          outstandingAmount: number;
          emailsSent: number;
          responses: number;
        }[],
      });
    }

    const lineWhere = {
      importId: latestImport.id,
      userId: user.id,
      excluded: false,
      ...(companyCodes.length > 0 ? { companyCode: { in: companyCodes } } : {}),
    };

    const invoiceCountLatest = await prisma.agingLineItem.count({ where: lineWhere });

    const lineItems = await prisma.agingLineItem.findMany({
      where: lineWhere,
      include: { invoiceChase: true },
    });

    // Portfolio / chase KPIs: only for invoices that appear in the latest import (excluded never appear)
    const relevantInvoiceKeys = new Set<string>();
    for (const it of lineItems) {
      if (it.documentNo) {
        relevantInvoiceKeys.add(`${it.companyCode}-${it.documentNo}`);
      }
    }
    const chasesInScope =
      relevantInvoiceKeys.size > 0
        ? await prisma.invoiceChase.findMany({
            where: {
              userId: user.id,
              invoiceKey: { in: [...relevantInvoiceKeys] },
            },
          })
        : [];

    const outstandingInvoices = chasesInScope.filter((c) => c.status === 'outstanding').length;
    const responseReceived = chasesInScope.filter((c) => c.lastResponseAt !== null).length;
    const cleared = chasesInScope.filter((c) => c.status === 'cleared').length;

    const highTouchNoReply = chasesInScope.filter((c) => {
      const totalEmails = (c.emailCount || 0) + (c.followupCount || 0);
      return totalEmails >= 4 && !c.lastResponseAt && c.status === 'outstanding';
    }).length;

    const customerMap = new Map<
      string,
      {
        customerName: string;
        customerCode: string;
        invoiceCount: number;
        outstandingAmount: number;
        withResponse: number;
      }
    >();

    for (const item of lineItems) {
      const key = item.customerCode;

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customerName: item.customerName,
          customerCode: item.customerCode,
          invoiceCount: 0,
          outstandingAmount: 0,
          withResponse: 0,
        });
      }

      const customer = customerMap.get(key)!;
      customer.invoiceCount += 1;

      if (item.invoiceChase) {
        if (item.invoiceChase.status === 'outstanding') {
          customer.outstandingAmount += lineAmountForAgingLineItem(
            item.maxDaysBucket,
            item.totalBalance,
          );
        }
        if (item.invoiceChase.lastResponseAt) {
          customer.withResponse += 1;
        }
      }
    }

    const customerSummary = Array.from(customerMap.entries())
      .map(([key, v]) => ({
        key,
        customerName: v.customerName,
        customerCode: v.customerCode,
        invoiceCount: v.invoiceCount,
        outstandingAmount: v.outstandingAmount,
        withResponse: v.withResponse,
      }))
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
      .slice(0, 20);

    // Company breakdown always uses ALL companies (unfiltered) so the selector shows full context
    const allLineItemsForCompany = companyCodes.length > 0
      ? await prisma.agingLineItem.findMany({
          where: { importId: latestImport.id, userId: user.id, excluded: false },
          include: { invoiceChase: true },
        })
      : lineItems;

    const companyMap = new Map<
      string,
      {
        companyName: string;
        invoiceCount: number;
        outstandingAmount: number;
        emailsSent: number;
        responses: number;
      }
    >();

    for (const item of allLineItemsForCompany) {
      const ccode = item.companyCode;
      if (!companyMap.has(ccode)) {
        companyMap.set(ccode, {
          companyName: item.companyName || '',
          invoiceCount: 0,
          outstandingAmount: 0,
          emailsSent: 0,
          responses: 0,
        });
      }
      const co = companyMap.get(ccode)!;
      co.invoiceCount += 1;
      if (item.invoiceChase) {
        const ic = item.invoiceChase;
        co.emailsSent += (ic.emailCount || 0) + (ic.followupCount || 0);
        if (ic.lastResponseAt) {
          co.responses += 1;
        }
        if (ic.status === 'outstanding') {
          co.outstandingAmount += lineAmountForAgingLineItem(
            item.maxDaysBucket,
            item.totalBalance,
          );
        }
      }
    }

    const companyBreakdown = Array.from(companyMap.entries())
      .map(([companyCode, v]) => ({
        companyCode,
        companyName: v.companyName,
        invoiceCount: v.invoiceCount,
        outstandingAmount: v.outstandingAmount,
        emailsSent: v.emailsSent,
        responses: v.responses,
      }))
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount);

    const perBucket: Record<string, { invoiceCount: number; outstandingAmount: number }> = {};
    const emailGroup = () =>
      new Map<string, { invoiceCount: number; outstandingAmount: number }>([
        ['1', { invoiceCount: 0, outstandingAmount: 0 }],
        ['2', { invoiceCount: 0, outstandingAmount: 0 }],
        ['3', { invoiceCount: 0, outstandingAmount: 0 }],
        ['4+', { invoiceCount: 0, outstandingAmount: 0 }],
      ]);
    const chasedByEmail = emailGroup();

    const chasedPerBucket: Record<
      string,
      { invoiceCount: number; outstandingAmount: number; customerTally: Map<string, number> }
    > = {};

    const bucketKeyFromMaxDays = (maxDays: string | null | undefined): string => {
      const { displayLabel } = parseMaxDaysBucketCell(maxDays);
      return displayLabel;
    };
    const ensurePerBucket = (b: string) => {
      if (!perBucket[b]) perBucket[b] = { invoiceCount: 0, outstandingAmount: 0 };
    };
    const ensureChased = (b: string) => {
      if (!chasedPerBucket[b]) {
        chasedPerBucket[b] = { invoiceCount: 0, outstandingAmount: 0, customerTally: new Map() };
      }
    };

    for (const item of lineItems) {
      const bucket = bucketKeyFromMaxDays(item.maxDaysBucket);
      ensurePerBucket(bucket);
      perBucket[bucket].invoiceCount += 1;
      if (item.invoiceChase?.status === 'outstanding') {
        perBucket[bucket].outstandingAmount += lineAmountForAgingLineItem(
          item.maxDaysBucket,
          item.totalBalance,
        );
      }

      const ic = item.invoiceChase;
      if (ic) {
        const totalEmails = (ic.emailCount || 0) + (ic.followupCount || 0);
        if (totalEmails >= 1) {
          ensureChased(bucket);
          chasedPerBucket[bucket].invoiceCount += 1;
          if (ic.status === 'outstanding') {
            chasedPerBucket[bucket].outstandingAmount += lineAmountForAgingLineItem(
              item.maxDaysBucket,
              item.totalBalance,
            );
          }
          const name = item.customerName || 'Unknown';
          chasedPerBucket[bucket].customerTally.set(
            name,
            (chasedPerBucket[bucket].customerTally.get(name) || 0) + 1,
          );

          const gKey = totalEmails >= 4 ? '4+' : String(totalEmails) as '1' | '2' | '3' | '4+';
          const eg = chasedByEmail.get(gKey)!;
          eg.invoiceCount += 1;
          if (ic.status === 'outstanding') {
            eg.outstandingAmount += lineAmountForAgingLineItem(
              item.maxDaysBucket,
              item.totalBalance,
            );
          }
        }
      }
    }

    const bucketBreakdown = Object.entries(perBucket)
      .map(([bucket, v]) => ({ bucket, ...v }))
      .sort(
        (a, b) =>
          getBucketSortDaysFromMaxDaysField(a.bucket) - getBucketSortDaysFromMaxDaysField(b.bucket),
      );

    const byEmails: { emailsSent: string; invoiceCount: number; outstandingAmount: number }[] = [
      { emailsSent: '1', ...chasedByEmail.get('1')! },
      { emailsSent: '2', ...chasedByEmail.get('2')! },
      { emailsSent: '3', ...chasedByEmail.get('3')! },
      { emailsSent: '4+', ...chasedByEmail.get('4+')! },
    ];

    const byBucket = Object.entries(chasedPerBucket)
      .map(([bucket, c]) => {
        const topCustomers = Array.from(c.customerTally.entries())
          .map(([customerName, invoiceCount]) => ({ customerName, invoiceCount }))
          .sort((a, b) => b.invoiceCount - a.invoiceCount)
          .slice(0, 3);
        return {
          bucket,
          invoiceCount: c.invoiceCount,
          outstandingAmount: c.outstandingAmount,
          topCustomers,
        };
      })
      .sort(
        (a, b) =>
          getBucketSortDaysFromMaxDaysField(a.bucket) - getBucketSortDaysFromMaxDaysField(b.bucket),
      );

    return NextResponse.json({
      hasImport: true,
      importName: latestImport.fileName,
      importAt: latestImport.createdAt,
      companyCodeFilter: companyCodeFilterRaw,
      invoiceCountLatest,
      outstandingInvoices,
      responseReceived,
      cleared,
      highTouchNoReply,
      bucketBreakdown,
      chasedBreakdown: { byEmails, byBucket },
      customerSummary,
      companyBreakdown,
    });
  } catch (error) {
    console.error('[Aging Analytics] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
