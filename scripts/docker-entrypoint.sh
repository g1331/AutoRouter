#!/bin/sh
set -e

echo "[AutoRouter] Running database migrations..."

# Run migrations using Node.js with postgres package
node -e "
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[AutoRouter] DATABASE_URL is not set');
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1, onnotice: () => {} });
  let failed = false;

  try {
    // Check if migrations table exists, create if not
    await sql\`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    \`;

    // Get applied migrations
    const applied = await sql\`SELECT hash FROM __drizzle_migrations\`;
    const appliedHashes = new Set(applied.map(r => r.hash));

    // Read migration files
    const migrationsDir = './drizzle';
    if (!fs.existsSync(migrationsDir)) {
      console.log('[AutoRouter] No migrations directory found, skipping...');
      await sql.end();
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const hash = file.replace('.sql', '');
      if (appliedHashes.has(hash)) {
        console.log('[AutoRouter] Skipping already applied:', file);
        continue;
      }

      console.log('[AutoRouter] Applying migration:', file);
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      // Split by statement-breakpoint and execute each statement in a transaction
      const statements = content.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
      await sql.begin(async (tx) => {
        for (const stmt of statements) {
          if (stmt) await tx.unsafe(stmt);
        }
        await tx\`INSERT INTO __drizzle_migrations (hash) VALUES (\${hash})\`;
      });
      console.log('[AutoRouter] Applied:', file);
    }

    console.log('[AutoRouter] Migrations completed');
  } catch (error) {
    failed = true;
    console.error('[AutoRouter] Migration failed:', error);
  } finally {
    await sql.end();
    if (failed) process.exit(1);
  }
}

runMigrations();
"

echo "[AutoRouter] Starting application..."
exec "$@"
