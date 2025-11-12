-- ============================================================================
-- Booking Service - Extensions & Core Functions
-- Sets up PostgreSQL extensions and utility functions
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for text search (if needed for future search features)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------------------
-- Utility Functions
-- ---------------------------------------------------------------------------

/**
 * Automatically update the updated_at timestamp on row updates
 * Used by triggers on tables with updated_at columns
 */
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
