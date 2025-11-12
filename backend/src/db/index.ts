import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config/index';
import * as schema from './schema';
import { getLogger } from '../logger';

const logger = getLogger('database');

class DatabaseService {
  private client: postgres.Sql;
  private db: PostgresJsDatabase<typeof schema>;

  constructor() {
    // Connection pool configuration
    this.client = postgres(config.DATABASE_URL, {
      max: 20, // Smaller pool for booking service
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: (msg) => logger.warn('PG notice', { msg })
    });

    this.db = drizzle(this.client, { schema });
    logger.info('Database connection initialized', {
      maxConnections: 20,
      idleTimeout: '30s',
      connectTimeout: '10s'
    });
  }

  getDb() {
    return this.db;
  }

  /**
   * Execute an operation inside a transaction
   */
  async withTransaction<T>(
    operation: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(operation);
  }

  async end(): Promise<void> {
    await this.client.end({ timeout: 5 });
    logger.info('Database connection closed');
  }
}

export const databaseService = new DatabaseService();
export const db = databaseService.getDb();
