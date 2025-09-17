import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

class QdrantService {
  constructor() {
    this.url = process.env.QDRANT_URL || 'http://localhost:6333';
    this.collectionName = process.env.QDRANT_COLLECTION || 'news_embeddings';

    // Configure client with API key for cloud deployment
    const clientConfig = { url: this.url };
    if (process.env.QDRANT_API_KEY) {
      clientConfig.apiKey = process.env.QDRANT_API_KEY;
    }

    this.client = new QdrantClient(clientConfig);
    this.vectorSize = 768; // Jina embeddings v2 base dimension
    this.distance = 'Cosine';
  }

  /**
   * Initialize Qdrant connection and create collection if needed
   */
  async initialize() {
    try {
      console.log('🔌 Connecting to Qdrant...');

      // Health check
      await this.healthCheck();

      // Create collection if it doesn't exist
      await this.ensureCollection();

      console.log('✅ Qdrant initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Qdrant:', error.message);
      throw error;
    }
  }

  /**
   * Health check for Qdrant connection
   */
  async healthCheck() {
    try {
      const health = await this.client.api('cluster').clusterStatus();
      console.log('💚 Qdrant health check passed');
      return health;
    } catch (error) {
      console.error('❌ Qdrant health check failed:', error.message);
      throw new Error(`Qdrant connection failed: ${error.message}`);
    }
  }

  /**
   * Create collection if it doesn't exist
   */
  async ensureCollection() {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(col => col.name === this.collectionName);

      if (exists) {
        console.log(`📚 Collection '${this.collectionName}' already exists`);

        // Get collection info
        const info = await this.client.getCollection(this.collectionName);
        console.log(`📊 Collection info: ${info.points_count} points, ${info.vectors_count} vectors`);

        return false; // Collection already existed
      }

      // Create new collection
      console.log(`🏗️ Creating collection '${this.collectionName}'...`);

      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: this.vectorSize,
          distance: this.distance,
          on_disk: true // Store vectors on disk for larger datasets
        },
        optimizers_config: {
          default_segment_number: 2,
          max_segment_size: 20000,
          memmap_threshold: 20000,
          indexing_threshold: 20000,
          flush_interval_sec: 10,
          max_optimization_threads: 2
        },
        hnsw_config: {
          m: 16,
          ef_construct: 100,
          full_scan_threshold: 10000,
          max_indexing_threads: 2,
          on_disk: true
        }
      });

      console.log(`✅ Collection '${this.collectionName}' created successfully`);
      return true; // New collection created
    } catch (error) {
      console.error('❌ Failed to ensure collection:', error.message);
      throw error;
    }
  }

  /**
   * Insert embeddings with metadata in batches
   */
  async insertEmbeddings(chunksWithEmbeddings, batchSize = 100) {
    try {
      console.log(`📝 Inserting ${chunksWithEmbeddings.length} embeddings into Qdrant...`);

      const totalBatches = Math.ceil(chunksWithEmbeddings.length / batchSize);
      let inserted = 0;

      for (let i = 0; i < chunksWithEmbeddings.length; i += batchSize) {
        const batch = chunksWithEmbeddings.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        console.log(`📦 Inserting batch ${batchNumber}/${totalBatches} (${batch.length} points)`);

        const points = batch.map((chunk, idx) => {
          // Generate a safe numeric ID using hash
          const hash = chunk.id.split('').reduce((hash, char) => {
            return Math.abs((hash * 31 + char.charCodeAt(0)) % 2147483647);
          }, 0);
          const numericId = hash + (i + idx); // Add batch position to avoid collisions

          return {
            id: numericId,
            vector: chunk.embedding,
            payload: {
              // Core content
              article_id: chunk.articleId,
              chunk_id: chunk.chunkId,
              text: chunk.text,
              type: chunk.type,

              // Metadata
              title: chunk.metadata.title,
              source: chunk.metadata.source,
              category: chunk.metadata.category,
              url: chunk.metadata.url,
              published_date: chunk.metadata.publishedDate,
              scraped_at: chunk.metadata.scrapedAt,

              // Processing info
              word_count: chunk.wordCount,
              char_count: chunk.charCount,
              start_index: chunk.startIndex,
              end_index: chunk.endIndex,
              processed_at: chunk.processedAt,

              // Search optimization
              searchable_text: `${chunk.metadata.title} ${chunk.text}`.toLowerCase(),

              // Timestamps
              inserted_at: new Date().toISOString()
            }
          };
        });

        try {
          await this.client.upsert(this.collectionName, {
            wait: true,
            points: points
          });
        } catch (upsertError) {
          console.error('❌ Upsert error details:', {
            message: upsertError.message,
            status: upsertError.response?.status,
            data: upsertError.response?.data,
            pointsSample: points.slice(0, 2) // First 2 points for debugging
          });
          throw upsertError;
        }

        inserted += batch.length;

        console.log(`✅ Batch ${batchNumber} inserted (${inserted}/${chunksWithEmbeddings.length})`);

        // Small delay between batches
        if (i + batchSize < chunksWithEmbeddings.length) {
          await this.delay(500);
        }
      }

      console.log(`🎉 Successfully inserted ${inserted} embeddings into Qdrant`);
      return inserted;
    } catch (error) {
      console.error('❌ Failed to insert embeddings:', error.message);
      throw error;
    }
  }

  /**
   * Search for similar vectors
   */
  async search(queryVector, options = {}) {
    try {
      const {
        limit = 10,
        filter = null,
        withPayload = true,
        withVector = false,
        scoreThreshold = null
      } = options;

      const searchResult = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit,
        filter,
        with_payload: withPayload,
        with_vector: withVector,
        score_threshold: scoreThreshold
      });

      return searchResult.map(result => ({
        id: result.id,
        score: result.score,
        payload: result.payload,
        vector: result.vector
      }));
    } catch (error) {
      console.error('❌ Search failed:', error.message);
      throw error;
    }
  }

  /**
   * Search with text query (requires embedding generation)
   */
  async searchByText(queryText, embeddingService, options = {}) {
    try {
      console.log(`🔍 Searching for: "${queryText}"`);

      // Generate embedding for query text
      const queryEmbedding = await embeddingService.generateEmbedding(queryText);

      // Search with the embedding
      const results = await this.search(queryEmbedding.embedding, options);

      console.log(`📊 Found ${results.length} similar chunks`);
      return results;
    } catch (error) {
      console.error('❌ Text search failed:', error.message);
      throw error;
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats() {
    try {
      const info = await this.client.getCollection(this.collectionName);

      return {
        collection_name: this.collectionName,
        points_count: info.points_count,
        vectors_count: info.vectors_count,
        indexed_vectors_count: info.indexed_vectors_count,
        segments_count: info.segments_count,
        status: info.status,
        optimizer_status: info.optimizer_status,
        disk_data_size: info.disk_data_size,
        ram_data_size: info.ram_data_size
      };
    } catch (error) {
      console.error('❌ Failed to get collection stats:', error.message);
      throw error;
    }
  }

  /**
   * Create index for better search performance
   */
  async createPayloadIndex(fieldName, fieldType = 'keyword') {
    try {
      console.log(`📚 Creating index for field: ${fieldName}`);

      await this.client.createPayloadIndex(this.collectionName, {
        field_name: fieldName,
        field_schema: {
          type: fieldType
        }
      });

      console.log(`✅ Index created for ${fieldName}`);
    } catch (error) {
      console.warn(`⚠️ Failed to create index for ${fieldName}:`, error.message);
      // Don't throw - indexes are optional optimizations
    }
  }

  /**
   * Setup payload indexes for common search fields
   */
  async setupIndexes() {
    const indexFields = [
      { name: 'source', type: 'keyword' },
      { name: 'category', type: 'keyword' },
      { name: 'type', type: 'keyword' },
      { name: 'article_id', type: 'keyword' },
      { name: 'published_date', type: 'datetime' }
    ];

    console.log('🔧 Setting up payload indexes...');

    for (const field of indexFields) {
      try {
        await this.createPayloadIndex(field.name, field.type);
      } catch (error) {
        console.warn(`⚠️ Skipping index for ${field.name}`);
      }
    }
  }

  /**
   * Clear collection (for testing/rebuilding)
   */
  async clearCollection() {
    try {
      console.log(`🗑️ Clearing collection '${this.collectionName}'...`);

      await this.client.deleteCollection(this.collectionName);
      await this.ensureCollection();

      console.log(`✅ Collection '${this.collectionName}' cleared and recreated`);
    } catch (error) {
      console.error('❌ Failed to clear collection:', error.message);
      throw error;
    }
  }

  /**
   * Utility delay method
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default QdrantService;