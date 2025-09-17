import dotenv from 'dotenv';
import NewsScraperService from '../services/newsScraperService.js';
import TextPreprocessor from '../services/textPreprocessor.js';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🔄 RAG Chatbot Data Preprocessor');
  console.log('=================================');

  const scraper = new NewsScraperService();
  const preprocessor = new TextPreprocessor({
    chunkSize: 800,
    chunkOverlap: 200,
    minChunkSize: 100,
    preserveParagraphs: true
  });

  try {
    // Load articles (either from latest scrape or scrape new ones)
    console.log('📚 Loading articles...');
    let articles = await scraper.loadLatestArticles();

    if (articles.length === 0) {
      console.log('No articles found. Running scraper first...');
      articles = await scraper.scrapeAllSources();
    }

    console.log(`Found ${articles.length} articles to process`);

    // Preprocess articles into chunks
    const processedChunks = await preprocessor.preprocessArticles(articles);

    // Display processing summary
    console.log('\n📊 Processing Summary:');
    console.log(`Total chunks created: ${processedChunks.length}`);
    console.log(`Articles processed: ${[...new Set(processedChunks.map(c => c.articleId))].length}`);

    const chunkTypes = processedChunks.reduce((acc, chunk) => {
      acc[chunk.type] = (acc[chunk.type] || 0) + 1;
      return acc;
    }, {});

    console.log('Chunk types:');
    Object.entries(chunkTypes).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });

    const avgChunkSize = Math.round(
      processedChunks.reduce((sum, chunk) => sum + chunk.charCount, 0) / processedChunks.length
    );
    console.log(`Average chunk size: ${avgChunkSize} characters`);

    const avgWordCount = Math.round(
      processedChunks.reduce((sum, chunk) => sum + chunk.wordCount, 0) / processedChunks.length
    );
    console.log(`Average word count: ${avgWordCount} words`);

    console.log('\n✅ Data preprocessing completed successfully!');
    console.log('Next: Run npm run embed to generate embeddings');

  } catch (error) {
    console.error('❌ Preprocessing failed:', error.message);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}