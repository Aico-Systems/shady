import { eq } from 'drizzle-orm';
import { db } from '../db';
import { bookingConfigs, organizations } from '../db/schema';
import { getLogger } from '../logger';
import {
  logtoManagementService,
  type LogtoOrganization,
  type LogtoUser
} from './logtoManagementService';

const logger = getLogger('organizationSyncService');

type UserOrganizationSummary = {
  id: string;
  name: string;
  description: string | null;
  role: string;
};

function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);
}

class OrganizationSyncService {
  private async buildUniqueBookingSlug(orgName: string, orgId: string): Promise<string> {
    const baseSlug = slugifyOrganizationName(orgName) || `org-${orgId.slice(0, 8)}`;
    const candidates = [
      baseSlug,
      `${baseSlug}-${orgId.slice(0, 6)}`,
      `org-${orgId.slice(0, 8)}`
    ];

    for (const candidate of candidates) {
      const existing = await db.query.bookingConfigs.findFirst({
        where: eq(bookingConfigs.bookingSlug, candidate)
      });

      if (!existing || existing.organizationId === orgId) {
        return candidate;
      }
    }

    let counter = 2;
    while (counter < 100) {
      const candidate = `${baseSlug}-${counter}`;
      const existing = await db.query.bookingConfigs.findFirst({
        where: eq(bookingConfigs.bookingSlug, candidate)
      });

      if (!existing || existing.organizationId === orgId) {
        return candidate;
      }

      counter += 1;
    }

    return `org-${orgId.slice(0, 8)}`;
  }

  private async ensureBookingConfig(orgId: string, orgName: string): Promise<void> {
    const existingConfig = await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.organizationId, orgId)
    });

    if (existingConfig) {
      return;
    }

    const bookingSlug = await this.buildUniqueBookingSlug(orgName, orgId);
    await db.insert(bookingConfigs).values({
      organizationId: orgId,
      bookingSlug
    }).onConflictDoNothing();
  }

  async upsertOrganization(logtoOrg: LogtoOrganization): Promise<void> {
    await db.insert(organizations).values({
      id: logtoOrg.id,
      name: logtoOrg.name,
      metadata: logtoOrg.customData ?? {},
      updatedAt: new Date()
    }).onConflictDoUpdate({
      target: organizations.id,
      set: {
        name: logtoOrg.name,
        metadata: logtoOrg.customData ?? {},
        updatedAt: new Date()
      }
    });

    await this.ensureBookingConfig(logtoOrg.id, logtoOrg.name);
  }

  async ensureOrganization(orgId: string): Promise<void> {
    const existingOrg = await db.query.organizations.findFirst({
      where: eq(organizations.id, orgId)
    });

    if (existingOrg) {
      await this.ensureBookingConfig(existingOrg.id, existingOrg.name);
      return;
    }

    const logtoOrg = await logtoManagementService.getOrganization(orgId);
    if (!logtoOrg) {
      throw new Error(`Organization ${orgId} not found in Logto`);
    }

    await this.upsertOrganization(logtoOrg);
  }

  async syncOrganizationsForUser(userId: string): Promise<UserOrganizationSummary[]> {
    const userOrganizations = await logtoManagementService.getUserOrganizations(userId);

    await Promise.all(userOrganizations.map((org) => this.upsertOrganization(org)));

    return await Promise.all(userOrganizations.map(async (org) => {
      let role = 'Member';

      try {
        const roles = await logtoManagementService.getUserOrganizationRoles(userId, org.id);
        if (roles.length > 0) {
          role = roles.map((item) => item.name).join(', ');
        }
      } catch (error: any) {
        logger.warn('Failed to resolve organization role', {
          userId,
          orgId: org.id,
          error: error.message
        });
      }

      return {
        id: org.id,
        name: org.name,
        description: org.description ?? null,
        role
      };
    }));
  }

  async syncAllOrganizations(): Promise<number> {
    const allOrganizations = await logtoManagementService.listOrganizations();
    await Promise.all(allOrganizations.map((org) => this.upsertOrganization(org)));
    return allOrganizations.length;
  }

  async ensurePersonalOrganization(userId: string): Promise<{ organizationId: string; created: boolean }> {
    const existingOrganizations = await logtoManagementService.getUserOrganizations(userId);

    if (existingOrganizations.length > 0) {
      await Promise.all(existingOrganizations.map((org) => this.upsertOrganization(org)));
      return { organizationId: existingOrganizations[0].id, created: false };
    }

    const user = await logtoManagementService.getUser(userId);
    if (!user) {
      throw new Error(`Logto user ${userId} not found`);
    }

    return await this.createPersonalOrganization(user);
  }

  async createPersonalOrganization(user: LogtoUser): Promise<{ organizationId: string; created: boolean }> {
    const userName =
      user.name ||
      user.username ||
      user.primaryEmail ||
      'User';

    const organization = await logtoManagementService.createOrganization({
      name: `${userName}'s Workspace`,
      metadata: {
        type: 'personal',
        ownerId: user.id
      }
    });

    await logtoManagementService.addUsersToOrganization(organization.id, [user.id]);

    const roles = await logtoManagementService.listRoles();
    const ownerRole = roles.find((role) => role.name === 'Owner');
    if (ownerRole) {
      await logtoManagementService.assignRolesToUser(organization.id, user.id, [ownerRole.id]);
    }

    await this.upsertOrganization(organization);

    logger.info('Created personal organization', {
      userId: user.id,
      organizationId: organization.id
    });

    return { organizationId: organization.id, created: true };
  }
}

export const organizationSyncService = new OrganizationSyncService();
