import dotenv from 'dotenv';
import EmbeddingPipeline from '../services/embeddingPipeline.js';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🎯 RAG Chatbot - Embedding Generation');
  console.log('====================================');

  // Parse command line options
  const args = process.argv.slice(2);
  const options = {
    resumeFromCheckpoint: !args.includes('--no-resume'),
    clearExistingData: args.includes('--clear'),
    batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 50
  };

  console.log('⚙️ Options:');
  console.log(`  Resume from checkpoint: ${options.resumeFromCheckpoint}`);
  console.log(`  Clear existing data: ${options.clearExistingData}`);
  console.log(`  Batch size: ${options.batchSize}`);

  const pipeline = new EmbeddingPipeline();

  try {
    // Check if services are ready
    console.log('\n🔍 Checking prerequisites...');

    // Verify API keys
    if (!process.env.JINA_API_KEY) {
      throw new Error('JINA_API_KEY is required. Please set it in your .env file.');
    }

    console.log('✅ Prerequisites checked');

    // Run the pipeline
    const stats = await pipeline.runPipeline(options);

    // Display results
    console.log('\n📊 Final Statistics:');
    console.log('===================');

    if (stats && stats.qdrant) {
      console.log(`📚 Collection: ${stats.qdrant.collection_name}`);
      console.log(`📄 Total points: ${stats.qdrant.points_count}`);
      console.log(`🎯 Vectors: ${stats.qdrant.vectors_count}`);
      console.log(`📈 Indexed vectors: ${stats.qdrant.indexed_vectors_count}`);
      console.log(`💾 Disk usage: ${Math.round(stats.qdrant.disk_data_size / 1024 / 1024)} MB`);
      console.log(`🧠 RAM usage: ${Math.round(stats.qdrant.ram_data_size / 1024 / 1024)} MB`);
    }

    // Test search functionality
    console.log('\n🔍 Testing search functionality...');
    await pipeline.testSearch("Indian technology news");

    console.log('\n🎉 Embedding generation completed successfully!');
    console.log('✅ Your RAG system is ready for Phase 3!');

    console.log('\n📋 Next Steps:');
    console.log('1. Start services: docker-compose up -d');
    console.log('2. Run backend: npm run dev');
    console.log('3. Begin Phase 3: API development');

  } catch (error) {
    console.error('\n❌ Embedding generation failed:', error.message);

    // Show troubleshooting tips
    console.log('\n🔧 Troubleshooting:');

    if (error.message.includes('JINA_API_KEY')) {
      console.log('1. Get Jina AI API key from: https://jina.ai/');
      console.log('2. Add to .env file: JINA_API_KEY=your_key_here');
    }

    if (error.message.includes('Qdrant') || error.message.includes('connection')) {
      console.log('1. Start Qdrant: docker-compose up -d qdrant');
      console.log('2. Check health: curl http://localhost:6333/health');
    }

    if (error.message.includes('chunks not found')) {
      console.log('1. Run preprocessing first: npm run preprocess');
      console.log('2. Or scrape data: npm run scrape:indian');
    }

    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;