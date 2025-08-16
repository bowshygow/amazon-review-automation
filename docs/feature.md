# 📄 Feature Document – Amazon Review Request Automation

---

## 1. Purpose
We are building a system that **automatically asks customers for reviews** on Amazon — but **only** for the right orders, at the right time, and in a way that follows Amazon’s rules.  
This will:
- Save time compared to manual follow-ups  
- Avoid negative reviews from returned items  
- Improve the chances of getting more positive feedback  

---

## 2. How It Works
Every day, the system will:
1. **Check all orders** that were delivered in the past.
2. **Wait 25 days** after delivery (so it’s close to the end of Amazon’s 30-day return period but still within Amazon’s **5–30 day review request rule**).
3. **Skip returned orders** so we don’t request reviews from unhappy buyers.
4. **Send Amazon’s official review request** for eligible orders.
5. **Record everything** in our system so we know exactly what was sent and why.

---

## 3. Main Features

### Automated Review Requests
- Sent exactly **25 days** after delivery  
- Ensures **Amazon policy compliance** (5–30 day window)  
- Uses Amazon’s **standardized email format** (safe & localized)  

### Return Check
- Orders with returns are **automatically excluded**  
- Helps avoid unnecessary or negative reviews  

### Activity Tracking
- Every action is **logged** (sent, skipped, error)  
- Easy to see which orders got requests and why others didn’t  

### Dashboard
- **Overview statistics** (How many requests sent, skipped, errors)  
- **Search & filter** by order date, status, product, or marketplace  
- **Detailed view** for each order (delivery date, return status, review request status)  
- **Retry button** for failed requests  

### Safe & Reliable
- Works automatically every day  
- Follows Amazon rules strictly  
- Can be paused or adjusted anytime  

---

## 4. Benefits
- **Increase positive reviews** → better product ranking  
- **Reduce manual work** → no need to track orders by hand  
- **Avoid policy violations** → keeps your seller account safe  
- **Get insights** → know exactly how many requests are being sent and their results  

---

## 5. Example Flow
- **Day 1:** Order delivered to customer  
- **Day 25:** System checks — order is not returned → sends review request  
- **Day 26:** Dashboard shows the request was sent successfully  
