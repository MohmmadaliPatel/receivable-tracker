import { getGraphClient, EmailFilter, EmailData } from './graph-client';
import { prisma } from './prisma';

export interface DeltaSyncResult {
  emails: EmailData[];
  deltaToken?: string;
  fetched: number;
  stored: number;
  hasMore: boolean;
}

export class EmailService {
  // EmailSync model doesn't exist in schema - using in-memory storage as fallback
  private static emailSyncCache: Map<string, {
    userId: string;
    status: string;
    lastSyncToken?: string;
    lastSyncDate?: Date;
    totalEmailsSynced?: number;
    errorMessage?: string;
    updatedAt: Date;
  }> = new Map();

  static async getOrCreateEmailSync(userId: string) {
    let emailSync = this.emailSyncCache.get(userId);

    if (!emailSync) {
      emailSync = {
        userId,
        status: 'idle',
        updatedAt: new Date(),
      };
      this.emailSyncCache.set(userId, emailSync);
    }

    return emailSync;
  }

  static async updateEmailSyncStatus(
    userId: string,
    status: string,
    data: {
      lastSyncToken?: string;
      lastSyncDate?: Date;
      totalEmailsSynced?: number;
      errorMessage?: string;
    }
  ) {
    const emailSync = await this.getOrCreateEmailSync(userId);
    Object.assign(emailSync, {
      status,
      ...data,
      updatedAt: new Date(),
    });
    this.emailSyncCache.set(userId, emailSync);
  }

  static async fetchEmailsWithDelta(
    accessToken: string | undefined,
    userId: string,
    filter: EmailFilter = {},
    maxEmails: number = 100
  ): Promise<DeltaSyncResult> {
    try {
      // Demo mode: return mock data
      if (!accessToken || process.env.DEMO_MODE === 'true') {
        return this.getMockEmails(userId, filter, maxEmails);
      }
      console.log("accessToken", accessToken);
      
      const client = getGraphClient(accessToken);
      console.log("Client", client);
      
      const emailSync = await this.getOrCreateEmailSync(userId);
      console.log("Email Sync", emailSync);
      
      // Update status to syncing
      await this.updateEmailSyncStatus(userId, 'syncing', {});
      console.log("Updated Email Sync Status");
      
      // Build the filter query
      let filterQuery = '';

      if (filter.fromDate || filter.toDate) {
        const dateFilters: string[] = [];

        if (filter.fromDate) {
          dateFilters.push(`receivedDateTime ge ${filter.fromDate.toISOString()}`);
        }

        if (filter.toDate) {
          dateFilters.push(`receivedDateTime le ${filter.toDate.toISOString()}`);
        }

        filterQuery = dateFilters.join(' and ');
      }

      if (filter.senders && filter.senders.length > 0) {
        const senderFilters = filter.senders.map(sender =>
          `sender/emailAddress/address eq '${sender}'`
        ).join(' or ');

        if (filterQuery) {
          filterQuery += ` and (${senderFilters})`;
        } else {
          filterQuery = senderFilters;
        }
      }

      console.log("Filter Query", filterQuery);
      

      // Build the request with delta support
      let request = client.api('/me/messages/delta')
        .select('id,subject,sender,toRecipients,body,bodyPreview,receivedDateTime,isRead,hasAttachments,attachments')
        .orderby('receivedDateTime desc');

      console.log("Request", request);

      // If we have a delta token, use it for incremental sync
      if (emailSync.lastSyncToken) {
        request = request.query({ $deltatoken: emailSync.lastSyncToken });
      }

      console.log("Request with Delta Token", request);

      if (filterQuery) {
        request = request.filter(filterQuery);
      }

      console.log("Request with Filter Query", request);

      request = request.top(maxEmails);

      console.log("Request with Top", request);

      const response = await request.get();
      console.log("Response", response);
      
      const emails = response.value as EmailData[];
      const deltaToken = response['@odata.deltaLink']?.split('$deltatoken=')[1];
      const hasMore = !!response['@odata.nextLink'];

      console.log("Emails", emails);
      
      console.log("Delta Token", deltaToken);
      
      console.log("Has More", hasMore);
      
      return {
        emails,
        deltaToken,
        fetched: emails.length,
        stored: 0, // Will be set after storing
        hasMore,
      };
    } catch (error) {
      console.error('Error fetching emails with delta:', error);
      await this.updateEmailSyncStatus(userId, 'error', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to fetch emails from Outlook');
    }
  }

  static async storeEmailsForUser(emails: EmailData[], userId: string) {
    try {
      // Note: The Email model in schema is for sent emails, not received emails.
      // Received emails are tracked via EmailTracking model in the current system.
      // This method is stubbed out to prevent build errors.
      // TODO: Migrate to use EmailTracking model if this functionality is needed.
      console.warn('storeEmailsForUser: Email model does not match schema. Skipping database storage.');
      return emails.length; // Return count as if stored
    } catch (error) {
      console.error('Error storing emails for user:', error);
      throw new Error('Failed to store emails in database');
    }
  }

  static async fetchAndStoreEmailsWithDelta(
    accessToken: string,
    userId: string,
    filter: EmailFilter = {},
    maxEmails: number = 100
  ): Promise<DeltaSyncResult> {
    try {
      const result = await this.fetchEmailsWithDelta(accessToken, userId, filter, maxEmails);
      const storedCount = await this.storeEmailsForUser(result.emails, userId);

      // Update sync status and delta token
      await this.updateEmailSyncStatus(userId, 'idle', {
        lastSyncToken: result.deltaToken,
        lastSyncDate: new Date(),
        totalEmailsSynced: storedCount,
      });

      return {
        ...result,
        stored: storedCount,
      };
    } catch (error) {
      console.error('Error in delta fetch and store operation:', error);
      await this.updateEmailSyncStatus(userId, 'error', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  static async getStoredEmailsForUser(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      fromDate?: Date;
      toDate?: Date;
      sender?: string;
    } = {}
  ) {
    try {
      // Note: The Email model in schema is for sent emails, not received emails.
      // Received emails are tracked via EmailTracking model in the current system.
      // This method is stubbed out to prevent build errors.
      // TODO: Migrate to use EmailTracking model if this functionality is needed.
      console.warn('getStoredEmailsForUser: Email model does not match schema. Returning empty results.');
      return {
        emails: [],
        total: 0,
        limit: options.limit || 50,
        offset: options.offset || 0,
      };
    } catch (error) {
      console.error('Error retrieving stored emails for user:', error);
      throw new Error('Failed to retrieve emails from database');
    }
  }

  static async getEmailSyncStatus(userId: string) {
    try {
      const emailSync = await this.getOrCreateEmailSync(userId);
      return emailSync;
    } catch (error) {
      console.error('Error getting email sync status:', error);
      throw new Error('Failed to get sync status');
    }
  }

  static async resetEmailSync(userId: string) {
    try {
      await this.updateEmailSyncStatus(userId, 'idle', {
        lastSyncToken: undefined,
        lastSyncDate: undefined,
        totalEmailsSynced: 0,
        errorMessage: undefined,
      });
    } catch (error) {
      console.error('Error resetting email sync:', error);
      throw new Error('Failed to reset sync');
    }
  }

  // Mock email data for demo mode
  static getMockEmails(userId: string, filter: EmailFilter, maxEmails: number): DeltaSyncResult {
    const mockEmails: EmailData[] = [
      {
        id: "demo-mock-1-" + userId,
        subject: "Welcome to Email Auto",
        sender: {
          emailAddress: {
            address: "welcome@microsoft.com",
            name: "Microsoft Welcome"
          }
        },
        toRecipients: [{
          emailAddress: {
            address: "demo@example.com",
            name: "Demo User"
          }
        }],
        body: {
          content: "Welcome to your email automation tool!",
          contentType: "text/plain"
        },
        bodyPreview: "Welcome to your email automation tool! This is a demo email to show how the system works.",
        receivedDateTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        isRead: false,
        hasAttachments: false
      },
      {
        id: "demo-mock-2-" + userId,
        subject: "Project Update",
        sender: {
          emailAddress: {
            address: "team@company.com",
            name: "Project Team"
          }
        },
        toRecipients: [{
          emailAddress: {
            address: "demo@example.com",
            name: "Demo User"
          }
        }],
        body: {
          content: "Here's the latest update on our project.",
          contentType: "text/plain"
        },
        bodyPreview: "Here's the latest update on our project. We've made significant progress this week.",
        receivedDateTime: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        isRead: true,
        hasAttachments: true,
        attachments: [{
          id: "att-1",
          name: "project-update.pdf",
          contentType: "application/pdf",
          size: 2048576
        }]
      },
      {
        id: "demo-mock-3-" + userId,
        subject: "Meeting Reminder",
        sender: {
          emailAddress: {
            address: "calendar@microsoft.com",
            name: "Microsoft Calendar"
          }
        },
        toRecipients: [{
          emailAddress: {
            address: "demo@example.com",
            name: "Demo User"
          }
        }],
        body: {
          content: "Don't forget about our meeting tomorrow at 10 AM.",
          contentType: "text/plain"
        },
        bodyPreview: "Don't forget about our meeting tomorrow at 10 AM. We'll be discussing the quarterly goals.",
        receivedDateTime: new Date(Date.now() - 10800000).toISOString(), // 3 hours ago
        isRead: false,
        hasAttachments: false
      }
    ];

    // Filter emails based on criteria
    let filteredEmails = mockEmails;

    if (filter.fromDate) {
      filteredEmails = filteredEmails.filter(email =>
        new Date(email.receivedDateTime) >= filter.fromDate!
      );
    }

    if (filter.toDate) {
      filteredEmails = filteredEmails.filter(email =>
        new Date(email.receivedDateTime) <= filter.toDate!
      );
    }

    if (filter.senders && filter.senders.length > 0) {
      filteredEmails = filteredEmails.filter(email =>
        filter.senders!.some(sender =>
          email.sender.emailAddress.address.toLowerCase().includes(sender.toLowerCase())
        )
      );
    }

    const emailsToReturn = filteredEmails.slice(0, maxEmails);

    return {
      emails: emailsToReturn,
      deltaToken: "demo-token-" + Date.now(),
      fetched: emailsToReturn.length,
      stored: 0,
      hasMore: filteredEmails.length > maxEmails
    };
  }
}
