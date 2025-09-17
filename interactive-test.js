#!/usr/bin/env node

import readline from 'readline';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = 'http://localhost:3001';
const sessionId = uuidv4();

console.log('🤖 RAG Chatbot Interactive Test');
console.log('================================');
console.log(`Session ID: ${sessionId}`);
console.log('Type "exit" to quit, "help" for commands\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '💬 You: '
});

async function sendMessage(message) {
  try {
    const response = await axios.post(`${API_BASE}/api/chat`, {
      sessionId: sessionId,
      message: message
    });

    const data = response.data.data;
    console.log(`🤖 Bot: ${data.message.content}`);

    if (data.rag_context && data.rag_context.contexts) {
      console.log(`📚 Used ${data.rag_context.contexts.length} context(s) from RAG`);
    }

    console.log(`⚡ RAG used: ${data.message.metadata.rag_used}`);
    console.log(`⏱️  Response time: ${data.message.metadata.processing_time_ms}ms\n`);

  } catch (error) {
    console.error('❌ Error:', error.response?.data?.error?.message || error.message);
  }
}

async function showHelp() {
  console.log('\n📋 Available Commands:');
  console.log('  help     - Show this help');
  console.log('  history  - Show chat history');
  console.log('  search   - Test search functionality');
  console.log('  health   - Check service health');
  console.log('  clear    - Clear chat history');
  console.log('  exit     - Quit the test\n');
}

async function showHistory() {
  try {
    const response = await axios.get(`${API_BASE}/api/chat/${sessionId}/history`);
    const messages = response.data.data.messages;

    console.log('\n📚 Chat History:');
    messages.forEach((msg, i) => {
      const role = msg.role === 'user' ? '💬 You' : '🤖 Bot';
      console.log(`${i + 1}. ${role}: ${msg.content.substring(0, 100)}...`);
    });
    console.log();
  } catch (error) {
    console.error('❌ Error fetching history:', error.message);
  }
}

async function testSearch() {
  const query = await new Promise(resolve => {
    rl.question('🔍 Enter search query: ', resolve);
  });

  try {
    const response = await axios.post(`${API_BASE}/api/search`, {
      query: query,
      options: { topK: 2 }
    });

    const results = response.data.data.results;
    console.log(`\n📊 Found ${results.length} results:`);
    results.forEach((result, i) => {
      console.log(`${i + 1}. Score: ${result.score} - ${result.metadata?.title || 'No title'}`);
      console.log(`   Source: ${result.metadata?.source || 'Unknown'}`);
      console.log(`   Snippet: ${result.snippet || result.content.substring(0, 100)}...\n`);
    });
  } catch (error) {
    console.error('❌ Search error:', error.message);
  }
}

async function checkHealth() {
  try {
    const response = await axios.get(`${API_BASE}/api/health/services`);
    const health = response.data;

    console.log('\n💚 Service Health:');
    console.log(`Status: ${health.status}`);
    console.log(`Services: ${health.services_healthy}`);
    Object.entries(health.services).forEach(([service, data]) => {
      console.log(`  ${service}: ${data.status}`);
    });
    console.log();
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
}

async function clearHistory() {
  try {
    await axios.post(`${API_BASE}/api/chat/${sessionId}/clear`);
    console.log('✅ Chat history cleared\n');
  } catch (error) {
    console.error('❌ Error clearing history:', error.message);
  }
}

rl.prompt();

rl.on('line', async (input) => {
  const command = input.trim().toLowerCase();

  if (command === 'exit') {
    console.log('👋 Goodbye!');
    rl.close();
    return;
  }

  if (command === 'help') {
    await showHelp();
  } else if (command === 'history') {
    await showHistory();
  } else if (command === 'search') {
    await testSearch();
  } else if (command === 'health') {
    await checkHealth();
  } else if (command === 'clear') {
    await clearHistory();
  } else if (command) {
    await sendMessage(input);
  }

  rl.prompt();
});

rl.on('close', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});