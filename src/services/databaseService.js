import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

class DatabaseService {
  constructor() {
    this.pool = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      console.log('🔌 Connecting to PostgreSQL...');

      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
        max: 5, // Reduced for Neon free tier
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // Increased timeout for Neon
        query_timeout: 10000,
        statement_timeout: 10000,
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      // Create tables if they don't exist
      await this.createTables();

      this.initialized = true;
      console.log('✅ PostgreSQL connected successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL:', error.message);
      throw error;
    }
  }

  /**
   * Create necessary tables
   */
  async createTables() {
    const createArticlesTable = `
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        article_id VARCHAR(255) UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        summary TEXT,
        url TEXT,
        source VARCHAR(100),
        category VARCHAR(50) DEFAULT 'general',
        published_date TIMESTAMP,
        scraped_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
      CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
      CREATE INDEX IF NOT EXISTS idx_articles_scraped_at ON articles(scraped_at DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_published_date ON articles(published_date DESC);
    `;

    await this.pool.query(createArticlesTable);
    await this.pool.query(createIndexes);

    console.log('✅ Database tables and indexes created/verified');
  }

  /**
   * Replace all articles with new batch
   */
  async replaceAllArticles(articles) {
    if (!this.initialized) {
      await this.initialize();
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Clear all existing articles
      await client.query('TRUNCATE TABLE articles RESTART IDENTITY');
      console.log('🗑️ Cleared all existing articles');

      // Insert new articles
      if (articles.length > 0) {
        const insertQuery = `
          INSERT INTO articles (
            article_id, title, content, summary, url, source,
            category, published_date, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;

        for (const article of articles) {
          const values = [
            article.id || article.article_id || `article_${Date.now()}_${Math.random()}`,
            article.title || 'Untitled',
            article.content || '',
            article.summary || article.content?.substring(0, 300) || '',
            article.url || article.link || '',
            article.source || 'Unknown Source',
            article.category || 'general',
            article.published_date ? new Date(article.published_date) : new Date(),
            JSON.stringify(article.metadata || {})
          ];

          await client.query(insertQuery, values);
        }

        console.log(`✅ Inserted ${articles.length} new articles`);
      }

      await client.query('COMMIT');
      return { success: true, inserted: articles.length };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to replace articles:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all current articles
   */
  async getAllArticles() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const query = `
        SELECT
          id,
          article_id,
          title,
          content,
          summary,
          url,
          source,
          category,
          published_date,
          scraped_at,
          metadata,
          created_at
        FROM articles
        ORDER BY scraped_at DESC, published_date DESC
      `;

      const result = await this.pool.query(query);

      // Transform to match existing API format
      const articles = result.rows.map(row => ({
        id: row.article_id,
        title: row.title,
        content: row.content,
        summary: row.summary,
        url: row.url,
        source: row.source,
        category: row.category,
        published_date: row.published_date?.toISOString() || new Date().toISOString(),
        scraped_at: row.scraped_at?.toISOString(),
        metadata: row.metadata || {}
      }));

      return articles;

    } catch (error) {
      console.error('❌ Failed to get articles:', error.message);
      throw error;
    }
  }

  /**
   * Get articles count and stats
   */
  async getArticleStats() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const countQuery = 'SELECT COUNT(*) as total FROM articles';
      const sourceQuery = 'SELECT source, COUNT(*) as count FROM articles GROUP BY source';
      const categoryQuery = 'SELECT category, COUNT(*) as count FROM articles GROUP BY category';
      const lastScrapedQuery = 'SELECT MAX(scraped_at) as last_scraped FROM articles';

      const [countResult, sourceResult, categoryResult, lastScrapedResult] = await Promise.all([
        this.pool.query(countQuery),
        this.pool.query(sourceQuery),
        this.pool.query(categoryQuery),
        this.pool.query(lastScrapedQuery)
      ]);

      const sources = {};
      sourceResult.rows.forEach(row => {
        sources[row.source] = parseInt(row.count);
      });

      const categories = {};
      categoryResult.rows.forEach(row => {
        categories[row.category] = parseInt(row.count);
      });

      return {
        total_articles: parseInt(countResult.rows[0].total),
        sources,
        categories,
        last_scraped: lastScrapedResult.rows[0].last_scraped?.toISOString(),
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Failed to get article stats:', error.message);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'disconnected', error: 'Not initialized' };
      }

      const result = await this.pool.query('SELECT NOW() as current_time, version() as postgres_version');
      return {
        status: 'connected',
        current_time: result.rows[0].current_time,
        postgres_version: result.rows[0].postgres_version.split(' ')[0] + ' ' + result.rows[0].postgres_version.split(' ')[1]
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.initialized = false;
      console.log('🔌 PostgreSQL connection closed');
    }
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.initialized && this.pool;
  }
}

export default new DatabaseService();