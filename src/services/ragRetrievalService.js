import QdrantService from './qdrantService.js';
import JinaEmbeddingService from './jinaEmbeddingService.js';
import redisService from './redisService.js';
import crypto from 'crypto';

class RAGRetrievalService {
  constructor() {
    this.qdrantService = new QdrantService();
    this.jinaService = new JinaEmbeddingService();

    // Configuration
    this.defaultTopK = 5;
    this.maxTopK = 20;
    this.minSimilarityScore = 0.3;
    this.cacheEnabled = true;
    this.cacheTTL = 300; // 5 minutes
  }

  /**
   * Initialize the RAG retrieval service
   */
  async initialize() {
    try {
      console.log('🔧 Initializing RAG Retrieval Service...');

      await this.qdrantService.initialize();
      await this.jinaService.validateConnection();

      console.log('✅ RAG Retrieval Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize RAG Retrieval Service:', error.message);
      throw error;
    }
  }

  /**
   * Search for relevant documents using a text query
   */
  async searchDocuments(query, options = {}) {
    try {
      const startTime = Date.now();

      // Parse options
      const {
        topK = this.defaultTopK,
        minScore = this.minSimilarityScore,
        filters = {},
        useCache = this.cacheEnabled,
        includeMetadata = true,
        diversityThreshold = 0.8
      } = options;

      // Validate inputs
      if (!query || typeof query !== 'string') {
        throw new Error('Query must be a non-empty string');
      }

      if (topK > this.maxTopK) {
        throw new Error(`topK cannot exceed ${this.maxTopK}`);
      }

      console.log(`🔍 Searching documents: "${query}" (topK: ${topK})`);

      // Check cache first
      if (useCache) {
        const cached = await this.getCachedResult(query, { topK, minScore, filters });
        if (cached) {
          console.log(`📦 Cache hit for query: "${query}"`);
          return cached;
        }
      }

      // Preprocess query
      const preprocessedQuery = this.preprocessQuery(query);

      // Generate embedding for the query
      const queryEmbedding = await this.jinaService.generateEmbedding(preprocessedQuery);

      // Build search filters
      const qdrantFilters = this.buildQdrantFilters(filters);

      // Search in Qdrant
      const searchResults = await this.qdrantService.search(queryEmbedding.embedding, {
        limit: Math.min(topK * 2, this.maxTopK), // Get more results for diversity filtering
        filter: qdrantFilters,
        withPayload: includeMetadata,
        withVector: false,
        scoreThreshold: minScore
      });

      // Post-process results
      let processedResults = this.postProcessResults(searchResults, {
        targetCount: topK,
        diversityThreshold,
        includeMetadata
      });

      // Enhance results with additional context
      processedResults = await this.enhanceResults(processedResults, query);

      const searchTime = Date.now() - startTime;

      const finalResult = {
        query: {
          original: query,
          processed: preprocessedQuery,
          embedding_dimension: queryEmbedding.embedding.length
        },
        results: processedResults,
        metadata: {
          total_found: searchResults.length,
          returned: processedResults.length,
          search_time_ms: searchTime,
          min_score: minScore,
          filters_applied: Object.keys(filters).length > 0,
          cached: false,
          timestamp: new Date().toISOString()
        }
      };

      // Cache the result
      if (useCache && processedResults.length > 0) {
        await this.cacheResult(query, { topK, minScore, filters }, finalResult);
      }

      console.log(`✅ Search completed: ${processedResults.length} results in ${searchTime}ms`);
      return finalResult;

    } catch (error) {
      console.error('❌ Document search failed:', error.message);
      throw error;
    }
  }

  /**
   * Get contextual information for a chat conversation
   */
  async getConversationContext(messages, options = {}) {
    try {
      const { maxContext = 3, lookbackMessages = 5 } = options;

      // Extract recent user messages
      const recentMessages = messages
        .filter(msg => msg.role === 'user')
        .slice(-lookbackMessages)
        .map(msg => msg.content);

      if (recentMessages.length === 0) {
        return { contexts: [], metadata: { total_contexts: 0 } };
      }

      // Combine recent messages into a search query
      const combinedQuery = recentMessages.join(' ');

      // Search for relevant context
      const searchResult = await this.searchDocuments(combinedQuery, {
        topK: maxContext,
        useCache: true,
        includeMetadata: true
      });

      return {
        contexts: searchResult.results,
        metadata: {
          total_contexts: searchResult.results.length,
          search_query: combinedQuery,
          messages_analyzed: recentMessages.length
        }
      };

    } catch (error) {
      console.error('❌ Failed to get conversation context:', error.message);
      throw error;
    }
  }

  /**
   * Preprocess query text for better search results
   */
  preprocessQuery(query) {
    // Basic text cleaning and normalization
    let processed = query
      .toLowerCase()
      .trim()
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters but keep alphanumeric and basic punctuation
      .replace(/[^\w\s.,!?-]/g, '')
      // Handle common abbreviations
      .replace(/\bai\b/g, 'artificial intelligence')
      .replace(/\bml\b/g, 'machine learning');

    // Extract key terms and entities
    const keyTerms = this.extractKeyTerms(processed);

    // Enhance query with key terms if beneficial
    if (keyTerms.length > 0 && processed.length < 100) {
      const enhancedTerms = keyTerms.filter(term => !processed.includes(term));
      if (enhancedTerms.length > 0) {
        processed += ' ' + enhancedTerms.slice(0, 3).join(' ');
      }
    }

    return processed;
  }

  /**
   * Extract key terms from query
   */
  extractKeyTerms(query) {
    const stopWords = new Set([
      'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'shall', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'about', 'what', 'where', 'when', 'why', 'how', 'who'
    ]);

    return query
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 5); // Limit to top 5 key terms
  }

  /**
   * Build Qdrant filters from search options
   */
  buildQdrantFilters(filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return null;
    }

    const qdrantFilter = { must: [] };

    // Source filter
    if (filters.sources && Array.isArray(filters.sources)) {
      qdrantFilter.must.push({
        key: 'source',
        match: { any: filters.sources }
      });
    }

    // Category filter
    if (filters.categories && Array.isArray(filters.categories)) {
      qdrantFilter.must.push({
        key: 'category',
        match: { any: filters.categories }
      });
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      const dateFilter = { key: 'published_date', range: {} };

      if (filters.dateFrom) {
        dateFilter.range.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        dateFilter.range.lte = filters.dateTo;
      }

      qdrantFilter.must.push(dateFilter);
    }

    // Content type filter
    if (filters.contentType) {
      qdrantFilter.must.push({
        key: 'type',
        match: { value: filters.contentType }
      });
    }

    return qdrantFilter.must.length > 0 ? qdrantFilter : null;
  }

  /**
   * Post-process search results for relevance and diversity
   */
  postProcessResults(results, options = {}) {
    const { targetCount, diversityThreshold = 0.8, includeMetadata = true } = options;

    if (!results || results.length === 0) {
      return [];
    }

    // Sort by score (already sorted by Qdrant, but ensure)
    results.sort((a, b) => b.score - a.score);

    // Apply diversity filtering to avoid too similar results
    const diverseResults = [];
    const usedTitles = new Set();

    for (const result of results) {
      if (diverseResults.length >= targetCount) break;

      const title = result.payload?.title?.toLowerCase() || '';

      // Check for title similarity
      let tooSimilar = false;
      for (const usedTitle of usedTitles) {
        if (this.calculateStringSimilarity(title, usedTitle) > diversityThreshold) {
          tooSimilar = true;
          break;
        }
      }

      if (!tooSimilar) {
        diverseResults.push(this.formatSearchResult(result, includeMetadata));
        usedTitles.add(title);
      }
    }

    return diverseResults;
  }

  /**
   * Format individual search result
   */
  formatSearchResult(result, includeMetadata = true) {
    const formatted = {
      id: result.id,
      score: parseFloat(result.score.toFixed(4)),
      content: result.payload?.text || '',
      chunk_type: result.payload?.type || 'content'
    };

    if (includeMetadata && result.payload) {
      formatted.metadata = {
        title: result.payload.title,
        source: result.payload.source,
        category: result.payload.category,
        url: result.payload.url,
        published_date: result.payload.published_date,
        word_count: result.payload.word_count,
        char_count: result.payload.char_count
      };
    }

    return formatted;
  }

  /**
   * Enhance results with additional context
   */
  async enhanceResults(results, originalQuery) {
    return results.map(result => ({
      ...result,
      relevance_context: this.generateRelevanceContext(result, originalQuery),
      snippet: this.generateSnippet(result.content, originalQuery)
    }));
  }

  /**
   * Generate relevance context for why this result was selected
   */
  generateRelevanceContext(result, query) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const content = result.content.toLowerCase();
    const matchedTerms = queryTerms.filter(term => content.includes(term));

    return {
      matched_terms: matchedTerms,
      score_explanation: `Similarity score: ${result.score}`,
      content_type: result.chunk_type
    };
  }

  /**
   * Generate snippet with highlighted terms
   */
  generateSnippet(content, query, maxLength = 200) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const lowerContent = content.toLowerCase();

    // Find the position of the first matching term
    let bestPosition = 0;
    let bestScore = 0;

    for (const term of queryTerms) {
      const position = lowerContent.indexOf(term);
      if (position !== -1) {
        const contextScore = queryTerms.filter(t =>
          lowerContent.substring(Math.max(0, position - 50), position + 50).includes(t)
        ).length;

        if (contextScore > bestScore) {
          bestScore = contextScore;
          bestPosition = Math.max(0, position - 50);
        }
      }
    }

    // Extract snippet around the best position
    const snippet = content.substring(bestPosition, bestPosition + maxLength);

    // Clean up the snippet
    const cleanSnippet = snippet.replace(/^\S*\s/, '').replace(/\s\S*$/, '');

    return cleanSnippet + (bestPosition + maxLength < content.length ? '...' : '');
  }

  /**
   * Calculate string similarity (simple Jaccard similarity)
   */
  calculateStringSimilarity(str1, str2) {
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Cache search result
   */
  async cacheResult(query, options, result) {
    try {
      const cacheKey = this.generateCacheKey(query, options);
      result.metadata.cached = true;
      await redisService.set(cacheKey, result, this.cacheTTL);
    } catch (error) {
      console.warn('⚠️ Failed to cache search result:', error.message);
    }
  }

  /**
   * Get cached search result
   */
  async getCachedResult(query, options) {
    try {
      const cacheKey = this.generateCacheKey(query, options);
      const cached = await redisService.get(cacheKey);

      if (cached) {
        cached.metadata.cached = true;
        cached.metadata.cache_hit = true;
      }

      return cached;
    } catch (error) {
      console.warn('⚠️ Failed to get cached result:', error.message);
      return null;
    }
  }

  /**
   * Generate cache key for search parameters
   */
  generateCacheKey(query, options) {
    // Use full query hash instead of truncated base64 to avoid collisions
    const queryHash = crypto.createHash('sha256').update(query).digest('hex').substring(0, 16);

    const keyParts = [
      'search',
      queryHash,
      options.topK || this.defaultTopK,
      options.minScore || this.minSimilarityScore,
      JSON.stringify(options.filters || {})
    ];

    return keyParts.join(':');
  }

  /**
   * Get service statistics
   */
  async getStats() {
    try {
      const qdrantStats = await this.qdrantService.getCollectionStats();
      const jinaStats = this.jinaService.getStats();

      return {
        qdrant: qdrantStats,
        jina: jinaStats,
        config: {
          defaultTopK: this.defaultTopK,
          maxTopK: this.maxTopK,
          minSimilarityScore: this.minSimilarityScore,
          cacheEnabled: this.cacheEnabled,
          cacheTTL: this.cacheTTL
        }
      };
    } catch (error) {
      console.error('❌ Failed to get RAG stats:', error.message);
      return { error: error.message };
    }
  }
}

export default RAGRetrievalService;