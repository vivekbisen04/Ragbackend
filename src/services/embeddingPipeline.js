import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import JinaEmbeddingService from './jinaEmbeddingService.js';
import QdrantService from './qdrantService.js';
import TextPreprocessor from './textPreprocessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmbeddingPipeline {
  constructor() {
    this.jinaService = new JinaEmbeddingService();
    this.qdrantService = new QdrantService();
    this.preprocessor = new TextPreprocessor();

    this.progressFile = path.join(__dirname, '../../data/processed/embedding_progress.json');
    this.checkpointFile = path.join(__dirname, '../../data/processed/embedding_checkpoint.json');
  }

  /**
   * Run the complete embedding pipeline
   */
  async runPipeline(options = {}) {
    const {
      resumeFromCheckpoint = true,
      clearExistingData = false,
      batchSize = 50
    } = options;

    try {
      console.log('🚀 Starting Embedding Pipeline');
      console.log('==============================');

      // Initialize services
      await this.initializeServices(clearExistingData);

      // Load and prepare data
      const chunks = await this.loadProcessedChunks();
      console.log(`📚 Loaded ${chunks.length} text chunks`);

      // Check for resume capability
      let startIndex = 0;
      if (resumeFromCheckpoint) {
        startIndex = await this.getResumePoint(chunks);
      }

      if (startIndex > 0) {
        console.log(`🔄 Resuming from chunk ${startIndex}/${chunks.length}`);
      }

      // Process chunks starting from resume point
      const chunksToProcess = chunks.slice(startIndex);

      if (chunksToProcess.length === 0) {
        console.log('✅ All chunks already processed!');
        return await this.getPipelineStats();
      }

      // Generate embeddings with progress tracking
      const embeddedChunks = await this.generateEmbeddingsWithProgress(
        chunksToProcess,
        startIndex,
        chunks.length,
        batchSize
      );

      // Store in vector database
      await this.storeEmbeddings(embeddedChunks);

      // Setup search optimizations
      await this.setupSearchOptimizations();

      // Clean up progress files
      await this.cleanupProgressFiles();

      // Return final statistics
      const stats = await this.getPipelineStats();
      console.log('\n🎉 Embedding Pipeline Completed Successfully!');

      return stats;

    } catch (error) {
      console.error('❌ Pipeline failed:', error.message);
      await this.saveProgress(0, error.message);
      throw error;
    }
  }

  /**
   * Initialize all required services
   */
  async initializeServices(clearExistingData = false) {
    console.log('🔧 Initializing services...');

    // Validate Jina AI connection
    await this.jinaService.validateConnection();

    // Initialize Qdrant
    await this.qdrantService.initialize();

    // Clear existing data if requested
    if (clearExistingData) {
      console.log('🗑️ Clearing existing embeddings...');
      await this.qdrantService.clearCollection();
    }

    console.log('✅ All services initialized');
  }

  /**
   * Load processed text chunks
   */
  async loadProcessedChunks() {
    try {
      const filePath = path.join(__dirname, '../../data/processed/latest.json');
      const data = await fs.readFile(filePath, 'utf8');
      const chunks = JSON.parse(data);

      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('No processed chunks found. Run npm run preprocess first.');
      }

      return chunks;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Processed chunks not found. Run npm run preprocess first.');
      }
      throw error;
    }
  }

  /**
   * Get resume point from checkpoint
   */
  async getResumePoint(chunks) {
    try {
      const checkpointData = await fs.readFile(this.checkpointFile, 'utf8');
      const checkpoint = JSON.parse(checkpointData);

      // Validate checkpoint integrity
      if (checkpoint.totalChunks === chunks.length && checkpoint.processedCount > 0) {
        console.log(`📍 Found valid checkpoint: ${checkpoint.processedCount}/${checkpoint.totalChunks} chunks`);
        return checkpoint.processedCount;
      } else {
        console.log('⚠️ Checkpoint is outdated, starting from beginning');
        return 0;
      }
    } catch (error) {
      console.log('📍 No checkpoint found, starting from beginning');
      return 0;
    }
  }

  /**
   * Generate embeddings with progress tracking
   */
  async generateEmbeddingsWithProgress(chunks, startIndex, totalChunks, batchSize) {
    console.log(`🔄 Generating embeddings for ${chunks.length} chunks...`);

    const results = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const globalIndex = startIndex + i;
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(chunks.length / batchSize);

      console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches}`);
      console.log(`🎯 Global progress: ${globalIndex + batch.length}/${totalChunks} chunks`);

      try {
        // Generate embeddings for this batch
        const embeddedBatch = await this.jinaService.generateChunkEmbeddings(batch);
        results.push(...embeddedBatch);

        // Save checkpoint
        await this.saveCheckpoint(globalIndex + batch.length, totalChunks);

        // Update progress
        const progress = {
          processed: globalIndex + batch.length,
          total: totalChunks,
          percentage: Math.round(((globalIndex + batch.length) / totalChunks) * 100),
          currentBatch: batchNumber,
          totalBatches: totalBatches,
          timestamp: new Date().toISOString()
        };

        await this.saveProgress(progress);

        console.log(`✅ Batch completed (${progress.percentage}% total progress)`);

      } catch (error) {
        console.error(`❌ Batch ${batchNumber} failed:`, error.message);
        throw error;
      }

      // Rate limiting between batches
      if (i + batchSize < chunks.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Store embeddings in Qdrant
   */
  async storeEmbeddings(embeddedChunks) {
    console.log('\n💾 Storing embeddings in Qdrant...');
    await this.qdrantService.insertEmbeddings(embeddedChunks);
  }

  /**
   * Setup search optimizations
   */
  async setupSearchOptimizations() {
    console.log('\n🔧 Setting up search optimizations...');
    await this.qdrantService.setupIndexes();
  }

  /**
   * Save processing checkpoint
   */
  async saveCheckpoint(processedCount, totalChunks) {
    const checkpoint = {
      processedCount,
      totalChunks,
      timestamp: new Date().toISOString(),
      status: 'in_progress'
    };

    try {
      await fs.writeFile(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
    } catch (error) {
      console.warn('⚠️ Failed to save checkpoint:', error.message);
    }
  }

  /**
   * Save progress information
   */
  async saveProgress(progress, errorMessage = null) {
    const progressData = {
      ...progress,
      error: errorMessage,
      timestamp: new Date().toISOString()
    };

    try {
      await fs.writeFile(this.progressFile, JSON.stringify(progressData, null, 2));
    } catch (error) {
      console.warn('⚠️ Failed to save progress:', error.message);
    }
  }

  /**
   * Get pipeline statistics
   */
  async getPipelineStats() {
    try {
      const qdrantStats = await this.qdrantService.getCollectionStats();
      const jinaStats = this.jinaService.getStats();

      return {
        qdrant: qdrantStats,
        jina: jinaStats,
        pipeline: {
          completed: true,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.warn('⚠️ Failed to get stats:', error.message);
      return null;
    }
  }

  /**
   * Clean up progress files after successful completion
   */
  async cleanupProgressFiles() {
    try {
      await fs.unlink(this.progressFile);
      await fs.unlink(this.checkpointFile);
      console.log('🧹 Cleaned up progress files');
    } catch (error) {
      // Files might not exist, which is fine
    }
  }

  /**
   * Test search functionality
   */
  async testSearch(query = "technology news") {
    console.log(`\n🔍 Testing search with query: "${query}"`);

    try {
      const results = await this.qdrantService.searchByText(
        query,
        this.jinaService,
        { limit: 5 }
      );

      console.log('\n📊 Search Results:');
      results.forEach((result, index) => {
        console.log(`${index + 1}. [Score: ${result.score.toFixed(3)}] ${result.payload.title}`);
        console.log(`   Source: ${result.payload.source} | Category: ${result.payload.category}`);
        console.log(`   Text preview: ${result.payload.text.substring(0, 100)}...`);
        console.log('');
      });

      return results;
    } catch (error) {
      console.error('❌ Search test failed:', error.message);
      throw error;
    }
  }

  /**
   * Get current progress status
   */
  async getProgressStatus() {
    try {
      const progressData = await fs.readFile(this.progressFile, 'utf8');
      return JSON.parse(progressData);
    } catch (error) {
      return null;
    }
  }

  /**
   * Utility delay method
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default EmbeddingPipeline;