import Parser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { RSS_SOURCES, SCRAPING_CONFIG } from '../config/newsSources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class NewsScraperService {
  constructor() {
    this.parser = new Parser({
      timeout: SCRAPING_CONFIG.requestTimeout,
      headers: {
        'User-Agent': SCRAPING_CONFIG.userAgent
      }
    });

    this.axiosInstance = axios.create({
      timeout: SCRAPING_CONFIG.requestTimeout,
      headers: {
        'User-Agent': SCRAPING_CONFIG.userAgent
      }
    });
  }

  async scrapeAllSources() {
    console.log('🚀 Starting news scraping from RSS sources...');
    const allArticles = [];
    let totalScraped = 0;

    for (const source of RSS_SOURCES) {
      if (totalScraped >= SCRAPING_CONFIG.maxArticles) {
        console.log(`✅ Reached maximum articles limit (${SCRAPING_CONFIG.maxArticles})`);
        break;
      }

      try {
        console.log(`📰 Scraping ${source.name}...`);
        const articles = await this.scrapeRSSFeed(source);
        const remainingSlots = SCRAPING_CONFIG.maxArticles - totalScraped;
        const articlesToAdd = articles.slice(0, remainingSlots);

        allArticles.push(...articlesToAdd);
        totalScraped += articlesToAdd.length;

        console.log(`✅ Scraped ${articlesToAdd.length} articles from ${source.name}`);

        // Rate limiting delay
        await this.delay(1000);
      } catch (error) {
        console.error(`❌ Error scraping ${source.name}:`, error.message);
      }
    }

    console.log(`🎉 Total articles scraped: ${allArticles.length}`);
    await this.saveArticles(allArticles);
    return allArticles;
  }

  async scrapeRSSFeed(source) {
    const articles = [];

    try {
      const feed = await this.parser.parseURL(source.url);

      for (const item of feed.items.slice(0, 10)) { // Limit per source
        try {
          const article = await this.processRSSItem(item, source);
          if (article && this.validateArticle(article)) {
            articles.push(article);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process article: ${item.title}`);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to parse RSS feed for ${source.name}:`, error.message);
    }

    return articles;
  }

  async processRSSItem(item, source) {
    const article = {
      id: this.generateId(item.link || item.guid),
      title: this.cleanText(item.title || ''),
      content: '',
      summary: this.cleanText(item.contentSnippet || item.summary || ''),
      url: item.link || '',
      publishedDate: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      source: source.name,
      category: source.category,
      scrapedAt: new Date().toISOString()
    };

    // Try to get full content from the article URL
    if (item.link) {
      try {
        article.content = await this.extractFullContent(item.link);
      } catch (error) {
        // Fallback to summary if full content extraction fails
        article.content = article.summary;
      }
    } else {
      article.content = article.summary;
    }

    return article;
  }

  async extractFullContent(url) {
    try {
      const response = await this.axiosInstance.get(url);
      const $ = cheerio.load(response.data);

      // Remove unwanted elements
      $('script, style, nav, header, footer, aside, .ad, .advertisement, .social-share').remove();

      // Try multiple selectors for article content
      const contentSelectors = [
        'article p',
        '.article-content p',
        '.post-content p',
        '.entry-content p',
        '.content p',
        'main p',
        '[data-module="ArticleBody"] p',
        '.story-body p'
      ];

      let content = '';
      for (const selector of contentSelectors) {
        const paragraphs = $(selector);
        if (paragraphs.length > 0) {
          content = paragraphs.map((_, el) => $(el).text().trim()).get().join(' ');
          break;
        }
      }

      // Fallback to any paragraph tags
      if (!content) {
        content = $('p').map((_, el) => $(el).text().trim()).get().join(' ');
      }

      return this.cleanText(content);
    } catch (error) {
      throw new Error(`Failed to extract content: ${error.message}`);
    }
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\u00A0-\u017F\u0100-\u024F]/g, '')
      .trim();
  }

  validateArticle(article) {
    return (
      article.title &&
      article.content &&
      article.content.length >= SCRAPING_CONFIG.minContentLength &&
      article.content.length <= SCRAPING_CONFIG.maxContentLength &&
      article.url
    );
  }

  generateId(input) {
    return Buffer.from(input).toString('base64').slice(0, 16);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveArticles(articles) {
    try {
      const dataDir = path.join(__dirname, '../../data/raw');
      await fs.mkdir(dataDir, { recursive: true });

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `news_articles_${timestamp}.json`;
      const filepath = path.join(dataDir, filename);

      await fs.writeFile(filepath, JSON.stringify(articles, null, 2));
      console.log(`💾 Articles saved to: ${filepath}`);

      // Also save as latest.json for easy access
      const latestPath = path.join(dataDir, 'latest.json');
      await fs.writeFile(latestPath, JSON.stringify(articles, null, 2));

      return filepath;
    } catch (error) {
      console.error('❌ Error saving articles:', error.message);
      throw error;
    }
  }

  async loadLatestArticles() {
    try {
      const filepath = path.join(__dirname, '../../data/raw/latest.json');
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('⚠️ No latest articles found');
      return [];
    }
  }
}

export default NewsScraperService;