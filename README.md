# Amazon Review Automation

A fullstack application built with SvelteKit and Supabase that automatically sends review requests for Amazon orders, following Amazon's policies and best practices.

## 🚀 Features

### Core Functionality
- **Automated Review Requests**: Sends review requests exactly 25 days after delivery
- **Return Check**: Automatically excludes returned orders to avoid negative reviews
- **Amazon Policy Compliance**: Follows Amazon's 5-30 day review request window
- **Activity Tracking**: Comprehensive logging of all actions and decisions

### Dashboard & Analytics
- **Real-time Statistics**: Overview of total orders, eligible orders, and request status
- **Order Management**: View, filter, and search through all orders
- **Review Request Tracking**: Monitor the status of all review requests
- **Activity Logs**: Detailed audit trail of all system actions

### Safety & Reliability
- **Error Handling**: Robust error handling with retry mechanisms
- **Rate Limiting**: Respects Amazon API rate limits
- **Data Validation**: Ensures data integrity and policy compliance
- **Manual Override**: Ability to pause, resume, or manually trigger actions

## 🛠️ Tech Stack

- **Frontend**: SvelteKit with TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **API Integration**: Amazon Selling Partner API
- **Deployment**: Vercel/Netlify ready

## 📋 Prerequisites

- Node.js 24.x or higher
- Supabase account and project
- Amazon Selling Partner API credentials

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd amazon-review-automation
npm install
```

### 2. Environment Setup

Copy the environment example file and configure your variables:

```bash
cp env.example .env.local
```

Fill in your configuration:

```env
# Supabase Configuration
PUBLIC_SUPABASE_URL=your_supabase_project_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Amazon SP API Configuration
AMAZON_CLIENT_ID=your_amazon_client_id
AMAZON_CLIENT_SECRET=your_amazon_client_secret
AMAZON_REFRESH_TOKEN=your_amazon_refresh_token
AMAZON_MARKETPLACE_ID=your_marketplace_id
```

### 3. Database Setup

1. Create a new Supabase project
2. Run the database schema in your Supabase SQL editor:

```sql
-- Copy and paste the contents of supabase-schema.sql
```

### 4. Development

```bash
npm run dev
```

Visit `http://localhost:5173` to see the application.

## 📊 Database Schema

### Tables

1. **amazon_orders**: Stores all Amazon orders with delivery and review request status
2. **review_requests**: Tracks all review request attempts and their outcomes
3. **amazon_api_config**: Stores Amazon API credentials and configuration
4. **activity_logs**: Comprehensive audit trail of all system actions

### Key Relationships

- Each order can have multiple review request attempts
- Activity logs reference orders for detailed tracking
- API configuration is centralized for easy management

## 🔧 Configuration

### Amazon SP API Setup

1. **Create Amazon Developer Account**: Register at [Amazon Developer Portal](https://developer.amazon.com/)
2. **Create Application**: Set up a new application in the SP API console
3. **Get Credentials**: Obtain your Client ID, Client Secret, and Refresh Token
4. **Configure Permissions**: Ensure your app has the necessary permissions:
   - Orders API
   - Reports API
   - Solicitations API

### Supabase Configuration

1. **Create Project**: Set up a new Supabase project
2. **Run Schema**: Execute the provided SQL schema
3. **Configure RLS**: Adjust Row Level Security policies as needed
4. **Get Credentials**: Copy your project URL and anon key

## 🎯 How It Works

### Daily Automation Process

1. **Order Eligibility Check**: 
   - Finds orders delivered 25+ days ago
   - Excludes returned orders
   - Excludes orders with existing review requests

2. **Amazon API Integration**:
   - Checks if order is eligible for solicitation
   - Sends review request via Amazon's official API
   - Handles API responses and errors

3. **Status Tracking**:
   - Records successful requests
   - Logs failed attempts with retry logic
   - Updates order status accordingly

### Review Request Logic

- **Timing**: Exactly 25 days after delivery (within Amazon's 5-30 day window)
- **Eligibility**: Only for delivered, non-returned orders
- **Frequency**: One request per order maximum
- **Retry Logic**: Up to 3 retry attempts for failed requests

## 📈 Dashboard Features

### Statistics Overview
- Total orders in system
- Orders eligible for review requests
- Successfully sent requests
- Failed requests requiring attention
- Returned orders (excluded from requests)

### Recent Activity
- Today's review requests
- Weekly and monthly summaries
- Failed request retry attempts
- System automation runs

### Order Management
- Search and filter orders
- View detailed order information
- Track review request status
- Manual override capabilities

## 🔒 Security & Compliance

### Amazon Policy Compliance
- Respects 5-30 day review request window
- Uses official Amazon SP API
- Follows rate limiting guidelines
- Implements proper error handling

### Data Security
- Row Level Security (RLS) enabled
- Encrypted API credentials
- Audit trail for all actions
- Secure environment variable handling

## 🚀 Deployment

### Vercel Deployment

1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Configure Environment**: Add environment variables in Vercel dashboard
3. **Deploy**: Vercel will automatically build and deploy your application

### Netlify Deployment

1. **Connect Repository**: Link your GitHub repository to Netlify
2. **Build Settings**: Configure build command and output directory
3. **Environment Variables**: Add your environment variables
4. **Deploy**: Netlify will build and deploy your application

## 🔧 API Endpoints

### Automation Endpoints

- `POST /api/automation/run-daily`: Trigger daily automation
- `POST /api/automation/retry-failed`: Retry failed review requests
- `POST /api/automation/sync-orders`: Sync orders from Amazon

### Data Endpoints

- `GET /api/orders`: Get orders with filtering and pagination
- `GET /api/stats`: Get dashboard statistics
- `GET /api/activity`: Get activity logs

## 🐛 Troubleshooting

### Common Issues

1. **Amazon API Errors**:
   - Check API credentials and permissions
   - Verify marketplace ID is correct
   - Ensure refresh token is valid

2. **Database Connection Issues**:
   - Verify Supabase URL and key
   - Check RLS policies
   - Ensure schema is properly applied

3. **Review Request Failures**:
   - Check order eligibility in Amazon
   - Verify order is within 5-30 day window
   - Review API error messages

### Debug Mode

Enable debug logging by setting:

```env
DEBUG=true
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

1. Check the troubleshooting section
2. Review Amazon SP API documentation
3. Open an issue on GitHub
4. Contact the development team

## 🔄 Changelog

### v1.0.0
- Initial release
- Core automation functionality
- Dashboard and analytics
- Amazon SP API integration
- Supabase database integration

---

**Note**: This application is designed to help Amazon sellers automate review requests while maintaining compliance with Amazon's policies. Always review Amazon's current policies and ensure your implementation remains compliant.
