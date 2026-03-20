import { config } from './config';
import { getLogger } from './logger';
import { handleRoute } from './routes/router';
import { databaseService } from './db';
import { organizationSyncService } from './services/organizationSyncService';

declare const Bun: any;

const logger = getLogger('main');

async function startServer() {
  try {
    logger.info('='.repeat(80));
    logger.info('Booking Service - Startup Sequence');
    logger.info('='.repeat(80));

    // Step 1: Verify database connection
    logger.info('Step 1/3: Verifying database connection...');
    const db = databaseService.getDb();
    logger.info('✓ Database connection established');

    // Step 2: Sync organizations from Logto into local state
    logger.info('Step 2/3: Syncing organizations from Logto...');
    try {
      const syncedCount = await organizationSyncService.syncAllOrganizations();
      logger.info('✓ Organization sync complete', { syncedCount });
    } catch (error: any) {
      logger.warn('Initial organization sync failed; continuing with on-demand sync', {
        error: error.message
      });
    }

    // Step 3: Start HTTP server
    logger.info('Step 3/3: Starting HTTP server...');
    Bun.serve({
      port: config.PORT,
      async fetch(request: Request) {
        return await handleRoute(request);
      },
      error(error: Error) {
        logger.error('Server error', { error });
        return new Response('Internal Server Error', { status: 500 });
      }
    });

    logger.info('='.repeat(80));
    logger.info('✓ Booking Service is READY', {
      port: config.PORT,
      env: config.NODE_ENV,
      url: `http://localhost:${config.PORT}`
    });
    logger.info('='.repeat(80));

    // Setup graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);
      try {
        await databaseService.end();
        logger.info('✓ Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
