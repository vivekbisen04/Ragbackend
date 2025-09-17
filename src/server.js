import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';

// Import route handlers
import healthRoutes from './routes/health.js';
import chatRoutes from './routes/chat.js';
import searchRoutes from './routes/search.js';
import articlesRoutes from './routes/articles.js';
import newsManagementRoutes from './routes/newsManagement.js';

// Import middleware
import errorHandler from './middleware/errorHandler.js';
import requestLogger from './middleware/requestLogger.js';

// Import services
import DailyNewsRefreshService from './services/dailyNewsRefreshService.js';

// Load environment variables
dotenv.config();

class RAGServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.env = process.env.NODE_ENV || 'development';
    this.dailyRefreshService = new DailyNewsRefreshService();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: this.env === 'production',
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    const corsOptions = {
      origin: this.env === 'production'
        ? process.env.FRONTEND_URL || 'http://localhost:3000'
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID']
    };
    this.app.use(cors(corsOptions));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // Body parsing middleware
    this.app.use(express.json({
      limit: '10mb',
      strict: true
    }));
    this.app.use(express.urlencoded({
      extended: true,
      limit: '10mb'
    }));

    // Logging middleware
    if (this.env === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Custom request logging
    this.app.use(requestLogger);

    // Health check for load balancers (before rate limiting)
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: this.env
      });
    });
  }

  setupRoutes() {
    // API routes
    this.app.use('/api/health', healthRoutes);
    this.app.use('/api/chat', chatRoutes);
    this.app.use('/api/search', searchRoutes);
    this.app.use('/api/articles', articlesRoutes);
    this.app.use('/api/news-management', newsManagementRoutes);

    // API documentation endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'RAG Chatbot API',
        version: '1.0.0',
        description: 'REST API for RAG-powered news chatbot',
        endpoints: {
          health: {
            'GET /api/health': 'Service health and status',
            'GET /api/health/services': 'Individual service health checks'
          },
          chat: {
            'POST /api/chat': 'Send a message and get AI response',
            'GET /api/chat/:sessionId/history': 'Get chat history for session',
            'DELETE /api/chat/:sessionId': 'Clear chat session'
          },
          search: {
            'POST /api/search': 'Search news articles with query',
            'GET /api/search/stats': 'Get search statistics'
          },
          articles: {
            'GET /api/articles': 'Get all scraped articles',
            'GET /api/articles/stats': 'Get article statistics',
            'GET /api/articles/search': 'Search articles by keyword'
          }
        },
        documentation: '/api/docs'
      });
    });

    // Catch-all for undefined API routes
    this.app.all('/api/*', (req, res) => {
      res.status(404).json({
        error: 'API endpoint not found',
        message: `The endpoint ${req.method} ${req.path} does not exist`,
        availableEndpoints: '/api'
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'RAG Chatbot Backend API',
        version: '1.0.0',
        status: 'running',
        api: '/api',
        health: '/health'
      });
    });
  }

  setupErrorHandling() {
    // 404 handler for non-API routes
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.path
      });
    });

    // Global error handler
    this.app.use(errorHandler);
  }

  async start() {
    try {
      // Test database connections before starting
      await this.testConnections();

      this.server = this.app.listen(this.port, () => {
        console.log(`🚀 RAG Chatbot Server`);
        console.log(`===================`);
        console.log(`🌍 Environment: ${this.env}`);
        console.log(`🔗 Server: http://localhost:${this.port}`);
        console.log(`📋 API: http://localhost:${this.port}/api`);
        console.log(`💚 Health: http://localhost:${this.port}/health`);
        console.log(`⏰ Started: ${new Date().toISOString()}`);
      });

      // Initialize and start daily refresh service
      await this.initializeDailyRefreshService();

      // Graceful shutdown handling
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('❌ Failed to start server:', error.message);
      process.exit(1);
    }
  }

  async testConnections() {
    console.log('🔍 Testing service connections...');

    try {
      // Test Redis connection
      const redis = await import('./services/redisService.js');
      await redis.default.testConnection();

      // Test Qdrant connection
      const qdrant = await import('./services/qdrantService.js');
      const qdrantService = new qdrant.default();
      await qdrantService.healthCheck();

      console.log('✅ All service connections verified');
    } catch (error) {
      console.error('❌ Service connection failed:', error.message);
      throw error;
    }
  }

  async initializeDailyRefreshService() {
    try {
      console.log('📅 Initializing Daily News Refresh Service...');

      await this.dailyRefreshService.initialize();

      // Auto-start scheduler if enabled
      const autoStart = process.env.AUTO_START_SCHEDULER === 'true';
      if (autoStart) {
        this.dailyRefreshService.startScheduler();
        console.log('✅ Daily refresh scheduler started automatically');
      } else {
        console.log('ℹ️ Daily refresh scheduler not auto-started (use /api/news-management/scheduler/start to start manually)');
      }

    } catch (error) {
      console.error('❌ Failed to initialize Daily News Refresh Service:', error.message);
      console.log('⚠️ Server will continue without daily refresh functionality');
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

      if (this.server) {
        this.server.close(async () => {
          console.log('🔄 HTTP server closed');

          try {
            // Close database connections
            const redis = await import('./services/redisService.js');
            await redis.default.disconnect();
            console.log('📴 Redis connection closed');

            console.log('✅ Graceful shutdown completed');
            process.exit(0);
          } catch (error) {
            console.error('❌ Error during shutdown:', error.message);
            process.exit(1);
          }
        });

        // Force close after 10 seconds
        setTimeout(() => {
          console.error('⚠️ Could not close connections in time, forcefully shutting down');
          process.exit(1);
        }, 10000);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  getApp() {
    return this.app;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new RAGServer();
  server.start();
}

export default RAGServer;