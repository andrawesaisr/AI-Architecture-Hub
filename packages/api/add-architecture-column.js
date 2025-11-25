require('dotenv').config();
const { Pool } = require('pg');

async function addColumn() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Adding architectureStyle column to Project table...');
    
    await pool.query(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'Project' AND column_name = 'architectureStyle'
          ) THEN
              ALTER TABLE "Project" ADD COLUMN "architectureStyle" TEXT NOT NULL DEFAULT 'Modular';
              RAISE NOTICE 'Column added successfully';
          ELSE
              RAISE NOTICE 'Column already exists';
          END IF;
      END $$;
    `);
    
    console.log('✅ Success! Verifying...');
    
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Project'
      ORDER BY ordinal_position
    `);
    
    console.log('Project table columns:');
    result.rows.forEach(row => console.log(`  - ${row.column_name} (${row.data_type})`));
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

addColumn();
