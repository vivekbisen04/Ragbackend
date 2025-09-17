import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class JinaEmbeddingService {
  constructor() {
    this.apiKey = process.env.JINA_API_KEY;
    this.apiUrl = process.env.JINA_API_URL || 'https://api.jina.ai/v1/embeddings';
    this.model = process.env.JINA_MODEL || 'jina-embeddings-v2-base-en';
    this.maxBatchSize = 100; // Jina AI batch limit
    this.maxRetries = 3;
    this.retryDelay = 2000;

    if (!this.apiKey) {
      throw new Error('JINA_API_KEY is required. Please set it in your .env file.');
    }

    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Generate embeddings for a single text
   */
  async generateEmbedding(text) {
    const response = await this.generateEmbeddings([text]);
    return response[0];
  }

  /**
   * Generate embeddings for multiple texts with batch processing
   */
  async generateEmbeddings(texts) {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    const results = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize);
      console.log(`🔄 Processing embedding batch ${Math.floor(i / this.maxBatchSize) + 1}/${Math.ceil(texts.length / this.maxBatchSize)} (${batch.length} texts)`);

      const batchResults = await this.processBatch(batch);
      results.push(...batchResults);

      // Rate limiting delay between batches
      if (i + this.maxBatchSize < texts.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Process a single batch of texts
   */
  async processBatch(texts, retryCount = 0) {
    try {
      const response = await this.axiosInstance.post(this.apiUrl, {
        model: this.model,
        input: texts
      });

      if (response.data && response.data.data) {
        return response.data.data.map(item => ({
          embedding: item.embedding,
          index: item.index,
          object: item.object
        }));
      } else {
        throw new Error('Invalid response format from Jina AI');
      }
    } catch (error) {
      if (retryCount < this.maxRetries) {
        console.warn(`⚠️ Batch failed, retrying (${retryCount + 1}/${this.maxRetries}):`, error.message);
        await this.delay(this.retryDelay * (retryCount + 1));
        return this.processBatch(texts, retryCount + 1);
      }

      console.error('❌ Batch processing failed after retries:', error.message);

      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }

      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for text chunks with metadata
   */
  async generateChunkEmbeddings(chunks) {
    console.log(`🎯 Generating embeddings for ${chunks.length} chunks`);

    const texts = chunks.map(chunk => chunk.text);
    const embeddings = await this.generateEmbeddings(texts);

    return chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index].embedding,
      embeddingDimension: embeddings[index].embedding.length,
      processedAt: new Date().toISOString()
    }));
  }

  /**
   * Batch process chunks with progress tracking
   */
  async processChunksWithProgress(chunks, onProgress) {
    const results = [];
    const batchSize = this.maxBatchSize;
    const totalBatches = Math.ceil(chunks.length / batchSize);

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      console.log(`📊 Processing batch ${batchNumber}/${totalBatches}`);

      try {
        const batchResults = await this.generateChunkEmbeddings(batch);
        results.push(...batchResults);

        if (onProgress) {
          onProgress({
            processed: results.length,
            total: chunks.length,
            batchNumber,
            totalBatches,
            percentage: Math.round((results.length / chunks.length) * 100)
          });
        }

        // Save checkpoint every 5 batches
        if (batchNumber % 5 === 0) {
          console.log(`💾 Checkpoint: ${results.length}/${chunks.length} chunks processed`);
        }

      } catch (error) {
        console.error(`❌ Failed to process batch ${batchNumber}:`, error.message);
        throw error;
      }

      // Rate limiting delay
      if (i + batchSize < chunks.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Validate API connection and model availability
   */
  async validateConnection() {
    try {
      console.log('🔍 Validating Jina AI connection...');

      const testResponse = await this.generateEmbedding('Hello, this is a test.');

      if (testResponse && testResponse.embedding) {
        console.log('✅ Jina AI connection validated successfully');
        console.log(`📏 Embedding dimension: ${testResponse.embedding.length}`);
        return {
          connected: true,
          dimension: testResponse.embedding.length,
          model: this.model
        };
      } else {
        throw new Error('Invalid test response');
      }
    } catch (error) {
      console.error('❌ Jina AI connection validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get embedding statistics
   */
  getStats() {
    return {
      apiUrl: this.apiUrl,
      model: this.model,
      maxBatchSize: this.maxBatchSize,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay
    };
  }

  /**
   * Utility method for delays
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default JinaEmbeddingService;