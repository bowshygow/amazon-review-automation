-- Amazon Review Automation Database Schema

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Amazon Orders Table
CREATE TABLE IF NOT EXISTS amazon_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    amazon_order_id VARCHAR(255) UNIQUE NOT NULL,
    purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
    delivery_date TIMESTAMP WITH TIME ZONE NOT NULL,
    order_status VARCHAR(50) NOT NULL DEFAULT 'Shipped',
    order_total JSONB NOT NULL,
    marketplace_id VARCHAR(50) NOT NULL,
    buyer_info JSONB DEFAULT '{}',
    items JSONB DEFAULT '[]',
    is_returned BOOLEAN DEFAULT FALSE,
    return_date TIMESTAMP WITH TIME ZONE,
    review_request_sent BOOLEAN DEFAULT FALSE,
    review_request_date TIMESTAMP WITH TIME ZONE,
    review_request_status VARCHAR(50),
    review_request_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Review Requests Table
CREATE TABLE IF NOT EXISTS review_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES amazon_orders(id) ON DELETE CASCADE,
    amazon_order_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Amazon API Configuration Table
CREATE TABLE IF NOT EXISTS amazon_api_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id VARCHAR(255) NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    refresh_token TEXT NOT NULL,
    marketplace_id VARCHAR(50) NOT NULL,
    access_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    order_id UUID REFERENCES amazon_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_amazon_orders_amazon_order_id ON amazon_orders(amazon_order_id);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_delivery_date ON amazon_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_review_request_sent ON amazon_orders(review_request_sent);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_is_returned ON amazon_orders(is_returned);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_order_status ON amazon_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_marketplace_id ON amazon_orders(marketplace_id);

CREATE INDEX IF NOT EXISTS idx_review_requests_order_id ON review_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_amazon_order_id ON review_requests(amazon_order_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status);
CREATE INDEX IF NOT EXISTS idx_review_requests_created_at ON review_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_order_id ON activity_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_amazon_orders_updated_at 
    BEFORE UPDATE ON amazon_orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_review_requests_updated_at 
    BEFORE UPDATE ON review_requests 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_amazon_api_config_updated_at 
    BEFORE UPDATE ON amazon_api_config 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE amazon_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_api_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (you can modify these based on your authentication needs)
CREATE POLICY "Allow public read access to amazon_orders" ON amazon_orders
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to amazon_orders" ON amazon_orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to amazon_orders" ON amazon_orders
    FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to review_requests" ON review_requests
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to review_requests" ON review_requests
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to review_requests" ON review_requests
    FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to amazon_api_config" ON amazon_api_config
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to amazon_api_config" ON amazon_api_config
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to amazon_api_config" ON amazon_api_config
    FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to activity_logs" ON activity_logs
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to activity_logs" ON activity_logs
    FOR INSERT WITH CHECK (true);

-- Insert sample data for testing (optional)
INSERT INTO amazon_api_config (client_id, client_secret, refresh_token, marketplace_id) 
VALUES (
    'amzn1.application-oa2-client.24f67bc6eb8043d4984e840a1a22b593',
    'amzn1.oa2-cs.v1.7af80ef9fcb4698a2d1fedb545a4f68cd62d78110d4493bb64d665c0442ffdf6',
    'Atzr|IwEBIDoZskx4Zxylfme0D9XqkGiPBLJEd5KyHuRpiMM_XNu7aoGf1b64ND-nfO7CofWKkOuc4jpODrG27wJ-ECBRERtutlNpE71Qj5xuC2__twEt5WtKz-XZGPCVJlInU1-vbjwUKIqQu2TSCufHu4RVoiTJQ2Czmo71Ws19xzYIMeNNmhPVhOqhDTbYBCWElefcIky2bRTsCQJJeqbsowxeyaNCDt2Tag0XdO9pZdTxirLJkt6RWnh9kkDV2pYjG1-y9KVMqdM_5M2jyMaZ5rxcfmso3NMM4LFTZMbExZ4R6aEG2KEXFUitEDxuq7RIqYo-hFA',
    'ATVPDKIKX0DER'
) ON CONFLICT DO NOTHING;
