import express from 'express';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import DailyNewsRefreshService from '../services/dailyNewsRefreshService.js';

const router = express.Router();
const refreshService = new DailyNewsRefreshService();

// Initialize refresh service
let refreshServiceInitialized = false;
refreshService.initialize().then(() => {
  refreshServiceInitialized = true;
  console.log('✅ Daily News Refresh Service initialized for API routes');
}).catch(err => {
  console.error('❌ Failed to initialize Daily News Refresh Service:', err.message);
});

/**
 * GET /api/news-management/status
 * Get current refresh status and statistics
 */
router.get('/status', asyncHandler(async (req, res) => {
  if (!refreshServiceInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'News management service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  try {
    const status = await refreshService.getRefreshStatus();

    res.json({
      success: true,
      data: {
        service_status: 'healthy',
        refresh_status: status,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Failed to get refresh status:', error.message);
    throw error;
  }
}));

/**
 * POST /api/news-management/refresh
 * Trigger manual news refresh
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  if (!refreshServiceInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'News management service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  const { force = false } = req.body;

  try {
    console.log(`🔄 Manual refresh triggered ${force ? '(forced)' : ''}`);

    // Start refresh in background
    const refreshPromise = refreshService.manualRefresh();

    // Return immediate response
    res.json({
      success: true,
      data: {
        message: 'News refresh started',
        timestamp: new Date().toISOString(),
        forced: force
      }
    });

    // Log completion (don't await to avoid timeout)
    refreshPromise.then(() => {
      console.log('✅ Manual refresh completed');
    }).catch(error => {
      console.error('❌ Manual refresh failed:', error.message);
    });

  } catch (error) {
    console.error('❌ Failed to start manual refresh:', error.message);
    throw error;
  }
}));

/**
 * POST /api/news-management/cleanup
 * Clean up old articles and cache
 */
router.post('/cleanup', asyncHandler(async (req, res) => {
  if (!refreshServiceInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'News management service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  const {
    days = process.env.NEWS_RETENTION_DAYS || 7,
    clearCache = true
  } = req.body;

  try {
    console.log(`🗑️ Manual cleanup triggered (${days} days retention)`);

    let results = {};

    // Remove old articles
    const removedCount = await refreshService.removeOldArticles();
    results.removedArticles = removedCount;

    // Clear cache if requested
    if (clearCache) {
      await refreshService.clearRelatedCaches();
      results.cacheCleared = true;
    }

    // Optimize
    await refreshService.cleanupAndOptimize();
    results.optimized = true;

    res.json({
      success: true,
      data: {
        message: 'Cleanup completed',
        results,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Failed to perform cleanup:', error.message);
    throw error;
  }
}));

/**
 * GET /api/news-management/articles
 * Get current articles with filtering
 */
router.get('/articles', asyncHandler(async (req, res) => {
  if (!refreshServiceInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'News management service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  const {
    source,
    category,
    days = 7,
    limit = 20,
    offset = 0
  } = req.query;

  try {
    const articles = await refreshService.loadExistingArticles();

    // Filter by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    let filteredArticles = articles.filter(article => {
      const articleDate = new Date(article.publishedDate);
      return articleDate > cutoffDate;
    });

    // Filter by source if specified
    if (source) {
      filteredArticles = filteredArticles.filter(article =>
        article.source.toLowerCase().includes(source.toLowerCase())
      );
    }

    // Filter by category if specified
    if (category) {
      filteredArticles = filteredArticles.filter(article =>
        article.category === category
      );
    }

    // Sort by date (newest first)
    filteredArticles.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));

    // Pagination
    const total = filteredArticles.length;
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedArticles = filteredArticles.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        articles: paginatedArticles,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: endIndex < total
        },
        filters: {
          source,
          category,
          days: parseInt(days)
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to get articles:', error.message);
    throw error;
  }
}));

/**
 * DELETE /api/news-management/articles/:articleId
 * Remove specific article
 */
router.delete('/articles/:articleId', asyncHandler(async (req, res) => {
  if (!refreshServiceInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'News management service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  const { articleId } = req.params;

  if (!articleId) {
    throw new ValidationError('Article ID is required');
  }

  try {
    const articles = await refreshService.loadExistingArticles();
    const articleIndex = articles.findIndex(article => article.id === articleId);

    if (articleIndex === -1) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Article not found',
          articleId
        }
      });
    }

    // Remove article from list
    const removedArticle = articles.splice(articleIndex, 1)[0];
    await refreshService.saveArticles(articles);

    // Remove from vector database
    const filter = {
      must: [{
        match: {
          article_id: articleId
        }
      }]
    };
    await refreshService.qdrantService.deletePoints(filter);

    res.json({
      success: true,
      data: {
        message: 'Article removed successfully',
        removedArticle: {
          id: removedArticle.id,
          title: removedArticle.title,
          source: removedArticle.source
        }
      }
    });

  } catch (error) {
    console.error('❌ Failed to remove article:', error.message);
    throw error;
  }
}));

/**
 * GET /api/news-management/sources
 * Get source statistics
 */
router.get('/sources', asyncHandler(async (req, res) => {
  if (!refreshServiceInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'News management service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  try {
    const articles = await refreshService.loadExistingArticles();

    // Group by source
    const sourceStats = {};
    articles.forEach(article => {
      if (!sourceStats[article.source]) {
        sourceStats[article.source] = {
          name: article.source,
          count: 0,
          categories: new Set(),
          latestDate: null
        };
      }

      sourceStats[article.source].count++;
      sourceStats[article.source].categories.add(article.category);

      const articleDate = new Date(article.publishedDate);
      if (!sourceStats[article.source].latestDate || articleDate > sourceStats[article.source].latestDate) {
        sourceStats[article.source].latestDate = articleDate;
      }
    });

    // Convert sets to arrays and format
    const sources = Object.values(sourceStats).map(source => ({
      ...source,
      categories: Array.from(source.categories),
      latestDate: source.latestDate?.toISOString()
    }));

    res.json({
      success: true,
      data: {
        sources,
        totalSources: sources.length,
        totalArticles: articles.length
      }
    });

  } catch (error) {
    console.error('❌ Failed to get source statistics:', error.message);
    throw error;
  }
}));

/**
 * POST /api/news-management/scheduler/start
 * Start the daily refresh scheduler
 */
router.post('/scheduler/start', asyncHandler(async (req, res) => {
  if (!refreshServiceInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'News management service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  try {
    refreshService.startScheduler();

    res.json({
      success: true,
      data: {
        message: 'Daily refresh scheduler started',
        schedule: refreshService.cronSchedule,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Failed to start scheduler:', error.message);
    throw error;
  }
}));

export default router;