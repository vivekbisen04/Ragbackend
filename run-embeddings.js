#!/usr/bin/env node

import EmbeddingPipeline from './src/services/embeddingPipeline.js';

async function runEmbeddings() {
  console.log('🔄 Re-running embedding pipeline to populate vector database...');

  const pipeline = new EmbeddingPipeline();

  try {
    // Run the pipeline with clearExistingData=true to start fresh
    await pipeline.runPipeline({
      clearExistingData: true,
      resumeFromCheckpoint: false,
      batchSize: 25  // Smaller batch size for stability
    });

    console.log('✅ Embedding pipeline completed successfully!');
    console.log('Vector database should now contain all articles.');

  } catch (error) {
    console.error('❌ Embedding pipeline failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

runEmbeddings();