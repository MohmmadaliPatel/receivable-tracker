import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GraphMailService } from '@/lib/graph-mail-service';
import { getCustomerGroups, getLineItemsForGroup, sumLineItemsTotalBalance } from '@/lib/aging-service';
import { generateFollowupEmailBody, EmailTemplateData, mapLineItemsToInvoiceRows } from '@/lib/aging-templates';
import { getCurrentUser } from '@/lib/simple-auth';
import { collectAgingSendAttachments } from '@/lib/aging-import-attachments';
import { parseEmailAddresses } from '@/lib/email-parser';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { importId, grouping, groupKeys, companyCode: companyCodeBody } = body as {
      importId?: string;
      grouping?: 'name' | 'code';
      groupKeys?: string[];
      companyCode?: string;
    };

    if (!importId) {
      return NextResponse.json({ error: 'Missing importId parameter' }, { status: 400 });
    }

    // Get email config
    const emailConfig = await prisma.emailConfig.findFirst({
      where: { userId: user.id, isActive: true },
    });

    if (!emailConfig) {
      return NextResponse.json(
        { error: 'No active email configuration found.' },
        { status: 400 }
      );
    }

    const co =
      companyCodeBody && String(companyCodeBody).trim()
        ? String(companyCodeBody).trim()
        : undefined;
    const groups = await getCustomerGroups(
      user.id,
      importId,
      (grouping === 'name' ? 'name' : 'code') as 'name' | 'code',
      co,
    );

    // Find groups that have been sent but have no response
    const groupsToFollowUp: typeof groups = [];
    
    for (const group of groups) {
      // Check if any invoice in this group needs follow-up
      const lineItems = await getLineItemsForGroup(user.id, importId, group.lineItemIds);
      if (lineItems.length === 0 || sumLineItemsTotalBalance(lineItems) <= 0) {
        continue;
      }

      for (const item of lineItems) {
        if (!item.documentNo) continue;
        
        const invoiceKey = `${item.companyCode}-${item.documentNo}`;
        const chase = await prisma.invoiceChase.findUnique({
          where: {
            userId_invoiceKey: {
              userId: user.id,
              invoiceKey,
            },
          },
        });

        // Send follow-up if:
        // - Has been sent (sentMessageId exists)
        // - No response received (lastResponseAt is null)
        // - Hasn't exceeded max follow-ups (optional check)
        if (chase?.sentMessageId && !chase.lastResponseAt) {
          groupsToFollowUp.push(group);
          break; // Only add group once
        }
      }
    }

    const results = {
      sent: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const importAttRows = await prisma.agingImportCustomerAttachment.findMany({
      where: { userId: user.id, importId },
    });
    const importAttachmentMap = new Map(
      importAttRows.map((r) => [r.customerCode, { filePath: r.filePath, fileName: r.fileName }])
    );

    let toFollowUp = groupsToFollowUp;
    if (groupKeys !== undefined) {
      if (groupKeys.length === 0) {
        return NextResponse.json({ sent: 0, skipped: 0, errors: [] as string[] });
      }
      const allow = new Set(groupKeys);
      toFollowUp = groupsToFollowUp.filter((gr) => allow.has(gr.groupKey));
    }

    // Send follow-ups
    for (const group of toFollowUp) {
      try {
        const lineItems = await getLineItemsForGroup(user.id, importId, group.lineItemIds);
        if (lineItems.length === 0) continue;
        if (sumLineItemsTotalBalance(lineItems) <= 0) {
          results.skipped++;
          continue;
        }

        const firstItem = lineItems[0];
        const invoiceKey = `${firstItem.companyCode}-${firstItem.documentNo}`;
        
        const chase = await prisma.invoiceChase.findUnique({
          where: {
            userId_invoiceKey: {
              userId: user.id,
              invoiceKey,
            },
          },
        });

        if (!chase?.sentMessageId) {
          results.skipped++;
          continue;
        }

        // Build follow-up content
        const templateData: EmailTemplateData = {
          customerName: group.customerName,
          customerCode: group.customerCode,
          companyName: group.companyName,
          invoices: mapLineItemsToInvoiceRows(lineItems),
          totalAmount: lineItems.reduce((sum, item) => {
            const amount = item.totalBalance ? parseFloat(item.totalBalance.replace(/,/g, '')) : 0;
            return sum + (isNaN(amount) ? 0 : amount);
          }, 0).toString(),
        };

        const followupBody = generateFollowupEmailBody(templateData);

        const attachments = await collectAgingSendAttachments(
          user.id,
          firstItem,
          importAttachmentMap
        );

        // Prefer directory-merged group addresses (same as getCustomerGroups / first send), then chase, then line
        let toList = parseEmailAddresses(group.emailTo);
        if (toList.length === 0) toList = parseEmailAddresses(chase?.emailTo ?? null);
        if (toList.length === 0) toList = parseEmailAddresses(firstItem.emailTo ?? null);
        if (toList.length === 0) {
          results.skipped++;
          results.errors.push(`Skipped follow-up for ${group.groupKey}: no To address.`);
          continue;
        }
        const toArg: string | string[] = toList.length === 1 ? toList[0]! : toList;
        const toSet = new Set(toList);

        let ccList = parseEmailAddresses(group.emailCc);
        if (ccList.length === 0) ccList = parseEmailAddresses(chase?.emailCc ?? null);
        if (ccList.length === 0) ccList = parseEmailAddresses(firstItem.emailCc ?? null);
        const mergedCc = [...new Set(ccList)].filter((e) => !toSet.has(e));

        // Send threaded reply
        await GraphMailService.replyToMessage(emailConfig, chase.sentMessageId, {
          to: toArg,
          htmlBody: followupBody,
          cc: mergedCc.length > 0 ? (mergedCc.length === 1 ? mergedCc[0]! : mergedCc) : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        // Update follow-up tracking
        const now = new Date();
        
        for (const item of lineItems) {
          if (!item.documentNo) continue;
          
          const itemKey = `${item.companyCode}-${item.documentNo}`;
          
          const existingChase = await prisma.invoiceChase.findUnique({
            where: {
              userId_invoiceKey: {
                userId: user.id,
                invoiceKey: itemKey,
              },
            },
          });

          let followups: { sentAt: string }[] = [];
          if (existingChase?.followupsJson) {
            try {
              followups = JSON.parse(existingChase.followupsJson);
            } catch {
              followups = [];
            }
          }

          followups.push({ sentAt: now.toISOString() });

          await prisma.invoiceChase.update({
            where: {
              userId_invoiceKey: {
                userId: user.id,
                invoiceKey: itemKey,
              },
            },
            data: {
              followupCount: { increment: 1 },
              lastFollowupAt: now,
              followupsJson: JSON.stringify(followups),
            },
          });
        }

        results.sent++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        results.errors.push(`Group ${group.groupKey}: ${msg}`);
      }
    }

    // Groups not in this run: not follow-up–eligible, or not selected
    results.skipped = groups.length - toFollowUp.length;

    return NextResponse.json(results);
  } catch (error) {
    console.error('[Aging Bulk Followup] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process bulk follow-up';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
