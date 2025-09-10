// Azure AD Configuration
export const AZURE_CONFIG = {
  clientId: process.env.AZURE_CLIENT_ID || '',
  clientSecret: process.env.AZURE_CLIENT_SECRET || '',
  tenantId: process.env.AZURE_TENANT_ID || '',
};

// Microsoft Graph API scopes
export const GRAPH_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/User.Read',
];

// API endpoints
export const API_ENDPOINTS = {
  emails: '/api/emails',
  auth: '/api/auth',
};
