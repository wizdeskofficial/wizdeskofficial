// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

console.log('🔧 Database Configuration:');
console.log('  Host:', process.env.DB_HOST);
console.log('  User:', process.env.DB_USER);
console.log('  Database:', process.env.DB_NAME);
console.log('  Port:', process.env.DB_PORT);

// Reduced connection pool size for Aiven
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false,
    require: true
  },
  // Reduced pool size for Aiven limitations
  max: 10, // Reduced from 20
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Add these to prevent connection leaks
  maxUses: 7500, // Close connection after 7500 queries
});

// Test database connection
const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('✅ Database connected successfully');
    
    const result = await client.query('SELECT version()');
    console.log('📊 PostgreSQL Version:', result.rows[0].version);
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  } finally {
    if (client) client.release();
  }
};

// Helper function to safely add column if it doesn't exist
const safeAddColumn = async (tableName, columnName, columnDefinition) => {
  try {
    await pool.query(`
      ALTER TABLE ${tableName} 
      ADD COLUMN IF NOT EXISTS ${columnName} ${columnDefinition}
    `);
    console.log(`✅ Added column ${columnName} to ${tableName}`);
  } catch (error) {
    console.log(`ℹ️ Column ${columnName} already exists in ${tableName}`);
  }
};

// Create tables if they don't exist
const initDb = async () => {
  try {
    // First test connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // Users table with member approval system
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        team_code VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns to users table
    await safeAddColumn('users', 'status', 'VARCHAR(20) DEFAULT \'pending\'');
    await safeAddColumn('users', 'approved_by', 'INTEGER REFERENCES users(id)');
    await safeAddColumn('users', 'approved_at', 'TIMESTAMP');
    await safeAddColumn('users', 'rejected_by', 'INTEGER REFERENCES users(id)');
    await safeAddColumn('users', 'rejected_at', 'TIMESTAMP');
    await safeAddColumn('users', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    
    // ✅ ADD EMAIL VERIFICATION COLUMNS HERE
    await safeAddColumn('users', 'email_verified', 'BOOLEAN DEFAULT FALSE');
    await safeAddColumn('users', 'email_verification_token', 'VARCHAR(100)');
    await safeAddColumn('users', 'email_verification_expires', 'TIMESTAMP');
    await safeAddColumn('users', 'team_name', 'VARCHAR(255)'); // For leaders who haven't created team yet

    // Add constraint for status if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD CONSTRAINT users_status_check 
        CHECK (status IN ('pending', 'approved', 'rejected'))
      `);
    } catch (error) {
      console.log('ℹ️ Status constraint already exists');
    }

    // Add constraint for role if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD CONSTRAINT users_role_check 
        CHECK (role IN ('leader', 'member'))
      `);
    } catch (error) {
      console.log('ℹ️ Role constraint already exists');
    }

    // Teams table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        team_code VARCHAR(10) UNIQUE NOT NULL,
        team_name VARCHAR(255) NOT NULL,
        leader_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tasks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        team_code VARCHAR(10) NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'active'
      )
    `);

    // Add missing columns to tasks table
    await safeAddColumn('tasks', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    // Subtasks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subtasks (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        assigned_to INTEGER REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'available',
        progress VARCHAR(50) DEFAULT 'not_started',
        deadline TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns to subtasks table
    await safeAddColumn('subtasks', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');

    // Add ON DELETE CASCADE to subtasks if not exists
    try {
      await pool.query(`
        ALTER TABLE subtasks 
        DROP CONSTRAINT IF EXISTS subtasks_task_id_fkey,
        ADD CONSTRAINT subtasks_task_id_fkey 
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      `);
    } catch (error) {
      console.log('ℹ️ Subtasks cascade constraint already set');
    }

    // Add constraints for subtasks
    try {
      await pool.query(`
        ALTER TABLE subtasks 
        ADD CONSTRAINT subtasks_status_check 
        CHECK (status IN ('available', 'assigned', 'taken', 'completed'))
      `);
    } catch (error) {
      console.log('ℹ️ Subtasks status constraint already exists');
    }

    try {
      await pool.query(`
        ALTER TABLE subtasks 
        ADD CONSTRAINT subtasks_progress_check 
        CHECK (progress IN ('not_started', 'assigned', 'in_progress', 'testing', 'completed'))
      `);
    } catch (error) {
      console.log('ℹ️ Subtasks progress constraint already exists');
    }

    console.log('✅ Database tables initialized successfully');

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_team_code ON users(team_code)',
      'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
      'CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_team_code ON tasks(team_code)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id)',
      'CREATE INDEX IF NOT EXISTS idx_subtasks_assigned_to ON subtasks(assigned_to)',
      'CREATE INDEX IF NOT EXISTS idx_subtasks_status ON subtasks(status)'
    ];

    for (const indexQuery of indexes) {
      try {
        await pool.query(indexQuery);
      } catch (error) {
        console.log(`ℹ️ Index already exists: ${indexQuery}`);
      }
    }

    console.log('✅ Database indexes created successfully');

    // Safely update existing users to have proper status
    try {
      // Check if status column exists and has data
      const statusCheck = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'status'
        ) as column_exists
      `);

      if (statusCheck.rows[0].column_exists) {
        // Update leaders
        await pool.query(`
          UPDATE users 
          SET status = 'approved',
              updated_at = CURRENT_TIMESTAMP
          WHERE (status IS NULL OR status = '') AND role = 'leader'
        `);

        // Update existing members
        await pool.query(`
          UPDATE users 
          SET status = 'approved',
              updated_at = CURRENT_TIMESTAMP
          WHERE (status IS NULL OR status = '') AND role = 'member'
        `);

        console.log('✅ Existing users updated with proper approval status');
      }
    } catch (updateError) {
      console.log('ℹ️ User status update skipped:', updateError.message);
    }

    // Update existing users to have email_verified = true
    try {
      await pool.query(`
        UPDATE users 
        SET email_verified = true 
        WHERE email_verified IS NULL
      `);
      console.log('✅ Existing users marked as email verified');
    } catch (updateError) {
      console.log('ℹ️ Email verification update skipped:', updateError.message);
    }

    // Verify data integrity with error handling
    try {
      const usersCheck = await pool.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_users,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_users,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_users,
          COUNT(CASE WHEN role = 'leader' THEN 1 END) as leaders,
          COUNT(CASE WHEN role = 'member' THEN 1 END) as members,
          COUNT(CASE WHEN email_verified = true THEN 1 END) as verified_users
        FROM users
      `);

      const stats = usersCheck.rows[0];
      console.log('📊 Database Statistics:');
      console.log(`   Total Users: ${stats.total_users}`);
      console.log(`   Leaders: ${stats.leaders}`);
      console.log(`   Members: ${stats.members}`);
      console.log(`   Approved Users: ${stats.approved_users}`);
      console.log(`   Pending Users: ${stats.pending_users}`);
      console.log(`   Rejected Users: ${stats.rejected_users}`);
      console.log(`   Verified Users: ${stats.verified_users}`);
    } catch (statsError) {
      console.log('ℹ️ Could not generate statistics (tables may be empty or schema different)');
    }

    console.log('🎉 Database initialization completed successfully!');

  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  }
};

// Function to reset database (for development only)
const resetDatabase = async () => {
  try {
    console.log('🔄 Resetting database...');
    
    await pool.query('DROP TABLE IF EXISTS subtasks CASCADE');
    await pool.query('DROP TABLE IF EXISTS tasks CASCADE');
    await pool.query('DROP TABLE IF EXISTS teams CASCADE');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');
    
    console.log('✅ Database reset successfully');
    await initDb();
  } catch (error) {
    console.error('❌ Database reset error:', error.message);
    throw error;
  }
};

// Function to check database health
const checkDatabaseHealth = async () => {
  try {
    const client = await pool.connect();
    
    const connections = await client.query(`
      SELECT count(*) as active_connections 
      FROM pg_stat_activity 
      WHERE datname = $1
    `, [process.env.DB_NAME]);
    
    const tableSizes = await client.query(`
      SELECT 
        table_name,
        pg_size_pretty(pg_total_relation_size(table_name)) as size
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY pg_total_relation_size(table_name) DESC
    `);
    
    client.release();
    
    console.log('🏥 Database Health Check:');
    console.log(`   Active Connections: ${connections.rows[0].active_connections}`);
    console.log('   Table Sizes:');
    tableSizes.rows.forEach(table => {
      console.log(`     ${table.table_name}: ${table.size}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Database health check failed:', error.message);
    return false;
  }
};

// Function to backup database schema
const backupSchema = async () => {
  try {
    const client = await pool.connect();
    
    const schema = await client.query(`
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    
    client.release();
    
    console.log('💾 Database Schema Backup:');
    let currentTable = '';
    schema.rows.forEach(column => {
      if (column.table_name !== currentTable) {
        currentTable = column.table_name;
        console.log(`\n   Table: ${currentTable}`);
      }
      console.log(`     ${column.column_name} (${column.data_type}) ${column.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Schema backup failed:', error.message);
    return false;
  }
};

module.exports = { 
  pool, 
  initDb, 
  testConnection,
  resetDatabase,
  checkDatabaseHealth,
  backupSchema
};

// Add connection error handling to your existing pool configuration
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Add this helper function for safe query execution
const safeQuery = async (query, params = []) => {
    const client = await pool.connect();
    try {
        const result = await client.query(query, params);
        return result;
    } finally {
        client.release();
    }
};