# RAG Chatbot Backend

A sophisticated RAG (Retrieval-Augmented Generation) chatbot backend that provides intelligent news-based conversations using advanced vector search and AI.

## 🚀 Features

- **RAG Pipeline**: Advanced retrieval-augmented generation with Qdrant vector database
- **AI Integration**: Google Gemini AI for natural conversations
- **Vector Embeddings**: Jina AI embeddings (768-dimensional) for semantic search
- **Daily News Refresh**: Automated news corpus management with cleanup and scraping
- **Session Management**: Redis-based caching and conversation history
- **Multi-Source News**: 7+ news sources (BBC, Reuters, Times of India, etc.)
- **Rate Limiting**: Express-based rate limiting for API protection
- **Health Monitoring**: Comprehensive service health checks

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+ with ES modules
- **Framework**: Express.js with CORS and Helmet security
- **Database**: Qdrant vector database for embeddings
- **Cache**: Redis for session and search result caching
- **AI Services**: Google Gemini AI, Jina AI embeddings
- **Scheduling**: Node-cron for automated tasks
- **Monitoring**: Morgan logging, custom health checks

## 📋 Prerequisites

- Node.js 18.0.0 or higher
- Docker and Docker Compose
- Qdrant vector database
- Redis server
- API keys for Google Gemini and Jina AI

## 🔧 Installation

1. **Clone and setup**:
   ```bash
   cd backend
   npm install
   ```

2. **Environment Configuration**:
   Copy `.env.example` to `.env` and configure:
   ```env
   # Server
   PORT=3001
   NODE_ENV=development

   # Redis
   REDIS_URL=redis://localhost:6380
   REDIS_TTL=3600

   # AI Services
   JINA_API_KEY=your_jina_api_key
   GEMINI_API_KEY=your_gemini_api_key

   # Qdrant
   QDRANT_URL=http://localhost:6333
   QDRANT_COLLECTION=news_embeddings

   # Daily Refresh
   NEWS_RETENTION_DAYS=7
   DAILY_REFRESH_CRON=0 6 * * *
   AUTO_START_SCHEDULER=true
   ```

3. **Start Services**:
   ```bash
   # Start Qdrant and Redis
   docker run -p 6333:6333 qdrant/qdrant
   docker run -p 6380:6379 redis:alpine

   # Start backend
   npm run dev
   ```

## 📡 API Endpoints

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

## 🎯 Usage Examples

### Chat with AI
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the latest developments in AI?",
    "sessionId": "user123"
  }'
```

### Search Articles
```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "artificial intelligence",
    "topK": 5,
    "filters": {
      "sources": ["BBC News", "Reuters"],
      "dateFrom": "2025-09-10"
    }
  }'
```

### Manual News Refresh
```bash
curl -X POST http://localhost:3001/api/news-management/refresh \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

## 🔄 Daily News Refresh

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

## 🏗️ Project Structure

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

## 🐳 Docker Deployment

1. **Build Image**:
   ```bash
   docker build -t rag-chatbot-backend .
   ```

2. **Run Container**:
   ```bash
   docker run -p 3001:3001 \
     --env-file .env \
     rag-chatbot-backend
   ```

3. **With Docker Compose** (create docker-compose.yml):
   ```yaml
   version: '3.8'
   services:
     backend:
       build: .
       ports:
         - "3001:3001"
       environment:
         - REDIS_URL=redis://redis:6379
         - QDRANT_URL=http://qdrant:6333
       depends_on:
         - redis
         - qdrant

     redis:
       image: redis:alpine
       ports:
         - "6380:6379"

     qdrant:
       image: qdrant/qdrant
       ports:
         - "6333:6333"
   ```

## 📊 Monitoring

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

## 🔧 Development

### Scripts
- `npm run dev` - Development server with nodemon
- `npm start` - Production server
- `npm test` - Run test suite
- `npm run lint` - ESLint code checking

### Environment Modes
- `development` - Full logging, auto-restart
- `production` - Optimized performance, minimal logging

## 🚨 Troubleshooting

### Common Issues

1. **Service Connection Errors**:
   ```bash
   # Check services are running
   docker ps

   # Restart services
   docker restart <container_name>
   ```

2. **Cache Issues**:
   ```bash
   # Clear Redis cache
   curl -X POST http://localhost:3001/api/news-management/cleanup
   ```

3. **Vector Database Issues**:
   ```bash
   # Check Qdrant health
   curl http://localhost:6333/health

   # Recreate collection
   npm run refresh:news refresh
   ```

4. **API Quota Exceeded**:
   - Check Gemini API quotas
   - Update API keys in `.env`
   - Monitor usage in logs

### Debug Mode
```bash
NODE_ENV=development npm run dev
```

## 📈 Performance

- **Search**: ~200ms average response time
- **Chat**: ~1-2s depending on context size
- **Caching**: 5-minute TTL for search results
- **Database**: Optimized for 50k+ articles
- **Concurrent Users**: Rate limited to 100 req/15min

## 🔒 Security

- Helmet.js for security headers
- Rate limiting per IP
- Input validation and sanitization
- Environment variable protection
- No sensitive data logging

## 🔄 Updates & Maintenance

- Daily automated news refresh at 6:00 AM
- Weekly vector database optimization
- Monthly dependency updates
- Quarterly performance reviews

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check troubleshooting section
2. Review logs for error details
3. Verify service configurations
4. Test with manual endpoints