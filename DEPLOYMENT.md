# Backend Deployment Guide: Railway + Qdrant Cloud + Redis

## Prerequisites
1. GitHub account (for code repository)
2. Railway account (railway.app)
3. Qdrant Cloud account (cloud.qdrant.io)

## Step 1: Set Up Qdrant Cloud

1. **Create Account:**
   - Go to https://cloud.qdrant.io/
   - Sign up with GitHub/Google

2. **Create Cluster:**
   - Click "Create Cluster"
   - Choose "Free" tier (1GB storage)
   - Select region (preferably closest to your users)
   - Wait for cluster creation (2-3 minutes)

3. **Get Credentials:**
   - Copy Cluster URL: `https://xxx-xxx-xxx.qdrant.tech`
   - Copy API Key: `qdr_xxxxxxxxxxxxxxx`

## Step 2: Push Code to GitHub

1. **Initialize Git Repository:**
   ```bash
   cd backend
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Create GitHub Repository:**
   - Go to GitHub and create new repository: `rag-chatbot-backend`
   - Push code:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/rag-chatbot-backend.git
   git branch -M main
   git push -u origin main
   ```

## Step 3: Deploy to Railway

1. **Create Railway Account:**
   - Go to https://railway.app/
   - Sign up with GitHub

2. **Create New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `rag-chatbot-backend` repository

3. **Add Redis Database:**
   - In your Railway project dashboard
   - Click "New" > "Database" > "Add Redis"
   - Wait for Redis deployment

4. **Configure Environment Variables:**
   - Go to your service settings
   - Add the following environment variables:

   ```env
   NODE_ENV=production
   PORT=3001

   # Redis (Railway will auto-provide REDIS_URL)
   REDIS_TTL=3600

   # Qdrant Cloud
   QDRANT_URL=https://your-cluster.qdrant.tech
   QDRANT_API_KEY=qdr_your_api_key_here
   QDRANT_COLLECTION=news_embeddings

   # Jina AI
   JINA_API_KEY=jina_fb41d3cf42aa408dbcb0fe04d1442a4bANVEt0hSxTAEJdw-PBEhA1_jcwcP
   JINA_API_URL=https://api.jina.ai/v1/embeddings
   JINA_MODEL=jina-embeddings-v2-base-en

   # Google Gemini
   GEMINI_API_KEY=AIzaSyCB7J2pBjYt3cf5H6xo5jchwUEhbhww4Bs

   # News Configuration
   MAX_ARTICLES=50
   SCRAPE_INTERVAL_HOURS=24

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100

   # Session Configuration
   SESSION_TTL_HOURS=24
   MAX_CONVERSATION_HISTORY=50

   # Scheduler
   NEWS_RETENTION_DAYS=7
   DAILY_REFRESH_CRON=0 6 * * *
   AUTO_START_SCHEDULER=true
   ```

5. **Deploy:**
   - Railway will automatically build and deploy
   - Wait for deployment to complete (5-10 minutes)
   - Your API will be available at: `https://your-app.up.railway.app`

## Step 4: Test Deployment

1. **Health Check:**
   ```bash
   curl https://your-app.up.railway.app/health
   ```

2. **API Documentation:**
   ```bash
   curl https://your-app.up.railway.app/api
   ```

3. **Test Article Endpoint:**
   ```bash
   curl https://your-app.up.railway.app/api/articles
   ```

## Step 5: Initial Data Setup

1. **Run News Scraping (Optional):**
   - The app will automatically scrape news on first startup
   - Check logs in Railway dashboard

2. **Monitor Logs:**
   - Go to Railway dashboard > Your service > Logs
   - Check for successful initialization messages

## Environment Variables Summary

| Variable | Description | Example |
|----------|-------------|---------|
| `QDRANT_URL` | Qdrant Cloud cluster URL | `https://xxx.qdrant.tech` |
| `QDRANT_API_KEY` | Qdrant Cloud API key | `qdr_xxxxxxxxxx` |
| `REDIS_URL` | Redis connection URL | Auto-provided by Railway |
| `JINA_API_KEY` | Jina AI embeddings API key | `jina_xxxxxxxxxx` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIzaSyxxxxxxxx` |

## Troubleshooting

1. **Build Fails:**
   - Check if all dependencies are in package.json
   - Ensure Node.js version is 18+ in engines field

2. **Redis Connection Issues:**
   - Verify Redis addon is added to Railway project
   - Check REDIS_URL is automatically set

3. **Qdrant Connection Issues:**
   - Verify Qdrant cluster is running
   - Check API key and URL are correct
   - Ensure collection name matches

4. **API Key Issues:**
   - Verify Jina AI and Gemini API keys are valid
   - Check quotas and usage limits

## Next Steps

After backend deployment:
1. Note your Railway app URL: `https://your-app.up.railway.app`
2. Use this URL for frontend deployment
3. Update frontend environment variables to point to this backend