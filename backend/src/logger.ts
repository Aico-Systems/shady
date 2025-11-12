import { createConsola, ConsolaInstance } from 'consola';

function parseLevel(raw?: string): number {
  if (!raw) return 3; // default: info
  const map: Record<string, number> = {
    fatal: 0,
    error: 0,
    warn: 1,
    info: 3,
    log: 2,
    debug: 4,
    trace: 5,
    silent: -999
  };
  return map[raw.toLowerCase()] ?? 3;
}

const logger: ConsolaInstance = createConsola({
  level: parseLevel(process.env.LOG_LEVEL || 'INFO'),
  formatOptions: {
    colors: true,
    columns: 120,
    compact: false,
    date: true
  }
});

// Wrap console output
try {
  logger.wrapAll();
} catch (e) {
  // ignore if not supported
}

export function getLogger(moduleName = ''): ConsolaInstance {
  return moduleName ? logger.withTag(moduleName) : logger;
}

export { logger };
