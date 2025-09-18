import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { asyncHandler } from '../middleware/errorHandler.js';
import RSSFeedScraper from '../services/rssFeedScraper.js';
import redisService from '../services/redisService.js';
import articleService from '../services/articleService.js';

const router = express.Router();

/**
 * Simple admin authentication middleware
 */
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
  const expectedKey = process.env.ADMIN_API_KEY || 'default-admin-key-123';

  if (adminKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Provide valid admin key in X-Admin-Key header or admin_key query parameter.'
    });
  }

  next();
};

/**
 * POST /api/admin/scrape-articles
 * Scrape articles from RSS feeds and populate the database
 */
router.post('/scrape-articles', adminAuth, asyncHandler(async (req, res) => {
  try {
    console.log('🚀 Admin scraping request initiated');

    // Create data directories if they don't exist
    const dataDir = path.join(process.cwd(), 'data');
    const rawDir = path.join(dataDir, 'raw');
    const processedDir = path.join(dataDir, 'processed');

    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(rawDir, { recursive: true });
    await fs.mkdir(processedDir, { recursive: true });

    // Scrape real articles from RSS feeds
    const { maxArticles = 50, maxPerFeed = 8 } = req.body;

    const rssScraper = new RSSFeedScraper();
    console.log('🌐 Scraping articles from RSS feeds...');

    const scrapingResult = await rssScraper.scrapeAllFeeds(maxPerFeed);
    const articles = scrapingResult.articles.slice(0, maxArticles); // Limit total articles

    console.log(`✅ Successfully scraped ${articles.length} articles from RSS feeds`);

    // Save to database (replace all existing articles)
    await articleService.replaceAllArticles(articles);

    // Also save to files (for backward compatibility with preprocessing)
    const rawDataPath = path.join(rawDir, 'latest.json');
    const statsData = JSON.stringify({
      total_articles: articles.length,
      scraped_at: new Date().toISOString(),
      rss_stats: scrapingResult.stats,
      sources: getSourceStats(articles),
      categories: getCategoryStats(articles)
    });

    const statsPath = path.join(rawDir, 'scrape-stats.json');

    await Promise.all([
      fs.writeFile(rawDataPath, JSON.stringify(articles, null, 2)),
      fs.writeFile(statsPath, statsData)
    ]);

    console.log(`✅ Saved ${articles.length} articles to database and ${rawDataPath}`);

    // Run preprocessing first
    console.log('🔄 Starting preprocessing...');
    await runPreprocessing();

    // Run embedding pipeline
    console.log('🔄 Starting embedding generation...');
    const embeddingResult = await runEmbeddingPipeline();

    res.json({
      success: true,
      message: 'Real articles scraped from RSS feeds and embeddings generated successfully',
      data: {
        articles_scraped: articles.length,
        rss_sources: Object.keys(scrapingResult.stats.sources),
        successful_feeds: scrapingResult.stats.successful,
        failed_feeds: scrapingResult.stats.failed,
        sources: Object.keys(getSourceStats(articles)),
        categories: Object.keys(getCategoryStats(articles)),
        embeddings_generated: embeddingResult.success,
        scraped_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Scraping failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scrape articles',
      details: error.message
    });
  }
}));

/**
 * GET /api/admin/scrape-status
 * Check if articles exist and scraping status
 */
router.get('/scrape-status', adminAuth, asyncHandler(async (req, res) => {
  try {
    const rawDataPath = path.join(process.cwd(), 'data', 'raw', 'latest.json');

    let status = {
      articles_exist: false,
      article_count: 0,
      last_scraped: null,
      data_file_exists: false
    };

    try {
      await fs.access(rawDataPath);
      status.data_file_exists = true;

      const rawData = JSON.parse(await fs.readFile(rawDataPath, 'utf8'));
      status.articles_exist = true;
      status.article_count = rawData.articles?.length || 0;
      status.last_scraped = rawData.stats?.scraped_at || null;
    } catch (error) {
      // File doesn't exist, keep defaults
    }

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check scrape status',
      details: error.message
    });
  }
}));

/**
 * GET /api/admin/rss-feeds
 * Get available RSS feeds
 */
router.get('/rss-feeds', adminAuth, asyncHandler(async (req, res) => {
  try {
    const rssScraper = new RSSFeedScraper();
    const feeds = rssScraper.getAvailableFeeds();

    res.json({
      success: true,
      data: {
        feeds: feeds,
        total_feeds: feeds.length,
        categories: [...new Set(feeds.map(f => f.category))]
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get RSS feeds',
      details: error.message
    });
  }
}));

/**
 * POST /api/admin/test-rss
 * Test a specific RSS feed
 */
router.post('/test-rss', adminAuth, asyncHandler(async (req, res) => {
  try {
    const { feedUrl } = req.body;

    if (!feedUrl) {
      return res.status(400).json({
        success: false,
        error: 'feedUrl is required'
      });
    }

    const rssScraper = new RSSFeedScraper();
    const testResult = await rssScraper.testFeed(feedUrl);

    res.json({
      success: true,
      data: testResult
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to test RSS feed',
      details: error.message
    });
  }
}));

/**
 * POST /api/admin/regenerate-embeddings
 * Regenerate embeddings from existing articles
 */
router.post('/regenerate-embeddings', adminAuth, asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Admin regenerate embeddings request');

    const embeddingResult = await runEmbeddingPipeline();

    res.json({
      success: true,
      message: 'Embeddings regenerated successfully',
      data: {
        embeddings_generated: embeddingResult.success,
        regenerated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Embedding regeneration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate embeddings',
      details: error.message
    });
  }
}));


/**
 * Run preprocessing pipeline as child process
 */
function runPreprocessing() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting preprocessing pipeline...');

    const preprocessProcess = spawn('node', ['src/scripts/preprocessData.js'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    preprocessProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(chunk.trim());
    });

    preprocessProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(chunk.trim());
    });

    preprocessProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Preprocessing completed successfully');
        resolve({ success: true, output });
      } else {
        console.error('❌ Preprocessing failed with code:', code);
        reject(new Error(`Preprocessing failed with code ${code}. Error: ${errorOutput}`));
      }
    });

    preprocessProcess.on('error', (error) => {
      console.error('❌ Error running preprocessing:', error);
      reject(error);
    });
  });
}

/**
 * Run embedding pipeline as child process
 */
function runEmbeddingPipeline() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting embedding pipeline...');

    const embeddingProcess = spawn('node', ['run-embeddings.js'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    embeddingProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(chunk.trim());
    });

    embeddingProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(chunk.trim());
    });

    embeddingProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Embedding pipeline completed successfully');
        resolve({ success: true, output });
      } else {
        console.error('❌ Embedding pipeline failed with code:', code);
        reject(new Error(`Embedding process failed with code ${code}. Error: ${errorOutput}`));
      }
    });

    embeddingProcess.on('error', (error) => {
      console.error('❌ Error running embedding process:', error);
      reject(error);
    });
  });
}

/**
 * Helper functions for statistics
 */
function getSourceStats(articles) {
  const stats = {};
  articles.forEach(article => {
    const source = article.source || 'Unknown';
    stats[source] = (stats[source] || 0) + 1;
  });
  return stats;
}

function getCategoryStats(articles) {
  const stats = {};
  articles.forEach(article => {
    const category = article.category || 'uncategorized';
    stats[category] = (stats[category] || 0) + 1;
  });
  return stats;
}

export default router;