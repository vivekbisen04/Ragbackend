# RAG News Chatbot Backend

RAG-powered news chatbot backend with real-time RSS feeds, vector embeddings, and conversational AI.

##  Live Deployment

- **Backend API:** https://ragbackend-io08.onrender.com
- **Frontend Demo:** https://ragfrontend-nu.vercel.app
- **GitHub Frontend:** https://github.com/vivekbisen04/Ragfrontend
- **GitHub Backend:** https://github.com/vivekbisen04/Ragbackend

##  For Reviewers

### Quick Test Endpoints
```bash
# Populate with real RSS articles (required first)
curl -X POST "https://ragbackend-io08.onrender.com/api/admin/scrape-articles" \
  -H "X-Admin-Key: secure-admin-key-2025-rag-chatbot"

# Test chat functionality
curl -X POST "https://ragbackend-io08.onrender.com/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the latest AI developments?", "sessionId": "test-session"}'

# Get available articles
curl "https://ragbackend-io08.onrender.com/api/articles"
```

### Key Features Demonstrated
- **RAG Pipeline:** Vector similarity search with Qdrant Cloud
- **Real News:** 8 RSS sources (BBC, Reuters, TechCrunch, CNN)
- **AI Integration:** Google Gemini with 768-dim Jina embeddings
- **Session Management:** Redis-based conversation history
- **Production Ready:** Deployed on Render + Qdrant Cloud + Upstash Redis

##  Features

- **RAG Pipeline**: Advanced retrieval-augmented generation with Qdrant vector database
- **AI Integration**: Google Gemini AI for natural conversations
- **Vector Embeddings**: Jina AI embeddings (768-dimensional) for semantic search
- **Daily News Refresh**: Automated news corpus management with cleanup and scraping
- **Session Management**: Redis-based caching and conversation history
- **Multi-Source News**: 7+ news sources (BBC, Reuters, Times of India, etc.)
- **Rate Limiting**: Express-based rate limiting for API protection
- **Health Monitoring**: Comprehensive service health checks

##  Tech Stack

- **Runtime**: Node.js 18+ with ES modules
- **Framework**: Express.js with CORS and Helmet security
- **Database**: Qdrant vector database for embeddings
- **Cache**: Redis for session and search result caching
- **AI Services**: Google Gemini AI, Jina AI embeddings
- **Scheduling**: Node-cron for automated tasks
- **Monitoring**: Morgan logging, custom health checks

##  Prerequisites

- Node.js 18.0.0 or higher
- Docker and Docker Compose
- Qdrant vector database
- Redis server
- API keys for Google Gemini and Jina AI


##  API Endpoints

### Chat API (`/api/chat`)
- `POST /chat` - Send message and get AI response
- `GET /chat/sessions` - List chat sessions
- `GET /chat/sessions/:sessionId` - Get session history
- `DELETE /chat/sessions/:sessionId` - Delete session

### Search API (`/api/search`)
- `POST /search` - Search news articles with vector similarity
- `GET /search/stats` - Get search service statistics

### News Management (`/api/news-management`)
- `GET /status` - Service status and statistics
- `POST /refresh` - Manual news refresh
- `POST /cleanup` - Cleanup old articles
- `GET /articles` - List articles with filters
- `DELETE /articles/:id` - Remove specific article
- `POST /scheduler/start` - Start automated scheduler

### Health Check (`/api/health`)
- `GET /health` - Service health status

## Architecture

- **Frontend:** React.js + SCSS + Axios → Vercel
- **Backend:** Node.js + Express + ES modules → Render
- **Vector DB:** Qdrant Cloud (768-dim embeddings)
- **Cache:** Upstash Redis (sessions + responses)
- **AI:** Google Gemini + Jina AI embeddings
- **News:** 8 RSS feeds with real-time scraping

##  Daily News Refresh

The system automatically:
- Removes articles older than 7 days (configurable)
- Scrapes fresh news from multiple sources
- Updates vector embeddings
- Clears stale caches
- Optimizes database performance

### Manual Control
```bash
# Check status
npm run refresh:news status

# Force refresh
npm run refresh:news refresh

# Cleanup only
npm run refresh:news cleanup
```

##  Project Structure

```
backend/
├── src/
│   ├── server.js              # Main server entry point
│   ├── routes/                # API route handlers
│   │   ├── chat.js           # Chat endpoints
│   │   ├── search.js         # Search endpoints
│   │   └── newsManagement.js # News management API
│   ├── services/             # Core business logic
│   │   ├── ragRetrievalService.js     # RAG pipeline
│   │   ├── chatService.js             # Chat management
│   │   ├── dailyNewsRefreshService.js # Auto refresh
│   │   ├── qdrantService.js           # Vector database
│   │   ├── jinaEmbeddingService.js    # Embeddings
│   │   └── redisService.js            # Cache layer
│   ├── scripts/              # Utility scripts
│   │   ├── scrapeIndianNews.js       # News scraping
│   │   ├── generateEmbeddings.js     # Embedding generation
│   │   └── refreshNews.js            # Manual refresh
│   └── middleware/           # Express middleware
├── data/                     # Data storage
├── .env                      # Environment configuration
├── package.json             # Dependencies and scripts
└── Dockerfile              # Container configuration
```

##  Monitoring

### Health Checks
```bash
# Service health
curl http://localhost:3001/api/health

# News refresh status
curl http://localhost:3001/api/news-management/status

# Search statistics
curl http://localhost:3001/api/search/stats
```

### Logs
- Server logs: Console output with timestamps
- Daily refresh: Automated logging with statistics
- Error tracking: Comprehensive error handling

##  Development

### Scripts
- `npm run dev` - Development server with nodemon
- `npm start` - Production server
- `npm test` - Run test suite
- `npm run lint` - ESLint code checking

### Environment Modes
- `development` - Full logging, auto-restart
- `production` - Optimized performance, minimal logging