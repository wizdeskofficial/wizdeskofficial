// backend/update-db.js
const { pool } = require('./db');

async function updateDatabase() {
  try {
    console.log('🔄 Updating database schema...');
    
    // Add deadline column to subtasks table
    await pool.query(`
      ALTER TABLE subtasks 
      ADD COLUMN IF NOT EXISTS deadline TIMESTAMP
    `);
    
    // Add updated_at column to subtasks table if it doesn't exist
    await pool.query(`
      ALTER TABLE subtasks 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    
    console.log('✅ Database schema updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating database:', error);
    process.exit(1);
  }
}

updateDatabase();