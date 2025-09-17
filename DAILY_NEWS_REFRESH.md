# Daily News Refresh System

The Daily News Refresh System automatically maintains a fresh corpus of news articles, mimicking how a real newspaper operates by removing old content and adding fresh articles each day.

## 🌟 Features

- **Automated Daily Refresh**: Scrapes fresh news at 6:00 AM daily
- **Smart Cleanup**: Removes articles older than 7 days (configurable)
- **Vector Database Management**: Automatically updates embeddings
- **Cache Management**: Clears stale search and embedding caches
- **Multiple News Sources**: Supports 7+ news sources (BBC, Reuters, Times of India, etc.)
- **API Management**: RESTful endpoints for manual control
- **Status Monitoring**: Real-time status and statistics

## 📋 Environment Configuration

Add these variables to your `.env` file:

```env
# Daily News Refresh Configuration
NEWS_RETENTION_DAYS=7              # Days to keep articles (default: 7)
DAILY_REFRESH_CRON=0 6 * * *       # Cron schedule - 6:00 AM daily
AUTO_START_SCHEDULER=true          # Auto-start scheduler on server start
MAX_ARTICLES=50                     # Maximum articles to maintain
```

## 🔄 How It Works

### Daily Refresh Process

1. **Cleanup Phase**
   - Removes articles older than `NEWS_RETENTION_DAYS`
   - Deletes corresponding vector embeddings
   - Clears related caches

2. **Scraping Phase**
   - Fetches fresh articles from all configured sources
   - Filters to include only articles from last 24 hours
   - Respects `MAX_ARTICLES` limit

3. **Processing Phase**
   - Generates embeddings for new articles
   - Updates vector database with new content
   - Optimizes database performance

4. **Cleanup Phase**
   - Performs database optimization
   - Reports refresh statistics

### Cron Schedule

Default schedule: `0 6 * * *` (6:00 AM daily)

You can customize the schedule using standard cron syntax:
- `0 6 * * *` - Daily at 6:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 8 * * 1-5` - Weekdays at 8:00 AM

## 📡 API Endpoints

### News Management API (`/api/news-management`)

#### Get Status
```bash
GET /api/news-management/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "service_status": "healthy",
    "refresh_status": {
      "totalArticles": 46,
      "latestArticleDate": "2025-09-16T18:30:00Z",
      "retentionDays": 7,
      "cronSchedule": "0 6 * * *",
      "sources": ["BBC News", "Reuters", "Times of India", ...]
    }
  }
}
```

#### Manual Refresh
```bash
POST /api/news-management/refresh
Content-Type: application/json

{
  "force": false
}
```

#### Cleanup Old Articles
```bash
POST /api/news-management/cleanup
Content-Type: application/json

{
  "days": 7,
  "clearCache": true
}
```

#### Get Articles
```bash
GET /api/news-management/articles?source=BBC&category=global&days=3&limit=10
```

#### Remove Specific Article
```bash
DELETE /api/news-management/articles/:articleId
```

#### Get Source Statistics
```bash
GET /api/news-management/sources
```

#### Start Scheduler
```bash
POST /api/news-management/scheduler/start
```

## 🛠️ Command Line Scripts

### Refresh Script
```bash
# Full refresh (cleanup + scrape new)
npm run refresh:news refresh

# Cleanup old articles only
npm run refresh:news cleanup

# Show current status
npm run refresh:news status
```

### Examples

#### Check Current Status
```bash
npm run refresh:news status
```

Output:
```
📊 Getting refresh status...
=============================
Current Status:
📰 Total Articles: 46
📅 Latest Article: 2025-09-16T18:30:00Z
🕒 Retention Days: 7
⏰ Cron Schedule: 0 6 * * *
📡 Sources: 7 configured
```

#### Manual Refresh
```bash
npm run refresh:news refresh
```

Output:
```
🔄 Starting manual news refresh...
🗑️ Removing old articles...
✅ Removed 12 old articles (older than 7 days)
📰 Scraping fresh news...
✅ Got 8 fresh articles from BBC News
✅ Got 6 fresh articles from Reuters
📊 Total fresh articles scraped: 23
📊 Updating vector database with 23 new articles...
✅ Daily refresh completed in 45230ms
```

## 📊 Monitoring & Logs

### Server Logs

The daily refresh service provides detailed logging:

```
📅 Initializing Daily News Refresh Service...
✅ Daily News Refresh Service initialized
📅 Starting daily news refresh scheduler: 0 6 * * *
✅ Daily refresh scheduler started automatically
```

### Refresh Logs

During daily refresh:

```
🌅 Starting daily news refresh...
🗑️ Removing old articles...
✅ Removed 5 old articles (older than 7 days)
🧹 Clearing related caches...
✅ Cleared 12 search cache entries
📰 Scraping fresh news...
✅ Got 8 fresh articles from Times of India
✅ Got 6 fresh articles from BBC News
📊 Total fresh articles scraped: 25
📊 Updating vector database with 25 new articles...
🔧 Performing cleanup and optimization...
✅ Vector database optimized
🎉 Daily refresh completed in 52340ms
```

## 🔧 Configuration Options

### Retention Policy

```env
NEWS_RETENTION_DAYS=7  # Keep articles for 7 days
```

- Articles older than this are automatically removed
- Vector embeddings are also cleaned up
- Affects both automatic and manual cleanup

### Cron Schedule

```env
DAILY_REFRESH_CRON=0 6 * * *  # Daily at 6:00 AM
```

Standard cron syntax:
- Minute (0-59)
- Hour (0-23)
- Day of month (1-31)
- Month (1-12)
- Day of week (0-7, 0 and 7 are Sunday)

### Auto-Start Scheduler

```env
AUTO_START_SCHEDULER=true  # Start scheduler automatically
```

- `true`: Scheduler starts when server starts
- `false`: Manual start required via API

### Article Limits

```env
MAX_ARTICLES=50  # Maximum articles to maintain
```

- Controls total article corpus size
- Older articles removed when limit exceeded
- Applies to both scraping and retention

## 🚨 Error Handling

### Common Issues

#### Scheduler Not Starting
```
⚠️ Daily refresh scheduler not auto-started (use /api/news-management/scheduler/start to start manually)
```

**Solution**: Check `AUTO_START_SCHEDULER` environment variable or start manually.

#### Service Initialization Failure
```
❌ Failed to initialize Daily News Refresh Service: Qdrant connection failed
⚠️ Server will continue without daily refresh functionality
```

**Solution**: Ensure Qdrant is running and accessible.

#### Scraping Failures
```
❌ Error scraping BBC News: Request timeout
```

**Solution**: Check network connectivity and source availability.

### Graceful Degradation

The system is designed to fail gracefully:
- Server continues running even if refresh service fails
- Individual source failures don't stop the entire refresh
- Manual operations remain available even if scheduler fails

## 🎯 Best Practices

### Production Deployment

1. **Monitor Disk Space**: Old articles are cleaned up automatically
2. **Check Logs**: Monitor daily refresh success/failure
3. **Backup Strategy**: Consider backing up article data before major updates
4. **Source Reliability**: Monitor individual news source availability

### Performance Optimization

1. **Cron Timing**: Schedule during low-traffic hours (default 6:00 AM)
2. **Retention Period**: Balance freshness vs storage (7 days default)
3. **Cache Management**: Automatic cache clearing prevents stale results
4. **Vector Optimization**: Database optimization runs after each refresh

### Maintenance

```bash
# Check service status
curl http://localhost:3001/api/news-management/status

# Manual refresh if needed
curl -X POST http://localhost:3001/api/news-management/refresh

# Clean up if storage is full
curl -X POST http://localhost:3001/api/news-management/cleanup

# Check article statistics
curl http://localhost:3001/api/news-management/sources
```

## 🔄 Migration from Manual System

If migrating from manual scraping:

1. **Existing Data**: Current articles will be maintained
2. **Schedule Transition**: Manual scraping can be disabled
3. **Configuration**: Update environment variables
4. **Testing**: Run manual refresh to verify

```bash
# Test the system
npm run refresh:news status
npm run refresh:news cleanup  # Clean old data
npm run refresh:news refresh  # Full refresh test
```

## 📈 Future Enhancements

Potential improvements:
- Email notifications for refresh status
- Web dashboard for monitoring
- Custom source management
- Article quality scoring
- Multi-language support
- RSS feed health monitoring

## 🆘 Troubleshooting

### Debug Mode

Set environment for detailed logging:
```env
NODE_ENV=development
```

### Manual Testing

```bash
# Test individual components
npm run refresh:news status    # Check current state
npm run refresh:news cleanup   # Test cleanup only
npm run refresh:news refresh   # Test full refresh
```

### Common Solutions

| Issue | Solution |
|-------|----------|
| No new articles | Check news sources, verify internet connectivity |
| Old articles not removed | Check `NEWS_RETENTION_DAYS` configuration |
| Scheduler not running | Verify `AUTO_START_SCHEDULER=true` |
| Vector database errors | Ensure Qdrant is running and accessible |
| Cache issues | Use cleanup endpoint to clear caches |

---

The Daily News Refresh System ensures your RAG chatbot always has fresh, relevant news content, automatically maintaining an optimal balance between freshness and storage efficiency.