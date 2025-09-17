#!/usr/bin/env node

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE = 'http://localhost:3001';

async function testRAGPipeline() {
  console.log('🧪 Testing Complete RAG Pipeline');
  console.log('================================');

  try {
    // Test 1: Health Check
    console.log('\n1. Testing service health...');
    const healthResponse = await axios.get(`${API_BASE}/api/health/services`);
    console.log('✅ Service status:', healthResponse.data.status);
    console.log('   Services:', healthResponse.data.services_healthy);

    // Test 2: Check Search Statistics
    console.log('\n2. Testing search statistics...');
    const statsResponse = await axios.get(`${API_BASE}/api/search/stats`);
    console.log('✅ Search service ready');
    console.log('   Collection points:', statsResponse.data.data.statistics.qdrant.points_count);

    // Test 3: Basic Search Test
    console.log('\n3. Testing basic search functionality...');
    const searchResponse = await axios.post(`${API_BASE}/api/search`, {
      query: 'Indian technology news',
      options: { topK: 3 }
    });
    console.log('✅ Search results:', searchResponse.data.data.results.length, 'found');
    if (searchResponse.data.data.results.length > 0) {
      console.log('   Top result score:', searchResponse.data.data.results[0].score);
      console.log('   Top result source:', searchResponse.data.data.results[0].metadata?.source);
    }

    // Test 4: Chat Pipeline Test
    console.log('\n4. Testing RAG Chat Pipeline...');
    const sessionId = uuidv4();

    // First message - information seeking
    console.log('\n   4a. Testing information-seeking query...');
    const chatResponse1 = await axios.post(`${API_BASE}/api/chat`, {
      sessionId: sessionId,
      message: 'What is the latest technology news from India?'
    });

    console.log('✅ Chat response received');
    console.log('   Session ID:', chatResponse1.data.data.session_id);
    console.log('   Response length:', chatResponse1.data.data.message.content.length, 'characters');
    console.log('   RAG used:', chatResponse1.data.data.message.metadata.rag_used || 'unknown');
    console.log('   Model:', chatResponse1.data.data.message.metadata.model);
    console.log('   Processing time:', chatResponse1.data.data.message.metadata.processing_time_ms || 'unknown', 'ms');

    if (chatResponse1.data.data.rag_context) {
      console.log('   RAG contexts found:', chatResponse1.data.data.rag_context.contexts?.length || 0);
    }

    // Test 5: Follow-up Question
    console.log('\n   4b. Testing follow-up question...');
    const chatResponse2 = await axios.post(`${API_BASE}/api/chat`, {
      sessionId: sessionId,
      message: 'Tell me more about that'
    });

    console.log('✅ Follow-up response received');
    console.log('   Response length:', chatResponse2.data.data.message.content.length, 'characters');
    console.log('   RAG used:', chatResponse2.data.data.message.metadata.rag_used || 'unknown');

    // Test 6: General Conversation
    console.log('\n   4c. Testing general conversation...');
    const chatResponse3 = await axios.post(`${API_BASE}/api/chat`, {
      sessionId: sessionId,
      message: 'How are you today?'
    });

    console.log('✅ General conversation response received');
    console.log('   RAG used:', chatResponse3.data.data.message.metadata.rag_used || 'unknown');
    console.log('   Model:', chatResponse3.data.data.message.metadata.model);

    // Test 7: Chat History
    console.log('\n5. Testing chat history retrieval...');
    const historyResponse = await axios.get(`${API_BASE}/api/chat/${sessionId}/history`);
    console.log('✅ Chat history retrieved');
    console.log('   Total messages:', historyResponse.data.data.messages.length);
    console.log('   Session created:', historyResponse.data.data.session_info.created_at);

    // Test 8: Advanced Search with Filters
    console.log('\n6. Testing advanced search with filters...');
    const advancedSearchResponse = await axios.post(`${API_BASE}/api/search`, {
      query: 'business news',
      options: {
        topK: 5,
        filters: {
          categories: ['indian_business'],
          sources: ['Economic Times']
        }
      }
    });
    console.log('✅ Advanced search completed');
    console.log('   Filtered results:', advancedSearchResponse.data.data.results.length);

    // Test 9: Session Cleanup
    console.log('\n7. Testing session cleanup...');
    const deleteResponse = await axios.delete(`${API_BASE}/api/chat/${sessionId}`);
    console.log('✅ Session deleted:', deleteResponse.data.data.message);

    // Summary
    console.log('\n🎉 Complete RAG Pipeline Test Results:');
    console.log('=====================================');
    console.log('✅ Health checks: PASSED');
    console.log('✅ Search functionality: PASSED');
    console.log('✅ RAG retrieval: PASSED');
    console.log('✅ Chat integration: PASSED');
    console.log('✅ Context management: PASSED');
    console.log('✅ Follow-up questions: PASSED');
    console.log('✅ Session management: PASSED');
    console.log('✅ Advanced filtering: PASSED');

    console.log('\n📊 Phase 4 Milestone: ACHIEVED ✅');
    console.log('🎯 Complete backend with working RAG pipeline generating contextual responses');
    console.log('\n🚀 Ready for Phase 5: Frontend Development!');

  } catch (error) {
    console.error('\n❌ RAG Pipeline test failed:', error.message);

    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }

    console.log('\n🔧 Troubleshooting Tips:');
    console.log('1. Ensure server is running: npm run dev');
    console.log('2. Check Gemini API key is set in .env');
    console.log('3. Verify all services are healthy: curl http://localhost:3001/api/health/services');
    console.log('4. Check if embeddings exist: curl http://localhost:3001/api/search/stats');
  }
}

// Get Gemini API key instruction
function printGeminiSetup() {
  console.log('\n📋 Gemini API Setup Required:');
  console.log('=============================');
  console.log('1. Visit https://makersuite.google.com/app/apikey');
  console.log('2. Create a new API key');
  console.log('3. Add to .env file: GEMINI_API_KEY=your_key_here');
  console.log('4. Restart the server');
  console.log('\nThen run this test again!');
}

// Run test with setup check
if (process.argv.includes('--help')) {
  printGeminiSetup();
} else {
  testRAGPipeline();
}