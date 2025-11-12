#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple .env parser
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  });
  
  return env;
}

const env = loadEnv();
const LOGTO_ENDPOINT = env.LOGTO_ENDPOINT || 'http://localhost:3001';
const MANAGEMENT_APP_ID = env.LOGTO_MANAGEMENT_APP_ID;
const MANAGEMENT_APP_SECRET = env.LOGTO_MANAGEMENT_APP_SECRET;

async function getManagementToken() {
  const response = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: 'https://default.logto.app/api',
      scope: 'all',
      client_id: MANAGEMENT_APP_ID,
      client_secret: MANAGEMENT_APP_SECRET
    })
  });

  const data = await response.json();
  return data.access_token;
}

async function listUserOrganizations(userId) {
  console.log('🔐 Getting management token...');
  const token = await getManagementToken();

  console.log(`\n🔍 Finding organizations for user: ${userId}\n`);
  
  // Get all organizations
  const orgsResponse = await fetch(`${LOGTO_ENDPOINT}/api/organizations`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const orgs = await orgsResponse.json();

  console.log(`Found ${orgs.length} total organizations:\n`);

  for (const org of orgs) {
    // Check if user is member
    const memberResponse = await fetch(
      `${LOGTO_ENDPOINT}/api/organizations/${org.id}/users/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (memberResponse.ok) {
      const member = await memberResponse.json();
      console.log(`✅ ${org.name} (${org.id})`);
      console.log(`   Roles: ${member.organizationRoles?.map(r => r.name).join(', ') || 'None'}\n`);
    }
  }
}

const userId = process.argv[2] || 'uplhl0qmcws9';
listUserOrganizations(userId).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
