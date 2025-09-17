import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import redisService from '../services/redisService.js';
import QdrantService from '../services/qdrantService.js';
import JinaEmbeddingService from '../services/jinaEmbeddingService.js';

const router = express.Router();

/**
 * GET /api/health
 * General health check
 */
router.get('/', asyncHandler(async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      api: 'healthy'
    }
  };

  res.json(health);
}));

/**
 * GET /api/health/services
 * Detailed health check for all services
 */
router.get('/services', asyncHandler(async (req, res) => {
  const services = {};
  const startTime = Date.now();

  // Test Redis
  try {
    await redisService.testConnection();
    const redisStats = await redisService.getStats();
    services.redis = {
      status: 'healthy',
      connected: redisStats.connected,
      db_size: redisStats.dbSize,
      version: redisStats.info?.version,
      uptime: redisStats.info?.uptime_in_seconds,
      memory_usage: redisStats.info?.used_memory
    };
  } catch (error) {
    services.redis = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Test Qdrant
  try {
    const qdrantService = new QdrantService();
    await qdrantService.healthCheck();
    const qdrantStats = await qdrantService.getCollectionStats();
    services.qdrant = {
      status: 'healthy',
      collection: qdrantStats.collection_name,
      points_count: qdrantStats.points_count,
      vectors_count: qdrantStats.vectors_count,
      disk_usage_mb: Math.round(qdrantStats.disk_data_size / 1024 / 1024),
      ram_usage_mb: Math.round(qdrantStats.ram_data_size / 1024 / 1024)
    };
  } catch (error) {
    services.qdrant = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Test Jina AI (lightweight test)
  try {
    const jinaService = new JinaEmbeddingService();
    const jinaStats = jinaService.getStats();

    // Don't make actual API call in health check to avoid rate limits
    services.jina = {
      status: 'configured',
      api_url: jinaStats.apiUrl,
      model: jinaStats.model,
      max_batch_size: jinaStats.maxBatchSize
    };
  } catch (error) {
    services.jina = {
      status: 'unhealthy',
      error: error.message
    };
  }

  const totalTime = Date.now() - startTime;

  // Determine overall health
  const healthyServices = Object.values(services).filter(s =>
    s.status === 'healthy' || s.status === 'configured'
  ).length;
  const totalServices = Object.keys(services).length;
  const overallStatus = healthyServices === totalServices ? 'healthy' : 'degraded';

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    check_duration_ms: totalTime,
    services_healthy: `${healthyServices}/${totalServices}`,
    services
  });
}));

/**
 * GET /api/health/system
 * System metrics and performance
 */
router.get('/system', asyncHandler(async (req, res) => {
  const memoryUsage = process.memoryUsage();

  const systemHealth = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    system: {
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
      uptime_seconds: process.uptime(),
      pid: process.pid
    },
    memory: {
      rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external_mb: Math.round(memoryUsage.external / 1024 / 1024)
    },
    cpu: {
      load_average: process.cpuUsage()
    }
  };

  res.json(systemHealth);
}));

/**
 * GET /api/health/ready
 * Readiness probe for Kubernetes/Docker
 */
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Quick checks for essential services
    await redisService.testConnection();

    const qdrantService = new QdrantService();
    await qdrantService.healthCheck();

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * GET /api/health/live
 * Liveness probe for Kubernetes/Docker
 */
router.get('/live', asyncHandler(async (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}));

export default router;