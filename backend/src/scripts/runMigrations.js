import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sequelize } from '../database/connection.js';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the project root directory (two levels up from this script)
const projectRoot = join(__dirname, '../../..');
const migrationsDir = join(projectRoot, 'database', 'migrations');

// Migration files in order
const migrations = [
  '001_initial_schema.sql',
  '002_add_indexes.sql',
];

/**
 * Split SQL file into individual statements
 * Handles multi-line statements and comments
 */
function parseSQL(sql) {
  // Remove comments
  sql = sql.replace(/--.*$/gm, '');
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Split by semicolons, but keep statements together
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.match(/^\s*$/));
  
  return statements;
}

/**
 * Run a single migration file
 */
async function runMigration(filename) {
  const filePath = join(migrationsDir, filename);
  log.info(`Running migration: ${filename}`);
  
  try {
    const sql = await readFile(filePath, 'utf-8');
    const statements = parseSQL(sql);
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await sequelize.query(statement);
          log.debug(`Executed: ${statement.substring(0, 50)}...`);
        } catch (error) {
          // Ignore "already exists" errors for CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS
          if (error.message.includes('already exists') || 
              error.message.includes('Duplicate key name') ||
              error.message.includes('Duplicate column name')) {
            log.warn(`Skipped (already exists): ${statement.substring(0, 50)}...`);
          } else {
            throw error;
          }
        }
      }
    }
    
    log.info(`✓ Migration ${filename} completed successfully`);
    return true;
  } catch (error) {
    log.error(`✗ Migration ${filename} failed:`, error.message);
    throw error;
  }
}

/**
 * Main migration runner
 */
async function runMigrations() {
  try {
    // Test database connection
    await sequelize.authenticate();
    log.info('Database connection established');
    
    // Ensure database exists
    const dbName = sequelize.config.database;
    await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await sequelize.query(`USE \`${dbName}\`;`);
    log.info(`Using database: ${dbName}`);
    
    // Run migrations in order
    for (const migration of migrations) {
      await runMigration(migration);
    }
    
    log.info('✓ All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    log.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run migrations
runMigrations();

