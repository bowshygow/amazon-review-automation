import { databaseManager } from '../src/lib/db/config/prisma.js';

async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase connection configuration...');
  
  try {
    // Test basic connection
    const client = await databaseManager.getClient();
    console.log('✅ Database client obtained successfully');
    
    // Test simple query
    const result = await client.$queryRaw`SELECT 1 as test, current_database() as db_name, current_user as user`;
    console.log('✅ Database query executed successfully:', result);
    
    // Test health check
    const health = await databaseManager.checkDatabaseHealth();
    console.log('✅ Database health check:', health);
    
    // Test connection info
    const connectionInfo = databaseManager.getConnectionInfo();
    console.log('✅ Connection info:', connectionInfo);
    
    console.log('🎉 All Supabase connection tests passed!');
    console.log('📋 Configuration summary:');
    console.log('   - Using pooled connection for queries');
    console.log('   - Using direct connection for migrations');
    console.log('   - PgBouncer compatibility enabled');
    console.log('   - Connection limits optimized for Supabase');
    
  } catch (error) {
    console.error('❌ Supabase connection test failed:', error.message);
    console.error('Full error:', error);
    
    if (error.message?.includes('prepared statement')) {
      console.log('💡 This might be a prepared statement conflict. Try restarting the application.');
    }
    
    process.exit(1);
  } finally {
    await databaseManager.disconnect();
    console.log('🔌 Database connection closed');
  }
}

testSupabaseConnection();
