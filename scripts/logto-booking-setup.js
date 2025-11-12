#!/usr/bin/env node

/**
 * Logto Setup Script for Booking Service (Shady)
 * 
 * This script configures Logto for the standalone booking service:
 * 1. Creates API Resource for booking service backend (https://api.booking-service.local)
 * 2. Creates SPA Application for admin UI (port 5175)
 * 3. Creates SPA Application for public widget (port 5174)
 * 4. Configures scopes for booking, availability, and Google Calendar integration
 * 5. Integrates with existing organization template for multi-tenancy
 * 
 * Prerequisites:
 * - Logto instance running at http://localhost:3001
 * - Management API credentials in .env (LOGTO_MANAGEMENT_APP_ID, LOGTO_MANAGEMENT_APP_SECRET)
 * 
 * Usage:
 *   node scripts/logto-booking-setup.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================================================
// ENV FILE UTILITIES
// ============================================================================

function parseEnv(raw) {
  const parsed = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadEnvFile(filePath) {
  let raw = '';
  if (fs.existsSync(filePath)) {
    raw = fs.readFileSync(filePath, 'utf8');
  }
  const lines = raw ? raw.split(/\r?\n/) : [];
  const parsed = raw ? parseEnv(raw) : {};
  return { filePath, lines, parsed };
}

function serializeEnvValue(value) {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[\s#"'`]/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

function saveEnvFile(envData, updates) {
  const lines = envData.lines.slice();
  const keys = Object.keys(updates);

  keys.forEach((key) => {
    const value = updates[key];
    const serialized = serializeEnvValue(value);
    const assignLine = `${key}=${serialized}`;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith(`${key}=`) || line.startsWith(`${key} =`)) {
        lines[i] = assignLine;
        found = true;
        break;
      }
    }

    if (!found) {
      if (lines.length > 0 && !lines[lines.length - 1].trim()) {
        lines[lines.length - 1] = assignLine;
      } else {
        lines.push(assignLine);
      }
    }
  });

  envData.lines = lines;
  let output = lines.join('\n');
  if (output && !output.endsWith('\n')) {
    output += '\n';
  }
  fs.writeFileSync(envData.filePath, output, 'utf8');
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Script connects from host machine, so use localhost
const LOGTO_ENDPOINT = 'http://localhost:3001';
// Backend runs in Docker, so it needs host.docker.internal
const LOGTO_ENDPOINT_FOR_BACKEND = 'http://host.docker.internal:3001';

// API Resource for booking service backend
const API_RESOURCE = {
  name: 'Booking Service API',
  indicator: 'https://api.booking-service.local',
  description: 'Calendar booking and scheduling API with Google Calendar integration',
  scopes: [
    // Booking management
    { name: 'bookings:read', description: 'Read bookings' },
    { name: 'bookings:write', description: 'Create and manage bookings' },
    { name: 'bookings:cancel', description: 'Cancel bookings' },
    { name: 'bookings:stats', description: 'View booking statistics' },
    
    // Booking user management (admin only)
    { name: 'users:read', description: 'Read booking users' },
    { name: 'users:write', description: 'Create and manage booking users' },
    { name: 'users:availability', description: 'Manage user availability' },
    
    // Google Calendar integration
    { name: 'calendar:connect', description: 'Connect Google Calendar' },
    { name: 'calendar:sync', description: 'Sync with Google Calendar' },
    
    // Configuration (admin only)
    { name: 'config:read', description: 'Read booking configuration' },
    { name: 'config:write', description: 'Update booking configuration' }
  ]
};

// Admin SPA Application (authenticated users managing bookings)
const ADMIN_APP = {
  name: 'Booking Service Admin',
  description: 'Admin interface for managing bookings, users, and calendar integration',
  type: 'SPA',
  redirectUris: [
    'http://localhost:5175/callback',
    'http://localhost:5175'
  ],
  postLogoutRedirectUris: [
    'http://localhost:5175'
  ],
  corsAllowedOrigins: [
    'http://localhost:5175'
  ]
};

// Widget SPA Application (public booking widget - no auth or minimal auth)
const WIDGET_APP = {
  name: 'Booking Widget',
  description: 'Public booking widget for end-users to schedule appointments',
  type: 'SPA',
  redirectUris: [
    'http://localhost:5174/callback',
    'http://localhost:5174'
  ],
  postLogoutRedirectUris: [
    'http://localhost:5174'
  ],
  corsAllowedOrigins: [
    'http://localhost:5174'
  ]
};

// Organization Roles (to be added to organization template)
// These roles control what users can do within their organization's booking service
const ORG_ROLES = [
  {
    name: 'Booking Admin',
    description: 'Full access to booking management, users, and configuration',
    apiScopes: [
      'bookings:read', 'bookings:write', 'bookings:cancel', 'bookings:stats',
      'users:read', 'users:write', 'users:availability',
      'calendar:connect', 'calendar:sync',
      'config:read', 'config:write'
    ]
  },
  {
    name: 'Booking Manager',
    description: 'Manage bookings and view users, no configuration access',
    apiScopes: [
      'bookings:read', 'bookings:write', 'bookings:cancel', 'bookings:stats',
      'users:read', 'calendar:sync'
    ]
  },
  {
    name: 'Booking User',
    description: 'Personal booking management and calendar connection',
    apiScopes: [
      'bookings:read',
      'users:read',
      'calendar:connect', 'calendar:sync'
    ]
  }
];

// ============================================================================
// LOGTO API CLIENT
// ============================================================================

class LogtoClient {
  constructor(endpoint, managementAppId, managementAppSecret) {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.managementAppId = managementAppId;
    this.managementAppSecret = managementAppSecret;
    this.managementToken = null;
    this.tokenExpiresAt = 0;
  }

  async getManagementToken() {
    // Return cached token if still valid (with 60s buffer)
    if (this.managementToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.managementToken;
    }

    console.log('🔑 Getting management API token...');
    
    // Try multiple resource candidates
    const resourceCandidates = [
      'https://default.logto.app/api',
      `${this.endpoint}/api`
    ];

    const errors = [];

    for (const resource of resourceCandidates) {
      try {
        const response = await fetch(`${this.endpoint}/oidc/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.managementAppId}:${this.managementAppSecret}`).toString('base64')}`
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            resource,
            scope: 'all'
          }).toString()
        });

        if (response.ok) {
          const data = await response.json();
          if (data.access_token) {
            console.log(`   ✓ Token obtained with resource: ${resource}`);
            this.managementToken = data.access_token;
            this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
            return this.managementToken;
          }
        } else {
          const errorText = await response.text();
          errors.push(`${resource}: ${response.status} ${errorText.slice(0, 100)}`);
        }
      } catch (err) {
        errors.push(`${resource}: ${err.message}`);
      }
    }

    console.error('\n❌ Failed to get management token from all resources:');
    errors.forEach(err => console.error(`   - ${err}`));
    throw new Error('Unable to obtain management token');
  }

  async request(path, method = 'GET', body = null) {
    const token = await this.getManagementToken();
    const url = `${this.endpoint}/api${path}`;
    
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed: ${method} ${path} - ${response.status} ${error}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  }

  async get(path) {
    return this.request(path, 'GET');
  }

  async post(path, body) {
    return this.request(path, 'POST', body);
  }

  async patch(path, body) {
    return this.request(path, 'PATCH', body);
  }

  async put(path, body) {
    return this.request(path, 'PUT', body);
  }

  async delete(path) {
    return this.request(path, 'DELETE');
  }
}

// ============================================================================
// SETUP FUNCTIONS
// ============================================================================

async function createOrUpdateApiResource(client) {
  console.log('\n📦 Setting up API Resource...');
  console.log(`   Identifier: ${API_RESOURCE.indicator}`);

  // Check if resource already exists
  const resources = await client.get('/resources');
  const existing = resources.find(r => r.indicator === API_RESOURCE.indicator);

  let resource;
  if (existing) {
    console.log('   ℹ️  Resource already exists, updating...');
    resource = await client.patch(`/resources/${existing.id}`, {
      name: API_RESOURCE.name,
      accessTokenTtl: 3600
    });
  } else {
    console.log('   ✨ Creating new resource...');
    resource = await client.post('/resources', {
      name: API_RESOURCE.name,
      indicator: API_RESOURCE.indicator,
      accessTokenTtl: 3600
    });
  }

  // Create/update scopes
  console.log(`   📝 Setting up ${API_RESOURCE.scopes.length} scopes...`);
  const existingScopes = await client.get(`/resources/${resource.id}/scopes`);
  
  for (const scope of API_RESOURCE.scopes) {
    const existingScope = existingScopes.find(s => s.name === scope.name);
    if (existingScope) {
      await client.patch(`/resources/${resource.id}/scopes/${existingScope.id}`, {
        description: scope.description
      });
      console.log(`      ✓ Updated scope: ${scope.name}`);
    } else {
      await client.post(`/resources/${resource.id}/scopes`, {
        name: scope.name,
        description: scope.description
      });
      console.log(`      ✨ Created scope: ${scope.name}`);
    }
  }

  console.log('   ✅ API Resource configured');
  return resource;
}

async function createOrUpdateSpaApp(client, appConfig, resourceId) {
  console.log(`\n🌐 Setting up SPA: ${appConfig.name}...`);

  // Check if app already exists
  const apps = await client.get('/applications');
  const existing = apps.find(a => a.name === appConfig.name);

  let app;
  if (existing) {
    console.log('   ℹ️  Application already exists, updating...');
    app = await client.patch(`/applications/${existing.id}`, {
      name: appConfig.name,
      description: appConfig.description,
      oidcClientMetadata: {
        redirectUris: appConfig.redirectUris,
        postLogoutRedirectUris: appConfig.postLogoutRedirectUris
      },
      customClientMetadata: {
        corsAllowedOrigins: appConfig.corsAllowedOrigins
      }
    });
  } else {
    console.log('   ✨ Creating new application...');
    app = await client.post('/applications', {
      name: appConfig.name,
      description: appConfig.description,
      type: 'SPA',
      oidcClientMetadata: {
        redirectUris: appConfig.redirectUris,
        postLogoutRedirectUris: appConfig.postLogoutRedirectUris
      },
      customClientMetadata: {
        corsAllowedOrigins: appConfig.corsAllowedOrigins
      }
    });
  }

  // Associate with API resource
  console.log('   🔗 Associating with API resource...');
  try {
    await client.post(`/applications/${app.id}/user-consent-organizations`, {
      organizationResourceScopes: [{
        resourceId: resourceId,
        organizationId: '' // Empty means all orgs can use this
      }]
    });
    console.log('   ✓ Resource association configured');
  } catch (error) {
    // May already exist
    console.log('   ℹ️  Resource association already exists');
  }

  console.log('   ✅ SPA Application configured');
  console.log(`   🔑 App ID: ${app.id}`);
  console.log(`   🔒 App Secret: ${app.secret || '(none - SPA has no secret)'}`);
  
  return app;
}

async function updateOrganizationTemplate(client, resourceId) {
  console.log('\n🏢 Creating Organization Roles...');

  try {
    // Get current organization roles
    const existingRoles = await client.get('/organization-roles');
    console.log(`   📋 Found ${existingRoles.length} existing organization roles`);

    // Get resource scopes for mapping
    const resourceScopes = await client.get(`/resources/${resourceId}/scopes`);

    // Create/update booking roles
    for (const roleConfig of ORG_ROLES) {
      const existingRole = existingRoles.find(r => r.name === roleConfig.name);
      
      let roleRecord;
      if (existingRole) {
        console.log(`   ℹ️  Role "${roleConfig.name}" already exists`);
        roleRecord = existingRole;
      } else {
        console.log(`   ✨ Creating organization role: ${roleConfig.name}...`);
        
        // Create role WITHOUT scopes first
        roleRecord = await client.post('/organization-roles', {
          name: roleConfig.name,
          description: roleConfig.description,
          type: 'User'
        });
        console.log(`      ✓ Created role: ${roleConfig.name}`);
      }

      // Assign API resource scopes to role (separate API call)
      if (roleConfig.apiScopes && roleConfig.apiScopes.length > 0) {
        try {
          // Get scope IDs (just the IDs, not prefixed)
          const scopeIds = roleConfig.apiScopes
            .map(scopeName => {
              const scope = resourceScopes.find(s => s.name === scopeName);
              return scope ? scope.id : null;
            })
            .filter(Boolean);

          if (scopeIds.length > 0) {
            await client.put(`/organization-roles/${roleRecord.id}/resource-scopes`, {
              scopeIds
            });
            console.log(`      ✓ Assigned ${scopeIds.length}/${roleConfig.apiScopes.length} API scopes to "${roleConfig.name}"`);
          }
        } catch (err) {
          console.warn(`      ⚠️  Failed to assign API scopes: ${err.message}`);
        }
      }
    }

    console.log('   ✅ Organization roles configured');
  } catch (error) {
    console.error('   ❌ Failed to configure organization roles:', error.message);
    console.log('   ⚠️  You can create roles manually in Logto Admin Console');
    console.log('   💡 Go to: Organization Template → Roles → Create Role');
  }
}

async function displayConfiguration(adminApp, widgetApp, envDoc) {
  // Build updates object
  // Note: Backend runs in Docker and needs host.docker.internal
  // Frontend uses VITE_LOGTO_ENDPOINT which stays as localhost (accessed from browser)
  const ENV_UPDATES = {
    LOGTO_ENDPOINT: LOGTO_ENDPOINT_FOR_BACKEND,
    LOGTO_ISSUER: `${LOGTO_ENDPOINT_FOR_BACKEND}/oidc`,
    LOGTO_JWKS_URL: `${LOGTO_ENDPOINT_FOR_BACKEND}/oidc/jwks`,
    LOGTO_API_RESOURCE: API_RESOURCE.indicator,
    VITE_LOGTO_APP_ID: adminApp.id,
    VITE_LOGTO_API_RESOURCE: API_RESOURCE.indicator,
    VITE_WIDGET_LOGTO_APP_ID: widgetApp.id
  };

  // Save updates to .env file
  try {
    saveEnvFile(envDoc, ENV_UPDATES);
    console.log('\n✅ .env file updated successfully!');
  } catch (error) {
    console.error('\n⚠️  Failed to update .env file:', error.message);
    console.error('   Please update manually with the configuration below.\n');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ BOOKING SERVICE LOGTO SETUP COMPLETE');
  console.log('='.repeat(80));
  console.log('\n📝 UPDATED CONFIGURATION IN .env:');
  console.log('─'.repeat(80));
  console.log(`
# Logto Authentication (Shared with main app)
LOGTO_ENDPOINT=${ENV_UPDATES.LOGTO_ENDPOINT}
LOGTO_ISSUER=${ENV_UPDATES.LOGTO_ISSUER}
LOGTO_JWKS_URL=${ENV_UPDATES.LOGTO_JWKS_URL}
LOGTO_API_RESOURCE=${ENV_UPDATES.LOGTO_API_RESOURCE}

# Admin UI (port 5175)
VITE_LOGTO_APP_ID=${ENV_UPDATES.VITE_LOGTO_APP_ID}
VITE_LOGTO_API_RESOURCE=${ENV_UPDATES.VITE_LOGTO_API_RESOURCE}

# Widget (port 5174)
VITE_WIDGET_LOGTO_APP_ID=${ENV_UPDATES.VITE_WIDGET_LOGTO_APP_ID}
`);
  console.log('─'.repeat(80));
  
  console.log('\n📚 NEXT STEPS:\n');
  console.log('1. ✅ Configuration automatically saved to shady/.env');
  console.log('2. Restart backend: cd shady && make backend-dev');
  console.log('3. Start admin UI: cd shady/admin && bun dev');
  console.log('4. Start widget: cd shady/widget && bun dev');
  console.log('\n5. Login to admin UI at http://localhost:5175');
  console.log('   - Use a user from your main Logto instance');
  console.log('   - User must be member of an organization');
  console.log('   - Assign booking roles in Logto admin console\n');
  
  console.log('🔐 ROLE ASSIGNMENTS:');
  console.log('   Go to Logto Admin Console → Organizations → Select Org → Members');
  console.log('   Assign these roles to users:');
  ORG_ROLES.forEach(role => {
    console.log(`   - ${role.name}: ${role.description}`);
  });
  
  console.log('\n' + '='.repeat(80) + '\n');
}

async function promptForConfirmation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n⚠️  This will create/update resources in Logto. Continue? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║        BOOKING SERVICE LOGTO SETUP - Complete SPA Configuration          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  
  // Load .env from shady directory
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('\n❌ Error: .env file not found at:', envPath);
    console.error('   Please create .env file with Logto management credentials.\n');
    process.exit(1);
  }

  // Parse .env manually (simple parser)
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#][^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });

  const managementAppId = process.env.LOGTO_MANAGEMENT_APP_ID;
  const managementAppSecret = process.env.LOGTO_MANAGEMENT_APP_SECRET;

  if (!managementAppId || !managementAppSecret) {
    console.error('\n❌ Error: Logto management credentials not found in .env');
    console.error('   Required: LOGTO_MANAGEMENT_APP_ID and LOGTO_MANAGEMENT_APP_SECRET\n');
    console.error('   Get these from Logto Admin Console → Applications → Machine-to-Machine\n');
    process.exit(1);
  }

  console.log(`\n🔗 Logto Endpoint: ${LOGTO_ENDPOINT}`);
  console.log(`📋 Management App: ${managementAppId.slice(0, 8)}...`);
  
  const confirmed = await promptForConfirmation();
  if (!confirmed) {
    console.log('\n❌ Setup cancelled by user\n');
    process.exit(0);
  }

  // Load .env file for updates
  const envDoc = loadEnvFile(envPath);

  try {
    const client = new LogtoClient(LOGTO_ENDPOINT, managementAppId, managementAppSecret);

    // Step 1: Create/update API resource
    const resource = await createOrUpdateApiResource(client);

    // Step 2: Create/update Admin SPA
    const adminApp = await createOrUpdateSpaApp(client, ADMIN_APP, resource.id);

    // Step 3: Create/update Widget SPA
    const widgetApp = await createOrUpdateSpaApp(client, WIDGET_APP, resource.id);

    // Step 4: Update organization template with booking roles
    await updateOrganizationTemplate(client, resource.id);

    // Step 5: Display configuration and update .env
    await displayConfiguration(adminApp, widgetApp, envDoc);

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
