// Simple, focused news sources - Indian + Global
export const RSS_SOURCES = [
  // Indian Sources (Primary)
  {
    name: 'Times of India',
    url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
    category: 'indian_national'
  },
  {
    name: 'The Hindu',
    url: 'https://www.thehindu.com/feeder/default.rss',
    category: 'indian_national'
  },
  {
    name: 'NDTV News',
    url: 'https://feeds.feedburner.com/ndtvnews-top-stories',
    category: 'indian_national'
  },
  {
    name: 'Economic Times',
    url: 'https://economictimes.indiatimes.com/rssfeedsdefault.cms',
    category: 'indian_business'
  },
  {
    name: 'NDTV Tech',
    url: 'https://feeds.feedburner.com/gadgets360-latest',
    category: 'indian_technology'
  },

  // Global Sources (Context)
  {
    name: 'BBC News',
    url: 'http://feeds.bbci.co.uk/news/rss.xml',
    category: 'global'
  },
  {
    name: 'Reuters',
    url: 'https://www.reuters.com/rssFeed/worldNews',
    category: 'global'
  }
];

export const SCRAPING_CONFIG = {
  maxArticles: 50,
  requestTimeout: 10000,
  retryAttempts: 3,
  retryDelay: 2000,
  userAgent: 'RAG-Chatbot/1.0',
  minContentLength: 200,
  maxContentLength: 50000
};