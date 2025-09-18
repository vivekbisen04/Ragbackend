import databaseService from './databaseService.js';
import redisService from './redisService.js';

class ArticleService {
  constructor() {
    this.cacheKey = 'current_articles';
    this.statsKey = 'article_stats';
    this.cacheTTL = 3600; // 1 hour cache
  }

  /**
   * Replace all articles with new scraped data
   * This clears old articles and inserts new ones
   */
  async replaceAllArticles(articles) {
    try {
      console.log(`🔄 Replacing all articles with ${articles.length} new articles`);

      // Save to database
      const result = await databaseService.replaceAllArticles(articles);

      // Clear cache to force refresh
      await Promise.all([
        redisService.del(this.cacheKey),
        redisService.del(this.statsKey)
      ]);

      console.log('✅ Articles replaced and cache cleared');
      return result;

    } catch (error) {
      console.error('❌ Failed to replace articles:', error.message);
      throw error;
    }
  }

  /**
   * Get all current articles with caching
   */
  async getAllArticles() {
    try {
      // Try cache first
      const cached = await redisService.get(this.cacheKey);
      if (cached) {
        try {
          console.log('📋 Returning articles from cache');
          return JSON.parse(cached);
        } catch (parseError) {
          console.warn('⚠️ Corrupted cache data, clearing and fetching fresh data');
          await redisService.del(this.cacheKey);
        }
      }

      // Fallback to database
      console.log('📋 Fetching articles from database');
      const articles = await databaseService.getAllArticles();

      // Cache the result
      if (articles.length > 0) {
        await redisService.set(this.cacheKey, JSON.stringify(articles), this.cacheTTL);
        console.log(`📋 Cached ${articles.length} articles for ${this.cacheTTL}s`);
      }

      return articles;

    } catch (error) {
      console.error('❌ Failed to get articles:', error.message);
      throw error;
    }
  }

  /**
   * Get article statistics with caching
   */
  async getArticleStats() {
    try {
      // Try cache first
      const cached = await redisService.get(this.statsKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (parseError) {
          console.warn('⚠️ Corrupted cache data, clearing and fetching fresh data');
          await redisService.del(this.statsKey);
        }
      }

      // Fallback to database
      const stats = await databaseService.getArticleStats();

      // Cache the result
      await redisService.set(this.statsKey, JSON.stringify(stats), this.cacheTTL);

      return stats;

    } catch (error) {
      console.error('❌ Failed to get article stats:', error.message);
      throw error;
    }
  }

  /**
   * Get enhanced articles for frontend (with metadata)
   */
  async getEnhancedArticles() {
    try {
      const articles = await this.getAllArticles();
      const stats = await this.getArticleStats();

      // Enhance articles with additional metadata for frontend display
      const enhancedArticles = articles.map((article, index) => ({
        id: article.id || `article_${index}`,
        title: article.title || 'Untitled',
        content: article.content || '',
        summary: article.summary || (article.content ? article.content.substring(0, 300) + '...' : ''),
        url: article.url || '',
        source: article.source || 'Unknown Source',
        category: article.category || 'general',
        published_date: article.published_date || new Date().toISOString(),
        author: article.metadata?.author || 'Unknown Author',
        tags: article.metadata?.tags || [],
        metadata: article.metadata || {}
      }));

      // Get unique categories and sources for filtering
      const categories = [...new Set(enhancedArticles.map(a => a.category))];
      const sources = [...new Set(enhancedArticles.map(a => a.source))];

      // Calculate additional statistics
      const totalArticles = enhancedArticles.length;
      const avgContentLength = enhancedArticles.reduce((sum, a) => sum + (a.content?.length || 0), 0) / totalArticles || 0;

      return {
        articles: enhancedArticles,
        metadata: {
          total_articles: totalArticles,
          categories: categories,
          sources: sources,
          avg_content_length: Math.round(avgContentLength),
          last_updated: stats.last_scraped || new Date().toISOString(),
          stats: stats
        }
      };

    } catch (error) {
      console.error('❌ Failed to get enhanced articles:', error.message);
      throw error;
    }
  }

  /**
   * Search articles (simple text search)
   */
  async searchArticles(query, filters = {}) {
    try {
      const articles = await this.getAllArticles();
      const searchTerm = query.toLowerCase().trim();

      // Filter articles based on search criteria
      let filteredArticles = articles.filter(article => {
        const titleMatch = article.title?.toLowerCase().includes(searchTerm);
        const contentMatch = article.content?.toLowerCase().includes(searchTerm);
        const summaryMatch = article.summary?.toLowerCase().includes(searchTerm);

        const matchesSearch = titleMatch || contentMatch || summaryMatch;
        const matchesCategory = !filters.category || article.category === filters.category;
        const matchesSource = !filters.source || article.source === filters.source;

        return matchesSearch && matchesCategory && matchesSource;
      });

      // Sort by relevance (title matches first, then content matches)
      filteredArticles.sort((a, b) => {
        const aTitle = a.title?.toLowerCase().includes(searchTerm) ? 1 : 0;
        const bTitle = b.title?.toLowerCase().includes(searchTerm) ? 1 : 0;
        return bTitle - aTitle;
      });

      // Apply limit
      if (filters.limit) {
        filteredArticles = filteredArticles.slice(0, parseInt(filters.limit));
      }

      return {
        articles: filteredArticles,
        search_info: {
          query: query,
          category: filters.category || 'all',
          source: filters.source || 'all',
          total_results: filteredArticles.length,
          searched_at: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Failed to search articles:', error.message);
      throw error;
    }
  }

  /**
   * Clear all caches
   */
  async clearCache() {
    try {
      await Promise.all([
        redisService.del(this.cacheKey),
        redisService.del(this.statsKey)
      ]);
      console.log('✅ Article caches cleared');
    } catch (error) {
      console.error('❌ Failed to clear cache:', error.message);
    }
  }

  /**
   * Health check for article service
   */
  async healthCheck() {
    try {
      const dbHealth = await databaseService.healthCheck();
      const redisHealth = redisService.isConnected();
      const articleCount = await databaseService.getArticleStats();

      return {
        database: dbHealth,
        redis: redisHealth ? 'connected' : 'disconnected',
        article_count: articleCount.total_articles,
        last_scraped: articleCount.last_scraped,
        cache_keys: {
          articles: await redisService.exists(this.cacheKey),
          stats: await redisService.exists(this.statsKey)
        }
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }
}

export default new ArticleService();