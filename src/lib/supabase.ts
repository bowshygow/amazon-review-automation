import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Database table names
export const TABLES = {
  ORDERS: 'amazon_orders',
  REVIEW_REQUESTS: 'review_requests',
  AMAZON_CONFIG: 'amazon_api_config',
  ACTIVITY_LOGS: 'activity_logs'
} as const;

// Helper function to get authenticated Supabase client
export const getAuthenticatedSupabase = () => {
  return supabase;
};

// Helper function to handle Supabase errors
export const handleSupabaseError = (error: any) => {
  console.error('Supabase error:', error);
  return {
    success: false,
    error: error.message || 'An error occurred',
    statusCode: error.code
  };
};
