import express from 'express';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import RAGRetrievalService from '../services/ragRetrievalService.js';

const router = express.Router();
const ragService = new RAGRetrievalService();

// Initialize RAG service
let ragInitialized = false;
ragService.initialize().then(() => {
  ragInitialized = true;
  console.log('✅ RAG service initialized for search routes');
}).catch(err => {
  console.error('❌ Failed to initialize RAG service:', err.message);
});

/**
 * POST /api/search
 * Search news articles with query
 */
router.post('/', asyncHandler(async (req, res) => {
  if (!ragInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'Search service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  const {
    query,
    options = {}
  } = req.body;

  // Validate input
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new ValidationError('Query is required and cannot be empty');
  }

  if (query.length > 500) {
    throw new ValidationError('Query too long (max 500 characters)');
  }

  // Parse search options
  const searchOptions = {
    topK: Math.min(parseInt(options.topK) || 5, 20),
    minScore: parseFloat(options.minScore) || 0.3,
    filters: options.filters || {},
    includeMetadata: options.includeMetadata !== false,
    useCache: options.useCache !== false,
    diversityThreshold: parseFloat(options.diversityThreshold) || 0.8
  };

  // Validate filters
  if (searchOptions.filters.sources && !Array.isArray(searchOptions.filters.sources)) {
    throw new ValidationError('Filters.sources must be an array');
  }

  if (searchOptions.filters.categories && !Array.isArray(searchOptions.filters.categories)) {
    throw new ValidationError('Filters.categories must be an array');
  }

  try {
    const searchResults = await ragService.searchDocuments(query.trim(), searchOptions);

    res.json({
      success: true,
      data: searchResults
    });

  } catch (error) {
    console.error('❌ Search request failed:', error.message);
    throw error;
  }
}));

/**
 * GET /api/search/stats
 * Get search service statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  if (!ragInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'Search service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  try {
    const stats = await ragService.getStats();

    res.json({
      success: true,
      data: {
        service_status: 'healthy',
        timestamp: new Date().toISOString(),
        statistics: stats
      }
    });

  } catch (error) {
    console.error('❌ Failed to get search stats:', error.message);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve search statistics',
        details: error.message
      }
    });
  }
}));

/**
 * GET /api/search/collections
 * Get available collections and metadata
 */
router.get('/collections', asyncHandler(async (req, res) => {
  if (!ragInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'Search service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  try {
    const stats = await ragService.getStats();

    const collections = {
      news_embeddings: {
        name: stats.qdrant.collection_name,
        total_points: stats.qdrant.points_count,
        vectors_count: stats.qdrant.vectors_count,
        indexed_vectors: stats.qdrant.indexed_vectors_count,
        status: stats.qdrant.status,
        disk_usage_mb: Math.round(stats.qdrant.disk_data_size / 1024 / 1024),
        ram_usage_mb: Math.round(stats.qdrant.ram_data_size / 1024 / 1024)
      }
    };

    res.json({
      success: true,
      data: {
        collections,
        embedding_service: {
          model: stats.jina.model,
          api_url: stats.jina.apiUrl,
          max_batch_size: stats.jina.maxBatchSize
        },
        search_config: stats.config
      }
    });

  } catch (error) {
    console.error('❌ Failed to get collection info:', error.message);
    throw error;
  }
}));

/**
 * POST /api/search/similarity
 * Find similar documents to a given document ID
 */
router.post('/similarity/:documentId', asyncHandler(async (req, res) => {
  if (!ragInitialized) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'Search service is not ready yet',
        code: 'SERVICE_INITIALIZING'
      }
    });
  }

  const { documentId } = req.params;
  const { topK = 5, includeOriginal = false } = req.body;

  // Validate document ID
  if (!documentId || typeof documentId !== 'string') {
    throw new ValidationError('Document ID is required');
  }

  try {
    // This is a placeholder implementation
    // In a full implementation, you would:
    // 1. Get the vector for the specified document ID
    // 2. Search for similar vectors
    // 3. Return the results

    res.json({
      success: true,
      data: {
        message: 'Similarity search not fully implemented yet',
        document_id: documentId,
        requested_top_k: topK,
        note: 'This endpoint will be fully implemented in a future update'
      }
    });

  } catch (error) {
    console.error('❌ Similarity search failed:', error.message);
    throw error;
  }
}));

/**
 * GET /api/search/filters
 * Get available filter options (sources, categories, etc.)
 */
router.get('/filters', asyncHandler(async (req, res) => {
  // This would typically be cached and updated periodically
  const availableFilters = {
    sources: [
      'Times of India',
      'The Hindu',
      'NDTV News',
      'Economic Times',
      'NDTV Tech',
      'BBC News',
      'Reuters'
    ],
    categories: [
      'indian_national',
      'indian_business',
      'indian_technology',
      'global'
    ],
    content_types: [
      'title',
      'content'
    ],
    date_range: {
      min_date: '2025-09-01',
      max_date: new Date().toISOString().split('T')[0]
    }
  };

  res.json({
    success: true,
    data: {
      available_filters: availableFilters,
      filter_usage: {
        sources: 'Array of source names to include',
        categories: 'Array of category names to include',
        dateFrom: 'Start date in YYYY-MM-DD format',
        dateTo: 'End date in YYYY-MM-DD format',
        contentType: 'Filter by content type (title/content)'
      }
    }
  });
}));

export default router;