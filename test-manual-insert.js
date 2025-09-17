#!/usr/bin/env node

import QdrantService from './src/services/qdrantService.js';

async function testManualInsert() {
  console.log('🧪 Testing manual insertion to Qdrant...');

  const qdrant = new QdrantService();

  try {
    // Initialize Qdrant
    await qdrant.initialize();

    // Delete and recreate collection
    console.log('🗑️ Deleting existing collection...');
    try {
      await qdrant.client.deleteCollection('news_embeddings');
    } catch (e) {
      console.log('Collection might not exist, continuing...');
    }

    console.log('🏗️ Creating fresh collection...');
    await qdrant.client.createCollection('news_embeddings', {
      vectors: {
        size: 768,
        distance: 'Cosine',
        on_disk: true
      }
    });

    // Create test embeddings
    const testPoints = [
      {
        id: 'test1',
        vector: new Array(768).fill(0.1), // Simple test vector
        payload: {
          title: 'Test Article 1',
          source: 'Test Source',
          category: 'test',
          text: 'This is a test article about technology.'
        }
      },
      {
        id: 'test2',
        vector: new Array(768).fill(0.2), // Different test vector
        payload: {
          title: 'Test Article 2',
          source: 'Test Source',
          category: 'test',
          text: 'This is another test article about business.'
        }
      },
      {
        id: 'test3',
        vector: new Array(768).fill(0.3), // Another test vector
        payload: {
          title: 'Test Article 3',
          source: 'Test Source',
          category: 'test',
          text: 'This is a third test article about sports.'
        }
      }
    ];

    console.log('📝 Inserting 3 test points...');
    await qdrant.client.upsert('news_embeddings', {
      wait: true,
      points: testPoints
    });

    console.log('✅ Test points inserted');

    // Check collection status
    const info = await qdrant.client.getCollection('news_embeddings');
    console.log('📊 Collection after insert:', info.points_count, 'points');

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check again
    const info2 = await qdrant.client.getCollection('news_embeddings');
    console.log('📊 Collection after wait:', info2.points_count, 'points');

    // List points
    const points = await qdrant.client.scroll('news_embeddings', {
      limit: 10,
      with_payload: true,
      with_vector: false
    });

    console.log('📋 Points in collection:', points.points.length);
    points.points.forEach((point, i) => {
      console.log(`  ${i + 1}. ID: ${point.id}, Title: ${point.payload?.title}`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testManualInsert();