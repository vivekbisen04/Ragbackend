import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.maxTokens = parseInt(process.env.GEMINI_MAX_TOKENS) || 4096;
    this.temperature = parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7;
    this.topP = parseFloat(process.env.GEMINI_TOP_P) || 0.8;
    this.topK = parseInt(process.env.GEMINI_TOP_K) || 40;

    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is required. Please set it in your .env file.');
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.generativeModel = null;
    this.initialized = false;
  }

  /**
   * Initialize the Gemini service
   */
  async initialize() {
    try {
      console.log('🤖 Initializing Gemini service...');

      this.generativeModel = this.genAI.getGenerativeModel({
        model: this.model,
        generationConfig: {
          maxOutputTokens: this.maxTokens,
          temperature: this.temperature,
          topP: this.topP,
          topK: this.topK,
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      });

      // Test connection
      await this.testConnection();
      this.initialized = true;

      console.log('✅ Gemini service initialized successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize Gemini service:', error.message);
      throw error;
    }
  }

  /**
   * Test the Gemini API connection
   */
  async testConnection() {
    try {
      const testPrompt = "Hello! Can you respond with 'API connection successful'?";
      const result = await this.generativeModel.generateContent(testPrompt);
      const response = result.response;
      const text = response.text();

      if (text) {
        console.log('✅ Gemini API connection test passed');
        return true;
      } else {
        throw new Error('No response from Gemini API');
      }
    } catch (error) {
      console.error('❌ Gemini API connection test failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate a response using RAG context
   */
  async generateRAGResponse(userQuery, contexts, conversationHistory = []) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const prompt = this.buildRAGPrompt(userQuery, contexts, conversationHistory);
      console.log('🤖 Generating Gemini response for query:', userQuery.substring(0, 50) + '...');

      const startTime = Date.now();
      const result = await this.generativeModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      const processingTime = Date.now() - startTime;

      console.log(`✅ Gemini response generated in ${processingTime}ms`);

      return {
        content: text,
        metadata: {
          model: this.model,
          processing_time_ms: processingTime,
          prompt_tokens: this.estimateTokens(prompt),
          response_tokens: this.estimateTokens(text),
          contexts_used: contexts.length,
          temperature: this.temperature,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Gemini response generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Build optimized prompt for RAG responses
   */
  buildRAGPrompt(userQuery, contexts, conversationHistory = []) {
    const systemPrompt = `You are an AI assistant specialized in providing accurate, helpful responses based on news articles and information. Your role is to:

1. Answer questions using the provided context from news articles
2. Be factual and cite your sources when possible
3. If the context doesn't contain relevant information, clearly state that
4. Provide concise, well-structured responses
5. Consider the conversation history for context

Guidelines:
- Use information from the provided contexts to answer questions
- If multiple sources are provided, synthesize the information
- Be honest about limitations in the available information
- Maintain a helpful and professional tone
- For follow-up questions, consider the conversation context`;

    // Build conversation context
    let conversationContext = '';
    if (conversationHistory.length > 0) {
      conversationContext = '\n\nCONVERSATION HISTORY:\n';
      const recentHistory = conversationHistory.slice(-6); // Last 3 exchanges

      recentHistory.forEach(msg => {
        if (msg.role === 'user') {
          conversationContext += `User: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          conversationContext += `Assistant: ${msg.content}\n`;
        }
      });
    }

    // Build context information
    let contextInfo = '\n\nRELEVANT NEWS CONTEXT:\n';
    if (contexts && contexts.length > 0) {
      contexts.forEach((context, index) => {
        contextInfo += `\n[Source ${index + 1}: ${context.metadata?.source || 'Unknown'} - ${context.metadata?.title || 'Untitled'}]\n`;
        contextInfo += `Published: ${context.metadata?.published_date || 'Unknown date'}\n`;
        contextInfo += `Relevance Score: ${context.score?.toFixed(3) || 'N/A'}\n`;
        contextInfo += `Content: ${context.content || context.snippet || 'No content available'}\n`;
        if (context.metadata?.url) {
          contextInfo += `URL: ${context.metadata.url}\n`;
        }
      });
    } else {
      contextInfo += 'No relevant news context found for this query.\n';
    }

    // Build the final prompt
    const prompt = `${systemPrompt}${conversationContext}${contextInfo}

USER QUESTION: ${userQuery}

Please provide a helpful response based on the available context and conversation history. If you're citing specific information, mention which source it comes from.

RESPONSE:`;

    return prompt;
  }

  /**
   * Generate a simple response without RAG context
   */
  async generateSimpleResponse(userQuery, conversationHistory = []) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const prompt = this.buildSimplePrompt(userQuery, conversationHistory);

      const startTime = Date.now();
      const result = await this.generativeModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      const processingTime = Date.now() - startTime;

      return {
        content: text,
        metadata: {
          model: this.model,
          processing_time_ms: processingTime,
          prompt_tokens: this.estimateTokens(prompt),
          response_tokens: this.estimateTokens(text),
          type: 'simple_response',
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Gemini simple response failed:', error.message);
      throw error;
    }
  }

  /**
   * Build prompt for simple responses
   */
  buildSimplePrompt(userQuery, conversationHistory = []) {
    const systemPrompt = `You are a helpful AI assistant. Provide clear, accurate, and helpful responses to user questions. If you don't have specific information about current events or news, acknowledge that limitation.`;

    let conversationContext = '';
    if (conversationHistory.length > 0) {
      conversationContext = '\n\nCONVERSATION HISTORY:\n';
      const recentHistory = conversationHistory.slice(-4);

      recentHistory.forEach(msg => {
        if (msg.role === 'user') {
          conversationContext += `User: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          conversationContext += `Assistant: ${msg.content}\n`;
        }
      });
    }

    return `${systemPrompt}${conversationContext}

USER QUESTION: ${userQuery}

RESPONSE:`;
  }

  /**
   * Manage conversation context to stay within token limits
   */
  manageConversationContext(messages, maxTokens = 2000) {
    let totalTokens = 0;
    const managedMessages = [];

    // Start from the most recent messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = this.estimateTokens(message.content);

      if (totalTokens + messageTokens <= maxTokens) {
        managedMessages.unshift(message);
        totalTokens += messageTokens;
      } else {
        break;
      }
    }

    return {
      messages: managedMessages,
      totalTokens,
      trimmedCount: messages.length - managedMessages.length
    };
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      topP: this.topP,
      topK: this.topK,
      apiKey: this.apiKey ? '***configured***' : 'not_set'
    };
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.initialized && this.apiKey && this.generativeModel;
  }
}

export default GeminiService;