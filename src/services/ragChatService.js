import GeminiService from './geminiService.js';
import RAGRetrievalService from './ragRetrievalService.js';
import redisService from './redisService.js';

class RAGChatService {
  constructor() {
    this.geminiService = new GeminiService();
    this.ragRetrievalService = new RAGRetrievalService();
    this.initialized = false;

    // Configuration
    this.maxContextLength = 3;
    this.conversationTokenLimit = 2000;
    this.minSimilarityScore = 0.3;
    this.fallbackToSimpleResponse = true;
  }

  /**
   * Initialize the RAG Chat service
   */
  async initialize() {
    try {
      console.log('🤖 Initializing RAG Chat Service...');

      await this.geminiService.initialize();
      await this.ragRetrievalService.initialize();

      this.initialized = true;
      console.log('✅ RAG Chat Service initialized successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize RAG Chat Service:', error.message);
      throw error;
    }
  }

  /**
   * Process a chat message and generate response
   */
  async processMessage(sessionId, userMessage, options = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const startTime = Date.now();
      console.log(`💬 Processing message for session ${sessionId}: "${userMessage.substring(0, 50)}..."`);

      // Get conversation history
      const conversationHistory = await redisService.getChatHistory(sessionId, 10);

      // Manage conversation context within token limits
      const managedContext = this.geminiService.manageConversationContext(
        conversationHistory,
        this.conversationTokenLimit
      );

      // Determine if we need RAG context
      const needsRAGContext = await this.shouldUseRAGContext(userMessage, managedContext.messages);

      let response;
      let ragResults = null;

      if (needsRAGContext) {
        // Get RAG context
        ragResults = await this.getRAGContext(userMessage, managedContext.messages, options);

        if (ragResults.contexts && ragResults.contexts.length > 0) {
          // Generate response with RAG context
          response = await this.geminiService.generateRAGResponse(
            userMessage,
            ragResults.contexts,
            managedContext.messages
          );

          response.metadata.rag_used = true;
          response.metadata.contexts_count = ragResults.contexts.length;

          // Add detailed source attribution
          response.metadata.sources = ragResults.contexts.map(context => ({
            title: context.metadata?.title || 'Unknown Title',
            source: context.metadata?.source || 'Unknown Source',
            url: context.metadata?.url || null,
            published_date: context.metadata?.published_date || null,
            relevance_score: context.score || 0,
            content_snippet: context.content?.substring(0, 200) + '...' || '',
            category: context.metadata?.category || 'unknown'
          }));
        } else {
          // No relevant context found, use simple response
          response = await this.generateFallbackResponse(userMessage, managedContext.messages);
          response.metadata.rag_used = false;
          response.metadata.fallback_reason = 'no_relevant_context';
        }
      } else {
        // Use simple response for general conversation
        response = await this.geminiService.generateSimpleResponse(userMessage, managedContext.messages);
        response.metadata.rag_used = false;
        response.metadata.reason = 'general_conversation';
      }

      // Enhance response metadata
      const totalTime = Date.now() - startTime;
      response.metadata.total_processing_time_ms = totalTime;
      response.metadata.conversation_context_managed = {
        original_messages: conversationHistory.length,
        used_messages: managedContext.messages.length,
        trimmed_messages: managedContext.trimmedCount,
        total_tokens: managedContext.totalTokens
      };

      console.log(`✅ Response generated in ${totalTime}ms (RAG: ${response.metadata.rag_used})`);

      return {
        content: response.content,
        metadata: response.metadata,
        rag_context: ragResults,
        session_info: {
          conversation_length: conversationHistory.length + 1,
          context_managed: managedContext.trimmedCount > 0
        }
      };

    } catch (error) {
      console.error('❌ Failed to process message:', error.message);
      throw error;
    }
  }

  /**
   * Determine if RAG context is needed for the query
   */
  async shouldUseRAGContext(userMessage, conversationHistory) {
    // Keywords that suggest information seeking
    const informationKeywords = [
      'news', 'latest', 'recent', 'update', 'what happened', 'tell me about',
      'information', 'details', 'when did', 'where is', 'who is', 'how many',
      'explain', 'describe', 'summary', 'report', 'article', 'story',
      'technology', 'business', 'politics', 'economy', 'india', 'indian'
    ];

    // Question patterns that suggest information seeking
    const questionPatterns = [
      /what is|what are|what was|what were/i,
      /who is|who are|who was|who were/i,
      /when did|when was|when will/i,
      /where is|where are|where was/i,
      /how many|how much|how often/i,
      /tell me|show me|explain/i,
      /latest.*news|recent.*news/i,
      /what.*happened|what.*happening/i
    ];

    const lowerMessage = userMessage.toLowerCase();

    // Check for information keywords
    const hasInfoKeywords = informationKeywords.some(keyword =>
      lowerMessage.includes(keyword)
    );

    // Check for question patterns
    const hasQuestionPattern = questionPatterns.some(pattern =>
      pattern.test(lowerMessage)
    );

    // Check conversation context for information-seeking intent
    let contextSuggestsInfo = false;
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-3);
      contextSuggestsInfo = recentMessages.some(msg =>
        msg.role === 'user' && informationKeywords.some(keyword =>
          msg.content.toLowerCase().includes(keyword)
        )
      );
    }

    // Simple heuristic: use RAG if it looks like information seeking
    return hasInfoKeywords || hasQuestionPattern || contextSuggestsInfo;
  }

  /**
   * Get RAG context for the user message
   */
  async getRAGContext(userMessage, conversationHistory, options = {}) {
    try {
      const searchOptions = {
        topK: options.maxContext || this.maxContextLength,
        minScore: options.minScore || this.minSimilarityScore,
        filters: options.filters || {},
        useCache: true,
        includeMetadata: true
      };

      // Enhanced query using conversation context
      const enhancedQuery = this.enhanceQueryWithContext(userMessage, conversationHistory);

      // Search for relevant context
      const searchResult = await this.ragRetrievalService.searchDocuments(
        enhancedQuery,
        searchOptions
      );

      return {
        query: {
          original: userMessage,
          enhanced: enhancedQuery,
          search_time_ms: searchResult.metadata.search_time_ms
        },
        contexts: searchResult.results,
        metadata: {
          total_found: searchResult.metadata.total_found,
          contexts_used: searchResult.results.length,
          min_score: searchOptions.minScore,
          search_successful: searchResult.results.length > 0
        }
      };

    } catch (error) {
      console.error('❌ Failed to get RAG context:', error.message);
      return {
        contexts: [],
        metadata: { error: error.message, search_successful: false }
      };
    }
  }

  /**
   * Enhance user query with conversation context
   */
  enhanceQueryWithContext(userMessage, conversationHistory) {
    // Don't enhance "Tell me about:" queries as they are specific article requests
    if (userMessage.startsWith('Tell me about:')) {
      return userMessage;
    }

    if (conversationHistory.length === 0) {
      return userMessage;
    }

    // Get recent user messages for context
    const recentUserMessages = conversationHistory
      .filter(msg => msg.role === 'user')
      .slice(-2)
      .map(msg => msg.content);

    // Only enhance if it's clearly a follow-up question
    if (this.isFollowUpQuestion(userMessage)) {
      // For follow-up questions, get context from the most recent article-specific query
      const lastArticleQuery = conversationHistory
        .filter(msg => msg.role === 'user' && msg.content.startsWith('Tell me about:'))
        .slice(-1)[0];

      if (lastArticleQuery) {
        // Extract the article title from the last "Tell me about:" query
        const articleTitle = lastArticleQuery.content.replace('Tell me about:', '').trim();
        return `${userMessage} ${articleTitle}`;
      }

      const combinedContext = recentUserMessages.join(' ');
      return `${combinedContext} ${userMessage}`;
    }

    // For non-follow-up questions, don't add context to avoid contamination
    return userMessage;
  }

  /**
   * Check if message is a follow-up question
   */
  isFollowUpQuestion(message) {
    // Don't treat "Tell me about: [Article Title]" as a follow-up question
    if (message.startsWith('Tell me about:')) {
      return false;
    }

    const followUpPatterns = [
      /^(what about|how about|and what|tell me more about that|more details about|anything else)/i,
      /^(also,|additionally,|furthermore,|moreover,)/i,
      /^(can you|could you|would you|will you)/i,
      /(more information|more details|elaborate|expand)/i
    ];

    return followUpPatterns.some(pattern => pattern.test(message.trim()));
  }

  /**
   * Extract key terms from conversation context
   */
  extractContextTerms(messages) {
    const stopWords = new Set([
      'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'shall', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'about', 'what', 'where', 'when', 'why', 'how', 'who'
    ]);

    const allWords = messages.join(' ')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Count word frequency
    const wordCount = {};
    allWords.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    // Return most frequent terms
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Generate fallback response when no RAG context is available
   */
  async generateFallbackResponse(userMessage, conversationHistory) {
    if (this.fallbackToSimpleResponse) {
      const response = await this.geminiService.generateSimpleResponse(userMessage, conversationHistory);

      // Add fallback indicator
      const fallbackNotice = "\n\n*Note: I don't have specific current news information about this topic. My response is based on general knowledge.*";

      return {
        content: response.content + fallbackNotice,
        metadata: {
          ...response.metadata,
          fallback_used: true,
          fallback_type: 'simple_response'
        }
      };
    }

    return {
      content: "I'm sorry, but I don't have enough relevant information to answer your question properly. Could you try rephrasing your question or asking about something else?",
      metadata: {
        fallback_used: true,
        fallback_type: 'no_response',
        model: 'fallback',
        processing_time_ms: 0,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Get service statistics
   */
  async getStats() {
    try {
      const geminiStats = this.geminiService.getStats();
      const ragStats = await this.ragRetrievalService.getStats();

      return {
        initialized: this.initialized,
        gemini: geminiStats,
        rag: ragStats,
        config: {
          maxContextLength: this.maxContextLength,
          conversationTokenLimit: this.conversationTokenLimit,
          minSimilarityScore: this.minSimilarityScore,
          fallbackToSimpleResponse: this.fallbackToSimpleResponse
        }
      };
    } catch (error) {
      return {
        initialized: this.initialized,
        error: error.message
      };
    }
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.initialized &&
           this.geminiService.isReady() &&
           this.ragRetrievalService;
  }
}

export default RAGChatService;