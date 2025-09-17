import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import QdrantService from './qdrantService.js';
import NewsScraperService from './newsScraperService.js';
import JinaEmbeddingService from './jinaEmbeddingService.js';
import redisService from './redisService.js';
import { RSS_SOURCES } from '../config/newsSources.js';

class DailyNewsRefreshService {
  constructor() {
    this.qdrantService = new QdrantService();
    this.newsScraperService = new NewsScraperService();
    this.jinaService = new JinaEmbeddingService();
    this.maxArticles = parseInt(process.env.MAX_ARTICLES) || 50;
    this.retentionDays = parseInt(process.env.NEWS_RETENTION_DAYS) || 7; // Keep news for 7 days
    this.dataDir = './data';
    this.articlesFile = path.join(this.dataDir, 'scraped_articles.json');
    this.embeddingsFile = path.join(this.dataDir, 'article_embeddings.json');

    // Cron schedule: Run daily at 6:00 AM
    this.cronSchedule = process.env.DAILY_REFRESH_CRON || '0 6 * * *';
  }

  /**
   * Initialize the daily refresh service
   */
  async initialize() {
    try {
      console.log('🔄 Initializing Daily News Refresh Service...');

      await this.qdrantService.initialize();
      await this.jinaService.validateConnection();

      // Ensure data directory exists
      await this.ensureDataDirectory();

      console.log('✅ Daily News Refresh Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Daily News Refresh Service:', error.message);
      throw error;
    }
  }

  /**
   * Start the daily refresh scheduler
   */
  startScheduler() {
    console.log(`📅 Starting daily news refresh scheduler: ${this.cronSchedule}`);

    // Schedule daily refresh
    cron.schedule(this.cronSchedule, async () => {
      console.log('🌅 Starting daily news refresh...');
      try {
        await this.performDailyRefresh();
        console.log('✅ Daily news refresh completed successfully');
      } catch (error) {
        console.error('❌ Daily news refresh failed:', error.message);
      }
    });

    // Also schedule a cleanup every hour to remove expired cache
    cron.schedule('0 * * * *', async () => {
      try {
        await this.cleanupExpiredCache();
      } catch (error) {
        console.error('❌ Cache cleanup failed:', error.message);
      }
    });

    console.log('✅ Daily refresh scheduler started');
  }

  /**
   * Perform the complete daily refresh process
   */
  async performDailyRefresh() {
    const startTime = Date.now();
    console.log('🔄 Starting daily news refresh process...');

    try {
      // Step 1: Remove old articles
      await this.removeOldArticles();

      // Step 2: Clear related caches
      await this.clearRelatedCaches();

      // Step 3: Scrape fresh news
      const newArticles = await this.scrapeFreshNews();

      // Step 4: Process and embed new articles
      await this.processAndEmbedArticles(newArticles);

      // Step 5: Update vector database
      await this.updateVectorDatabase(newArticles);

      // Step 6: Cleanup and optimize
      await this.cleanupAndOptimize();

      const duration = Date.now() - startTime;
      console.log(`🎉 Daily refresh completed in ${duration}ms`);

      // Send summary
      await this.sendRefreshSummary(newArticles, duration);

    } catch (error) {
      console.error('❌ Daily refresh failed:', error.message);
      throw error;
    }
  }

  /**
   * Remove articles older than retention period
   */
  async removeOldArticles() {
    console.log('🗑️ Removing old articles...');

    try {
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      // Read existing articles
      const articles = await this.loadExistingArticles();
      const initialCount = articles.length;

      // Filter out old articles
      const freshArticles = articles.filter(article => {
        const articleDate = new Date(article.publishedDate);
        return articleDate > cutoffDate;
      });

      const removedCount = initialCount - freshArticles.length;

      if (removedCount > 0) {
        // Save filtered articles
        await this.saveArticles(freshArticles);

        // Remove old embeddings from vector database
        await this.removeOldEmbeddingsFromVector(cutoffDate);

        console.log(`✅ Removed ${removedCount} old articles (older than ${this.retentionDays} days)`);
      } else {
        console.log('ℹ️ No old articles to remove');
      }

      return removedCount;
    } catch (error) {
      console.error('❌ Failed to remove old articles:', error.message);
      throw error;
    }
  }

  /**
   * Scrape fresh news from all sources
   */
  async scrapeFreshNews() {
    console.log('📰 Scraping fresh news...');

    const allArticles = [];
    let totalScraped = 0;

    for (const source of RSS_SOURCES) {
      if (totalScraped >= this.maxArticles) {
        console.log(`✅ Reached maximum articles limit (${this.maxArticles})`);
        break;
      }

      try {
        console.log(`📰 Scraping ${source.name}...`);
        const articles = await this.newsScraperService.scrapeRSSFeed(source);

        // Filter only today's articles
        const todayArticles = this.filterTodayArticles(articles);
        const remainingSlots = this.maxArticles - totalScraped;
        const articlesToAdd = todayArticles.slice(0, Math.min(remainingSlots, 8));

        allArticles.push(...articlesToAdd);
        totalScraped += articlesToAdd.length;

        console.log(`✅ Got ${articlesToAdd.length} fresh articles from ${source.name}`);

        // Rate limiting delay
        await this.delay(1500);
      } catch (error) {
        console.error(`❌ Error scraping ${source.name}:`, error.message);
      }
    }

    console.log(`📊 Total fresh articles scraped: ${allArticles.length}`);
    return allArticles;
  }

  /**
   * Filter articles to only include today's news
   */
  filterTodayArticles(articles) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    return articles.filter(article => {
      const articleDate = new Date(article.publishedDate);
      return articleDate > yesterday; // Include articles from last 24 hours
    });
  }

  /**
   * Process and generate embeddings for new articles
   */
  async processAndEmbedArticles(articles) {
    if (articles.length === 0) {
      console.log('ℹ️ No new articles to process');
      return;
    }

    console.log(`🔄 Processing ${articles.length} new articles...`);

    // Add to existing articles
    const existingArticles = await this.loadExistingArticles();
    const updatedArticles = [...existingArticles, ...articles];

    // Save updated articles
    await this.saveArticles(updatedArticles);

    // Generate embeddings for new articles only
    console.log('🔄 Generating embeddings for new articles...');
    // The embedding generation will be handled by the vector database update
  }

  /**
   * Update vector database with new articles
   */
  async updateVectorDatabase(newArticles) {
    if (newArticles.length === 0) {
      console.log('ℹ️ No new articles to add to vector database');
      return;
    }

    console.log(`📊 Updating vector database with ${newArticles.length} new articles...`);

    try {
      // Generate embeddings and add to Qdrant
      for (const article of newArticles) {
        const chunks = this.chunkArticleContent(article);

        for (const chunk of chunks) {
          const embedding = await this.jinaService.generateEmbedding(chunk.content);

          await this.qdrantService.upsertPoint({
            id: chunk.id,
            vector: embedding.embedding,
            payload: {
              type: chunk.type,
              article_id: article.id,
              title: article.title,
              source: article.source,
              url: article.url,
              published_date: article.publishedDate,
              category: article.category,
              content: chunk.content
            }
          });
        }
      }

      console.log('✅ Vector database updated successfully');
    } catch (error) {
      console.error('❌ Failed to update vector database:', error.message);
      throw error;
    }
  }

  /**
   * Remove old embeddings from vector database
   */
  async removeOldEmbeddingsFromVector(cutoffDate) {
    console.log('🗑️ Removing old embeddings from vector database...');

    try {
      // Get all points and filter by date
      const filter = {
        must: [{
          range: {
            published_date: {
              lt: cutoffDate.toISOString()
            }
          }
        }]
      };

      // Delete old points
      await this.qdrantService.deletePoints(filter);
      console.log('✅ Old embeddings removed from vector database');
    } catch (error) {
      console.error('❌ Failed to remove old embeddings:', error.message);
      throw error;
    }
  }

  /**
   * Clear related caches
   */
  async clearRelatedCaches() {
    console.log('🧹 Clearing related caches...');

    try {
      // Clear Redis search cache
      const keys = await redisService.keys('search:*');
      if (keys.length > 0) {
        await redisService.del(...keys);
        console.log(`✅ Cleared ${keys.length} search cache entries`);
      }

      // Clear embedding cache
      const embeddingKeys = await redisService.keys('embedding:*');
      if (embeddingKeys.length > 0) {
        await redisService.del(...embeddingKeys);
        console.log(`✅ Cleared ${embeddingKeys.length} embedding cache entries`);
      }
    } catch (error) {
      console.error('❌ Failed to clear caches:', error.message);
    }
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupExpiredCache() {
    try {
      // This is handled automatically by Redis TTL, but we can log it
      const info = await redisService.info('keyspace');
      // console.log('🧹 Cache cleanup check completed');
    } catch (error) {
      console.error('❌ Cache cleanup failed:', error.message);
    }
  }

  /**
   * Cleanup and optimize the system
   */
  async cleanupAndOptimize() {
    console.log('🔧 Performing cleanup and optimization...');

    try {
      // Optimize Qdrant collection
      await this.qdrantService.optimizeCollection();
      console.log('✅ Vector database optimized');
    } catch (error) {
      console.error('❌ Optimization failed:', error.message);
    }
  }

  /**
   * Send refresh summary
   */
  async sendRefreshSummary(newArticles, duration) {
    const summary = {
      timestamp: new Date().toISOString(),
      newArticles: newArticles.length,
      sources: [...new Set(newArticles.map(a => a.source))],
      categories: [...new Set(newArticles.map(a => a.category))],
      duration: `${duration}ms`,
      retentionDays: this.retentionDays
    };

    console.log('📊 Daily Refresh Summary:');
    console.log(JSON.stringify(summary, null, 2));

    // Could extend this to send notifications, emails, etc.
  }

  /**
   * Utility functions
   */
  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  async loadExistingArticles() {
    try {
      const data = await fs.readFile(this.articlesFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return []; // File doesn't exist yet
    }
  }

  async saveArticles(articles) {
    const data = JSON.stringify(articles, null, 2);
    await fs.writeFile(this.articlesFile, data, 'utf8');
  }

  chunkArticleContent(article) {
    // Reuse existing chunking logic
    const chunks = [];
    const maxChunkSize = 1000;

    // Title chunk
    chunks.push({
      id: `${article.id}_title`,
      type: 'title',
      content: `Title: ${article.title}\n\nSummary: ${article.content}`,
      article_id: article.id
    });

    // Content chunks if content is long
    if (article.content && article.content.length > maxChunkSize) {
      const contentChunks = this.splitIntoChunks(article.content, maxChunkSize);
      contentChunks.forEach((chunk, index) => {
        chunks.push({
          id: `${article.id}_content_${index}`,
          type: 'content',
          content: chunk,
          article_id: article.id
        });
      });
    }

    return chunks;
  }

  splitIntoChunks(text, maxSize) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence + '.';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Manual refresh trigger (for testing or manual updates)
   */
  async manualRefresh() {
    console.log('🔄 Starting manual news refresh...');
    await this.performDailyRefresh();
  }

  /**
   * Get refresh status
   */
  async getRefreshStatus() {
    const articles = await this.loadExistingArticles();
    const latestArticle = articles.reduce((latest, article) => {
      const articleDate = new Date(article.publishedDate);
      const latestDate = latest ? new Date(latest.publishedDate) : new Date(0);
      return articleDate > latestDate ? article : latest;
    }, null);

    return {
      totalArticles: articles.length,
      latestArticleDate: latestArticle?.publishedDate,
      retentionDays: this.retentionDays,
      cronSchedule: this.cronSchedule,
      sources: RSS_SOURCES.map(s => s.name)
    };
  }
}

export default DailyNewsRefreshService;