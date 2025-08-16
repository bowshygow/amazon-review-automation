import { databaseManager } from '../src/lib/db/config/prisma.js';

async function testConnection() {
  console.log('Testing database connection...');
  
  try {
    const client = await databaseManager.getClient();
    console.log('✅ Database client obtained successfully');
    
    const result = await client.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database query executed successfully:', result);
    
    const health = await databaseManager.checkDatabaseHealth();
    console.log('✅ Database health check:', health);
    
    console.log('🎉 All tests passed! Database connection is working properly.');
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await databaseManager.disconnect();
    console.log('🔌 Database connection closed');
  }
}

testConnection();
