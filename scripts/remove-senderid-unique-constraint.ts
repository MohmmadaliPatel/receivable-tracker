import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeUniqueConstraint() {
  try {
    console.log('🔧 Removing unique constraint on senderId in forwarding_rules table...');

    // SQLite doesn't support DROP INDEX directly in a transaction, so we use raw SQL
    // First, check if the index exists
    const indexes = await prisma.$queryRaw<Array<{ name: string; sql: string }>>`
      SELECT name, sql FROM sqlite_master 
      WHERE type='index' 
      AND tbl_name='forwarding_rules'
      AND sql LIKE '%senderId%'
    `;

    console.log('📋 Found indexes:', indexes);

    // Drop the unique index if it exists
    for (const index of indexes) {
      if (index.name && index.sql?.includes('UNIQUE')) {
        console.log(`🗑️  Dropping unique index: ${index.name}`);
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${index.name}`);
        console.log(`✅ Dropped index: ${index.name}`);
      }
    }

    // Also check for unique constraints in the table definition
    const tableInfo = await prisma.$queryRaw<Array<{ sql: string }>>`
      SELECT sql FROM sqlite_master 
      WHERE type='table' 
      AND name='forwarding_rules'
    `;

    if (tableInfo.length > 0) {
      const tableSql = tableInfo[0].sql;
      if (tableSql.includes('UNIQUE') && tableSql.includes('senderId')) {
        console.log('⚠️  Found UNIQUE constraint in table definition. You may need to recreate the table.');
        console.log('Table SQL:', tableSql);
      }
    }

    console.log('✅ Unique constraint removal completed!');
    console.log('💡 You may need to run: npx prisma db push');
  } catch (error: any) {
    console.error('❌ Error removing unique constraint:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

removeUniqueConstraint()
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

