import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '$env/static/private';

export function getDatabaseUrl(): string {
  return `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public&connection_limit=5&pool_timeout=60&statement_timeout=30000&idle_in_transaction_session_timeout=30000&application_name=amazon-review-automation`;
}

// Set the DATABASE_URL environment variable for Prisma
process.env.DATABASE_URL = getDatabaseUrl();
