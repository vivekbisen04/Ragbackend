import Parser from 'rss-parser';
import crypto from 'crypto';

class RSSFeedScraper {
  constructor() {
    this.parser = new Parser({
      customFields: {
        feed: ['language', 'subtitle'],
        item: [
          ['media:content', 'mediaContent'],
          ['content:encoded', 'contentEncoded'],
          ['description', 'description'],
          ['dc:creator', 'creator'],
          ['dc:date', 'dcDate']
        ]
      }
    });

    // Define RSS feeds from major news sources
    this.feeds = [
      {
        name: 'BBC News',
        url: 'http://feeds.bbci.co.uk/news/rss.xml',
        category: 'general'
      },
      {
        name: 'Reuters',
        url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best',
        category: 'business'
      },
      {
        name: 'TechCrunch',
        url: 'https://techcrunch.com/feed/',
        category: 'technology'
      },
      {
        name: 'CNN Top Stories',
        url: 'http://rss.cnn.com/rss/edition.rss',
        category: 'general'
      },
      {
        name: 'The Guardian',
        url: 'https://www.theguardian.com/world/rss',
        category: 'world'
      },
      {
        name: 'NPR News',
        url: 'https://feeds.npr.org/1001/rss.xml',
        category: 'general'
      },
      {
        name: 'Associated Press',
        url: 'https://feeds.apnews.com/bce7b139f65947ea8e0d2c0f4b8daa9e/rss.xml',
        category: 'general'
      },
      {
        name: 'Ars Technica',
        url: 'https://feeds.arstechnica.com/arstechnica/index',
        category: 'technology'
      }
    ];
  }

  /**
   * Scrape articles from all RSS feeds
   */
  async scrapeAllFeeds(maxArticlesPerFeed = 10) {
    console.log(`🌐 Scraping articles from ${this.feeds.length} RSS feeds...`);

    const allArticles = [];
    const results = {
      successful: 0,
      failed: 0,
      totalArticles: 0,
      sources: {}
    };

    for (const feed of this.feeds) {
      try {
        console.log(`📡 Fetching from ${feed.name}...`);
        const articles = await this.scrapeFeed(feed, maxArticlesPerFeed);

        allArticles.push(...articles);
        results.successful++;
        results.totalArticles += articles.length;
        results.sources[feed.name] = articles.length;

        console.log(`✅ ${feed.name}: ${articles.length} articles`);

        // Small delay between requests to be respectful
        await this.delay(500);

      } catch (error) {
        console.error(`❌ Failed to scrape ${feed.name}:`, error.message);
        results.failed++;
        results.sources[feed.name] = 0;
      }
    }

    console.log(`🎉 Scraping completed: ${results.totalArticles} articles from ${results.successful}/${this.feeds.length} sources`);

    // Remove duplicates based on URL or title
    const uniqueArticles = this.removeDuplicates(allArticles);
    console.log(`📝 After deduplication: ${uniqueArticles.length} unique articles`);

    return {
      articles: uniqueArticles,
      stats: results
    };
  }

  /**
   * Scrape a single RSS feed
   */
  async scrapeFeed(feedConfig, maxArticles = 10) {
    try {
      const feed = await this.parser.parseURL(feedConfig.url);
      const articles = [];

      const itemsToProcess = feed.items.slice(0, maxArticles);

      for (const item of itemsToProcess) {
        try {
          const article = this.transformRSSItemToArticle(item, feedConfig);
          if (this.isValidArticle(article)) {
            articles.push(article);
          }
        } catch (itemError) {
          console.warn(`⚠️ Skipping item from ${feedConfig.name}:`, itemError.message);
        }
      }

      return articles;
    } catch (error) {
      throw new Error(`Failed to parse RSS feed ${feedConfig.name}: ${error.message}`);
    }
  }

  /**
   * Transform RSS item to our article format
   */
  transformRSSItemToArticle(item, feedConfig) {
    // Generate a consistent ID based on URL or title
    const id = this.generateArticleId(item.link || item.title);

    // Extract content from various possible fields
    let content = '';
    if (item.contentEncoded) {
      content = this.stripHtml(item.contentEncoded);
    } else if (item['content:encoded']) {
      content = this.stripHtml(item['content:encoded']);
    } else if (item.content) {
      content = this.stripHtml(item.content);
    } else if (item.description) {
      content = this.stripHtml(item.description);
    }

    // Clean and validate content
    content = this.cleanContent(content);

    // Create summary from content if not available
    let summary = item.summary || '';
    if (!summary && content) {
      summary = content.length > 300 ? content.substring(0, 300) + '...' : content;
    }

    return {
      id: id,
      title: item.title || 'Untitled Article',
      content: content,
      summary: summary,
      url: item.link || '',
      source: feedConfig.name,
      category: feedConfig.category,
      published_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      author: item.creator || item['dc:creator'] || 'Unknown Author',
      tags: this.extractTags(item),
      metadata: {
        originalTitle: item.title,
        rssGuid: item.guid || item.id,
        feedUrl: feedConfig.url,
        scrapedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Generate consistent article ID
   */
  generateArticleId(text) {
    if (!text) text = Date.now().toString();
    return crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
  }

  /**
   * Remove HTML tags from content
   */
  stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Clean content text
   */
  cleanContent(content) {
    if (!content) return '';

    return content
      .replace(/\[.*?\]/g, '') // Remove [citation] style markers
      .replace(/Continue reading.*$/i, '') // Remove "Continue reading" footers
      .replace(/Read more.*$/i, '') // Remove "Read more" footers
      .replace(/Source:.*$/i, '') // Remove source footers
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Normalize multiple newlines
      .trim();
  }

  /**
   * Extract tags from RSS item
   */
  extractTags(item) {
    const tags = [];

    if (item.categories) {
      if (Array.isArray(item.categories)) {
        tags.push(...item.categories);
      } else if (typeof item.categories === 'string') {
        tags.push(item.categories);
      }
    }

    if (item.keywords) {
      const keywords = item.keywords.split(',').map(k => k.trim());
      tags.push(...keywords);
    }

    return tags.filter(tag => tag && tag.length > 0);
  }

  /**
   * Validate article has minimum required content
   */
  isValidArticle(article) {
    return (
      article.title &&
      article.title.length > 10 &&
      article.content &&
      article.content.length > 100 &&
      article.url &&
      article.url.startsWith('http')
    );
  }

  /**
   * Remove duplicate articles
   */
  removeDuplicates(articles) {
    const seen = new Set();
    const unique = [];

    for (const article of articles) {
      // Create a key based on URL or title
      const key = article.url || article.title.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(article);
      }
    }

    return unique;
  }

  /**
   * Get available RSS feeds
   */
  getAvailableFeeds() {
    return this.feeds.map(feed => ({
      name: feed.name,
      category: feed.category,
      url: feed.url
    }));
  }

  /**
   * Add custom RSS feed
   */
  addCustomFeed(name, url, category = 'general') {
    this.feeds.push({ name, url, category });
  }

  /**
   * Utility delay function
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test a single feed
   */
  async testFeed(feedUrl) {
    try {
      console.log(`🧪 Testing RSS feed: ${feedUrl}`);
      const feed = await this.parser.parseURL(feedUrl);

      return {
        success: true,
        title: feed.title,
        description: feed.description,
        itemCount: feed.items.length,
        lastUpdated: feed.lastBuildDate,
        sampleItem: feed.items[0] ? {
          title: feed.items[0].title,
          pubDate: feed.items[0].pubDate,
          hasContent: !!(feed.items[0].contentEncoded || feed.items[0].content)
        } : null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default RSSFeedScraper;