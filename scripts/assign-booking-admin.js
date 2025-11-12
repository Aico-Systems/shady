#!/usr/bin/env node

/**
 * Quick script to assign Booking Admin role to a user in an organization
 * Usage: node scripts/assign-booking-admin.js <userId> <orgId>
 * Or without args to use defaults from current session
 */

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

async function assignBookingAdminRole(userId, orgId) {
  console.log('🔐 Getting management token...');
  const token = await getManagementToken();

  // Get Booking Admin role
  console.log('🔍 Finding Booking Admin role...');
  const rolesResponse = await fetch(`${LOGTO_ENDPOINT}/api/organization-roles`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const roles = await rolesResponse.json();
  const bookingAdminRole = roles.find(r => r.name === 'Booking Admin');

  if (!bookingAdminRole) {
    console.error('❌ Booking Admin role not found. Run: make logto-setup');
    process.exit(1);
  }

  console.log(`✓ Found role: ${bookingAdminRole.name} (${bookingAdminRole.id})`);

  // Get organization member
  console.log(`🔍 Checking user ${userId} in organization ${orgId}...`);
  const memberResponse = await fetch(
    `${LOGTO_ENDPOINT}/api/organizations/${orgId}/users/${userId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!memberResponse.ok) {
    console.error('❌ User is not a member of this organization');
    process.exit(1);
  }

  // Assign role
  console.log('📝 Assigning Booking Admin role...');
  const assignResponse = await fetch(
    `${LOGTO_ENDPOINT}/api/organizations/${orgId}/users/${userId}/roles`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organizationRoleIds: [bookingAdminRole.id]
      })
    }
  );

  if (!assignResponse.ok) {
    const error = await assignResponse.text();
    console.error('❌ Failed to assign role:', error);
    process.exit(1);
  }

  console.log('✅ Successfully assigned Booking Admin role!');
  console.log('\n🔄 Please refresh the admin UI (http://localhost:5175) and login again.');
}

// Get args or use defaults
const userId = process.argv[2] || 'uplhl0qmcws9'; // From your console logs
const orgId = process.argv[3] || '15mkie9dh7jq'; // From your console logs

console.log(`\n📋 Assigning Booking Admin role:`);
console.log(`   User: ${userId}`);
console.log(`   Organization: ${orgId}\n`);

assignBookingAdminRole(userId, orgId).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
