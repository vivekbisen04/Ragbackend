import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * GET /api/articles
 * Get all scraped articles
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    // Read the latest raw articles (original articles before chunking)
    const rawDataPath = path.join(process.cwd(), 'data', 'raw', 'latest.json');

    let articles = [];
    let stats = {};

    // Read raw articles
    try {
      const rawData = await fs.readFile(rawDataPath, 'utf8');
      const rawArticles = JSON.parse(rawData);

      // Check if it's an array directly or wrapped in an object
      if (Array.isArray(rawArticles)) {
        articles = rawArticles;
      } else if (rawArticles.articles && Array.isArray(rawArticles.articles)) {
        articles = rawArticles.articles;
        stats = rawArticles.stats || {};
      } else {
        console.error('Unexpected raw data structure');
        articles = [];
      }
    } catch (rawError) {
      console.error('Error reading raw articles:', rawError.message);
      articles = [];
    }

    // Enhance articles with additional metadata for frontend display
    const enhancedArticles = articles.map((article, index) => ({
      id: article.id || `article_${index}`,
      title: article.title || 'Untitled',
      content: article.content || '',
      summary: article.summary || (article.content ? article.content.substring(0, 300) + '...' : ''),
      url: article.url || article.link || '',
      source: article.source || 'Unknown Source',
      category: article.category || 'uncategorized',
      published_date: article.published_date || article.pubDate || new Date().toISOString(),
      author: article.author || 'Unknown Author',
      tags: article.tags || [],
      metadata: article.metadata || {}
    }));

    // Get unique categories for filtering
    const categories = [...new Set(enhancedArticles.map(a => a.category))];

    // Get unique sources
    const sources = [...new Set(enhancedArticles.map(a => a.source))];

    // Calculate some statistics
    const totalArticles = enhancedArticles.length;
    const avgContentLength = enhancedArticles.reduce((sum, a) => sum + (a.content?.length || 0), 0) / totalArticles || 0;

    res.json({
      success: true,
      data: {
        articles: enhancedArticles,
        metadata: {
          total_articles: totalArticles,
          categories: categories,
          sources: sources,
          avg_content_length: Math.round(avgContentLength),
          last_updated: new Date().toISOString(),
          stats: stats
        }
      }
    });

  } catch (error) {
    console.error('Error fetching articles:', error);
    throw new Error('Failed to fetch articles from database');
  }
}));

/**
 * GET /api/articles/stats
 * Get statistics about scraped articles
 */
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    // Read stats from processed data
    const statsPath = path.join(process.cwd(), 'data', 'processed', 'stats_2025-09-15.json');

    let stats = {};

    try {
      const statsData = await fs.readFile(statsPath, 'utf8');
      stats = JSON.parse(statsData);
    } catch (error) {
      console.log('No stats file found, calculating from articles...');

      // Calculate stats from articles if stats file not available
      const processedDataPath = path.join(process.cwd(), 'data', 'processed', 'latest.json');
      try {
        const processedData = await fs.readFile(processedDataPath, 'utf8');
        const processed = JSON.parse(processedData);

        if (processed.articles && Array.isArray(processed.articles)) {
          const articles = processed.articles;
          stats = {
            totalArticles: articles.length,
            totalChunks: articles.reduce((sum, a) => sum + (a.chunks?.length || 1), 0),
            sources: {},
            categories: {},
            avgContentLength: Math.round(articles.reduce((sum, a) => sum + (a.content?.length || 0), 0) / articles.length) || 0,
            processedAt: new Date().toISOString()
          };

          // Count by source and category
          articles.forEach(article => {
            const source = article.source || 'Unknown';
            const category = article.category || 'uncategorized';

            stats.sources[source] = (stats.sources[source] || 0) + 1;
            stats.categories[category] = (stats.categories[category] || 0) + 1;
          });
        }
      } catch (articleError) {
        stats = {
          error: 'No article data available',
          totalArticles: 0,
          processedAt: new Date().toISOString()
        };
      }
    }

    res.json({
      success: true,
      data: {
        stats: stats,
        generated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching article stats:', error);
    throw new Error('Failed to fetch article statistics');
  }
}));

/**
 * GET /api/articles/search
 * Search articles by keyword
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, category, source, limit = 50 } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    throw new ValidationError('Search query (q) is required');
  }

  try {
    // Read articles
    const processedDataPath = path.join(process.cwd(), 'data', 'processed', 'latest.json');
    let articles = [];

    try {
      const processedData = await fs.readFile(processedDataPath, 'utf8');
      const processed = JSON.parse(processedData);
      articles = processed.articles || [];
    } catch (error) {
      console.error('Error reading articles for search:', error);
      articles = [];
    }

    const searchTerm = q.toLowerCase().trim();

    // Filter articles based on search criteria
    let filteredArticles = articles.filter(article => {
      const titleMatch = article.title?.toLowerCase().includes(searchTerm);
      const contentMatch = article.content?.toLowerCase().includes(searchTerm);
      const summaryMatch = article.summary?.toLowerCase().includes(searchTerm);

      const matchesSearch = titleMatch || contentMatch || summaryMatch;
      const matchesCategory = !category || article.category === category;
      const matchesSource = !source || article.source === source;

      return matchesSearch && matchesCategory && matchesSource;
    });

    // Sort by relevance (title matches first, then content matches)
    filteredArticles.sort((a, b) => {
      const aTitle = a.title?.toLowerCase().includes(searchTerm) ? 1 : 0;
      const bTitle = b.title?.toLowerCase().includes(searchTerm) ? 1 : 0;
      return bTitle - aTitle;
    });

    // Apply limit
    filteredArticles = filteredArticles.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        articles: filteredArticles,
        search_info: {
          query: q,
          category: category || 'all',
          source: source || 'all',
          total_results: filteredArticles.length,
          searched_at: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Error searching articles:', error);
    throw new Error('Failed to search articles');
  }
}));

export default router;