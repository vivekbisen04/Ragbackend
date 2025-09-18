import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import articleService from '../services/articleService.js';

const router = express.Router();

/**
 * GET /api/articles
 * Get all scraped articles
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    const result = await articleService.getEnhancedArticles();

    res.json({
      success: true,
      data: result
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
    const stats = await articleService.getArticleStats();

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
    const filters = { category, source, limit };
    const result = await articleService.searchArticles(q, filters);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error searching articles:', error);
    throw new Error('Failed to search articles');
  }
}));

export default router;