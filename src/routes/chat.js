import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import redisService from '../services/redisService.js';
import RAGChatService from '../services/ragChatService.js';

const router = express.Router();
const ragChatService = new RAGChatService();

// Initialize RAG Chat service
let ragChatInitialized = false;
ragChatService.initialize().then(() => {
  ragChatInitialized = true;
  console.log('✅ RAG Chat service initialized for chat routes');
}).catch(err => {
  console.error('❌ Failed to initialize RAG Chat service:', err.message);
});

/**
 * POST /api/chat
 * Send a message and get AI response
 */
router.post('/', asyncHandler(async (req, res) => {
  const { message, sessionId: providedSessionId, options = {} } = req.body;

  // Validate input
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new ValidationError('Message is required and cannot be empty');
  }

  if (message.length > 2000) {
    throw new ValidationError('Message too long (max 2000 characters)');
  }

  // Generate or use provided session ID
  const sessionId = providedSessionId || uuidv4();

  // Get or create session
  let session = await redisService.getSession(sessionId);
  if (!session) {
    session = await redisService.createSession(sessionId);
  }

  // Add user message to history
  const userMessage = {
    id: redisService.generateMessageId(),
    role: 'user',
    content: message.trim(),
    timestamp: new Date().toISOString()
  };

  await redisService.addMessage(sessionId, userMessage);

  let response;
  let processingError = null;

  // Use RAG Chat service if initialized
  if (ragChatInitialized) {
    try {
      // Process message with full RAG + Gemini pipeline
      response = await ragChatService.processMessage(sessionId, message.trim(), {
        maxContext: options.maxContext || 3,
        minScore: options.minScore || 0.3,
        filters: options.filters || {}
      });

    } catch (error) {
      console.error('❌ RAG Chat processing failed:', error.message);
      processingError = error.message;

      // Fallback response
      response = {
        content: "I'm experiencing some technical difficulties. Please try again later.",
        metadata: {
          error: error.message,
          fallback_used: true,
          model: 'error_fallback',
          timestamp: new Date().toISOString()
        },
        rag_context: null,
        session_info: { error: true }
      };
    }
  } else {
    // Service not initialized, provide simple response
    response = {
      content: "The AI service is still initializing. Please wait a moment and try again.",
      metadata: {
        service_status: 'initializing',
        model: 'initialization_fallback',
        timestamp: new Date().toISOString()
      },
      rag_context: null,
      session_info: { initializing: true }
    };
  }

  // Add AI response to history
  const assistantMessage = {
    id: redisService.generateMessageId(),
    role: 'assistant',
    content: response.content,
    timestamp: new Date().toISOString(),
    metadata: response.metadata
  };

  await redisService.addMessage(sessionId, assistantMessage);

  // Get updated session info
  const updatedSession = await redisService.getSession(sessionId);

  res.json({
    success: true,
    data: {
      session_id: sessionId,
      message: assistantMessage,
      rag_context: response.rag_context,
      session_info: {
        message_count: updatedSession.messageCount,
        created_at: updatedSession.createdAt,
        last_activity: updatedSession.lastActivity,
        ...response.session_info
      },
      processing_error: processingError
    }
  });
}));

/**
 * GET /api/chat/:sessionId/history
 * Get chat history for a session
 */
router.get('/:sessionId/history', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  // Validate session ID format
  if (!sessionId || sessionId.length < 10) {
    throw new ValidationError('Invalid session ID format');
  }

  // Check if session exists
  const session = await redisService.getSession(sessionId);
  if (!session) {
    throw new NotFoundError('Chat session not found');
  }

  // Get chat history
  const messages = await redisService.getChatHistory(sessionId, parseInt(limit) + parseInt(offset));

  // Apply offset (Redis LRANGE doesn't support offset directly)
  const paginatedMessages = messages.slice(parseInt(offset));

  res.json({
    success: true,
    data: {
      session_id: sessionId,
      messages: paginatedMessages,
      session_info: {
        total_messages: session.messageCount,
        created_at: session.createdAt,
        last_activity: session.lastActivity,
        returned: paginatedMessages.length,
        offset: parseInt(offset),
        limit: parseInt(limit)
      }
    }
  });
}));

/**
 * DELETE /api/chat/:sessionId
 * Clear chat session and history
 */
router.delete('/:sessionId', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  // Validate session ID
  if (!sessionId || sessionId.length < 10) {
    throw new ValidationError('Invalid session ID format');
  }

  // Check if session exists
  const session = await redisService.getSession(sessionId);
  if (!session) {
    throw new NotFoundError('Chat session not found');
  }

  // Delete session and all associated data
  await redisService.deleteSession(sessionId);

  res.json({
    success: true,
    data: {
      message: 'Chat session deleted successfully',
      session_id: sessionId,
      deleted_at: new Date().toISOString(),
      messages_deleted: session.messageCount
    }
  });
}));

/**
 * POST /api/chat/:sessionId/clear
 * Clear chat history but keep session
 */
router.post('/:sessionId/clear', asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  // Validate session ID
  if (!sessionId || sessionId.length < 10) {
    throw new ValidationError('Invalid session ID format');
  }

  // Check if session exists
  const session = await redisService.getSession(sessionId);
  if (!session) {
    throw new NotFoundError('Chat session not found');
  }

  // Clear chat history
  const previousMessageCount = session.messageCount;
  await redisService.clearChatHistory(sessionId);

  res.json({
    success: true,
    data: {
      message: 'Chat history cleared successfully',
      session_id: sessionId,
      cleared_at: new Date().toISOString(),
      messages_cleared: previousMessageCount
    }
  });
}));

/**
 * GET /api/chat/sessions
 * List active sessions (limited functionality for now)
 */
router.get('/sessions', asyncHandler(async (req, res) => {
  // Note: This is a simplified implementation
  // In production, you might want to maintain a separate index of active sessions

  res.json({
    success: true,
    data: {
      message: 'Session listing not implemented yet',
      note: 'Individual sessions can be accessed directly with session ID'
    }
  });
}));

export default router;