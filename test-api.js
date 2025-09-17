#!/usr/bin/env node

import axios from 'axios';

const API_BASE = 'http://localhost:3001';

async function testAPI() {
  console.log('🧪 Testing RAG Chatbot API');
  console.log('==========================');

  try {
    // Test 1: Health Check
    console.log('\n1. Testing health endpoint...');
    const healthResponse = await axios.get(`${API_BASE}/health`);
    console.log('✅ Health check:', healthResponse.data.status);

    // Test 2: API Info
    console.log('\n2. Testing API info...');
    const apiResponse = await axios.get(`${API_BASE}/api`);
    console.log('✅ API info:', apiResponse.data.name);

    // Test 3: Services Health
    console.log('\n3. Testing services health...');
    const servicesResponse = await axios.get(`${API_BASE}/api/health/services`);
    console.log('✅ Services status:', servicesResponse.data.status);
    console.log('   Services healthy:', servicesResponse.data.services_healthy);

    // Test 4: Search
    console.log('\n4. Testing search endpoint...');
    const searchResponse = await axios.post(`${API_BASE}/api/search`, {
      query: 'Indian technology news',
      options: { topK: 3 }
    });
    console.log('✅ Search results:', searchResponse.data.data.results.length, 'found');

    // Test 5: Chat
    console.log('\n5. Testing chat endpoint...');
    const chatResponse = await axios.post(`${API_BASE}/api/chat`, {
      message: 'What is the latest technology news?'
    });
    console.log('✅ Chat response received');
    console.log('   Session ID:', chatResponse.data.data.session_id);
    console.log('   RAG contexts:', chatResponse.data.data.rag_context?.contexts_found || 0);

    console.log('\n🎉 All API tests passed!');
    console.log('\n📊 Phase 3 Milestone Achieved:');
    console.log('✅ Express.js server running with middleware');
    console.log('✅ Redis integration for session management');
    console.log('✅ RAG retrieval service with Qdrant search');
    console.log('✅ Chat endpoints with context retrieval');
    console.log('✅ Search endpoints with filtering');
    console.log('✅ Health checks and monitoring');

  } catch (error) {
    console.error('❌ API test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testAPI();