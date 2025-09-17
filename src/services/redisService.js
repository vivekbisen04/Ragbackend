import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryDelay = 2000;

    // Configuration
    this.url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.password = process.env.REDIS_PASSWORD || null;
    this.defaultTTL = parseInt(process.env.REDIS_TTL) || 3600; // 1 hour
    this.sessionTTL = parseInt(process.env.SESSION_TTL_HOURS) * 3600 || 24 * 3600; // 24 hours
    this.maxConversationHistory = parseInt(process.env.MAX_CONVERSATION_HISTORY) || 50;
  }

  async connect() {
    try {
      if (this.isConnected) {
        return this.client;
      }

      console.log('🔌 Connecting to Redis...');

      const clientConfig = {
        url: this.url,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries >= this.maxRetries) {
              console.error('❌ Redis max reconnection attempts reached');
              return false;
            }
            const delay = Math.min(this.retryDelay * Math.pow(2, retries), 30000);
            console.log(`🔄 Redis reconnecting in ${delay}ms (attempt ${retries + 1})`);
            return delay;
          }
        }
      };

      // Add password if provided
      if (this.password) {
        clientConfig.password = this.password;
      }

      this.client = createClient(clientConfig);

      // Event handlers
      this.client.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('🔗 Redis connecting...');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis connected and ready');
        this.isConnected = true;
        this.connectionRetries = 0;
      });

      this.client.on('end', () => {
        console.log('📴 Redis connection ended');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
        this.connectionRetries++;
      });

      await this.client.connect();
      return this.client;

    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  async testConnection() {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const pong = await this.client.ping();
      if (pong === 'PONG') {
        console.log('✅ Redis connection test passed');
        return true;
      } else {
        throw new Error('Invalid Redis ping response');
      }
    } catch (error) {
      console.error('❌ Redis connection test failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client && this.isConnected) {
        await this.client.quit();
        console.log('📴 Redis disconnected gracefully');
      }
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error.message);
    }
  }

  // Session Management Methods

  async createSession(sessionId) {
    try {
      if (!this.isConnected) await this.connect();

      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 0,
        metadata: {}
      };

      await this.client.hSet(sessionKey, {
        'id': sessionData.id,
        'createdAt': sessionData.createdAt,
        'lastActivity': sessionData.lastActivity,
        'messageCount': sessionData.messageCount.toString(),
        'metadata': JSON.stringify(sessionData.metadata)
      });
      await this.client.expire(sessionKey, this.sessionTTL);

      console.log(`📝 Created new session: ${sessionId}`);
      return sessionData;
    } catch (error) {
      console.error('❌ Failed to create session:', error.message);
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      if (!this.isConnected) await this.connect();

      const sessionKey = this.getSessionKey(sessionId);
      const sessionData = await this.client.hGetAll(sessionKey);

      if (Object.keys(sessionData).length === 0) {
        return null;
      }

      // Update last activity
      await this.updateSessionActivity(sessionId);

      return {
        id: sessionData.id,
        createdAt: sessionData.createdAt,
        lastActivity: sessionData.lastActivity,
        messageCount: parseInt(sessionData.messageCount) || 0,
        metadata: sessionData.metadata ? JSON.parse(sessionData.metadata) : {}
      };
    } catch (error) {
      console.error('❌ Failed to get session:', error.message);
      throw error;
    }
  }

  async updateSessionActivity(sessionId) {
    try {
      if (!this.isConnected) await this.connect();

      const sessionKey = this.getSessionKey(sessionId);
      await this.client.hSet(sessionKey, 'lastActivity', new Date().toISOString());
      await this.client.expire(sessionKey, this.sessionTTL);
    } catch (error) {
      console.error('❌ Failed to update session activity:', error.message);
    }
  }

  async deleteSession(sessionId) {
    try {
      if (!this.isConnected) await this.connect();

      const sessionKey = this.getSessionKey(sessionId);
      const messagesKey = this.getMessagesKey(sessionId);

      // Delete session data and messages
      const pipeline = this.client.multi();
      pipeline.del(sessionKey);
      pipeline.del(messagesKey);
      await pipeline.exec();

      console.log(`🗑️ Deleted session: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to delete session:', error.message);
      throw error;
    }
  }

  // Chat History Methods

  async addMessage(sessionId, message) {
    try {
      if (!this.isConnected) await this.connect();

      const messagesKey = this.getMessagesKey(sessionId);
      const sessionKey = this.getSessionKey(sessionId);

      // Prepare message with metadata
      const messageData = {
        id: message.id || this.generateMessageId(),
        role: message.role, // 'user' or 'assistant'
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        metadata: message.metadata || {}
      };

      // Add message to list
      await this.client.rPush(messagesKey, JSON.stringify(messageData));

      // Trim conversation history if too long
      const messageCount = await this.client.lLen(messagesKey);
      if (messageCount > this.maxConversationHistory) {
        const trimCount = messageCount - this.maxConversationHistory;
        await this.client.lTrim(messagesKey, trimCount, -1);
      }

      // Update session message count
      await this.client.hIncrBy(sessionKey, 'messageCount', 1);
      await this.updateSessionActivity(sessionId);

      // Set TTL on messages
      await this.client.expire(messagesKey, this.sessionTTL);

      return messageData;
    } catch (error) {
      console.error('❌ Failed to add message:', error.message);
      throw error;
    }
  }

  async getChatHistory(sessionId, limit = 50) {
    try {
      if (!this.isConnected) await this.connect();

      const messagesKey = this.getMessagesKey(sessionId);
      const messages = await this.client.lRange(messagesKey, -limit, -1);

      return messages.map(msg => JSON.parse(msg));
    } catch (error) {
      console.error('❌ Failed to get chat history:', error.message);
      throw error;
    }
  }

  async clearChatHistory(sessionId) {
    try {
      if (!this.isConnected) await this.connect();

      const messagesKey = this.getMessagesKey(sessionId);
      const sessionKey = this.getSessionKey(sessionId);

      await this.client.del(messagesKey);
      await this.client.hSet(sessionKey, 'messageCount', '0');
      await this.updateSessionActivity(sessionId);

      console.log(`🧹 Cleared chat history for session: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to clear chat history:', error.message);
      throw error;
    }
  }

  // General Cache Methods

  async set(key, value, ttl = null) {
    try {
      if (!this.isConnected) await this.connect();

      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

      if (ttl) {
        await this.client.setEx(key, ttl, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }

      return true;
    } catch (error) {
      console.error('❌ Failed to set cache value:', error.message);
      throw error;
    }
  }

  async get(key) {
    try {
      if (!this.isConnected) await this.connect();

      const value = await this.client.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error('❌ Failed to get cache value:', error.message);
      throw error;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected) await this.connect();

      return await this.client.del(key);
    } catch (error) {
      console.error('❌ Failed to delete cache value:', error.message);
      throw error;
    }
  }

  // Statistics and Monitoring

  async getStats() {
    try {
      if (!this.isConnected) await this.connect();

      const info = await this.client.info();
      const dbSize = await this.client.dbSize();

      return {
        connected: this.isConnected,
        dbSize,
        info: this.parseRedisInfo(info),
        connectionRetries: this.connectionRetries
      };
    } catch (error) {
      console.error('❌ Failed to get Redis stats:', error.message);
      return { connected: false, error: error.message };
    }
  }

  // Utility Methods

  getSessionKey(sessionId) {
    return `session:${sessionId}`;
  }

  getMessagesKey(sessionId) {
    return `messages:${sessionId}`;
  }

  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const parsed = {};

    for (const line of lines) {
      if (line.includes(':') && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        parsed[key] = value;
      }
    }

    return {
      version: parsed.redis_version,
      uptime_in_seconds: parseInt(parsed.uptime_in_seconds),
      connected_clients: parseInt(parsed.connected_clients),
      used_memory: parsed.used_memory_human,
      total_connections_received: parseInt(parsed.total_connections_received),
      total_commands_processed: parseInt(parsed.total_commands_processed)
    };
  }
}

// Create singleton instance
const redisService = new RedisService();

export default redisService;