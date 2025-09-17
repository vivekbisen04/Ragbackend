import dotenv from 'dotenv';
import NewsScraperService from '../services/newsScraperService.js';
import { RSS_SOURCES } from '../config/newsSources.js';

// Load environment variables
dotenv.config();

class IndianNewsScraperService extends NewsScraperService {
  constructor() {
    super();
    this.sources = RSS_SOURCES;
  }

  async scrapeIndianNews() {
    console.log(`🇮🇳 Starting news scraping - Indian + Global sources`);
    console.log(`📰 Sources to scrape: ${this.sources.length}`);

    const allArticles = [];
    let totalScraped = 0;

    for (const source of this.sources) {
      if (totalScraped >= this.getMaxArticles()) {
        console.log(`✅ Reached maximum articles limit`);
        break;
      }

      try {
        console.log(`📰 Scraping ${source.name}...`);
        const articles = await this.scrapeRSSFeed(source);
        const remainingSlots = this.getMaxArticles() - totalScraped;
        const articlesToAdd = articles.slice(0, Math.min(remainingSlots, 8)); // Max 8 per source

        allArticles.push(...articlesToAdd);
        totalScraped += articlesToAdd.length;

        console.log(`✅ Got ${articlesToAdd.length} articles`);

        // Rate limiting delay
        await this.delay(1500);
      } catch (error) {
        console.error(`❌ Error scraping ${source.name}:`, error.message);
      }
    }

    console.log(`\n🎉 News scraping completed!`);
    console.log(`Total articles: ${allArticles.length}`);

    await this.saveArticles(allArticles);
    this.printScrapingSummary(allArticles);

    return allArticles;
  }

  getMaxArticles() {
    return process.env.MAX_ARTICLES || 50;
  }

  printScrapingSummary(articles) {
    console.log('\n📊 News Scraping Summary:');
    console.log('========================');

    // By category
    const byCategory = articles.reduce((acc, article) => {
      acc[article.category] = (acc[article.category] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📂 By Category:');
    Object.entries(byCategory).forEach(([category, count]) => {
      console.log(`  ${category}: ${count} articles`);
    });

    // By source
    const bySources = articles.reduce((acc, article) => {
      acc[article.source] = (acc[article.source] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📰 Sources:');
    Object.entries(bySources).forEach(([source, count]) => {
      console.log(`  ${source}: ${count} articles`);
    });

    const avgContentLength = Math.round(
      articles.reduce((sum, a) => sum + a.content.length, 0) / articles.length
    );
    console.log(`\n📏 Average content length: ${avgContentLength} characters`);

    console.log('\n✅ Ready for preprocessing with npm run preprocess');
  }
}

async function main() {
  console.log('🇮🇳 RAG Chatbot - News Scraper');
  console.log('===============================');

  const scraper = new IndianNewsScraperService();

  try {
    await scraper.scrapeIndianNews();
  } catch (error) {
    console.error('❌ News scraping failed:', error.message);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default IndianNewsScraperService;