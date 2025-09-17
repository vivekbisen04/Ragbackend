#!/usr/bin/env node

import dotenv from 'dotenv';
import DailyNewsRefreshService from '../services/dailyNewsRefreshService.js';

// Load environment variables
dotenv.config();

class NewsRefreshScript {
  constructor() {
    this.refreshService = new DailyNewsRefreshService();
  }

  async run() {
    console.log('🔄 Starting manual news refresh...');
    console.log('=====================================');

    try {
      // Initialize the service
      await this.refreshService.initialize();

      // Perform refresh
      await this.refreshService.performDailyRefresh();

      console.log('✅ Manual news refresh completed successfully!');
      process.exit(0);

    } catch (error) {
      console.error('❌ Manual news refresh failed:', error.message);
      process.exit(1);
    }
  }

  async cleanup() {
    console.log('🧹 Starting cleanup only...');
    console.log('============================');

    try {
      // Initialize the service
      await this.refreshService.initialize();

      // Perform cleanup only
      const removedCount = await this.refreshService.removeOldArticles();
      await this.refreshService.clearRelatedCaches();
      await this.refreshService.cleanupAndOptimize();

      console.log(`✅ Cleanup completed! Removed ${removedCount} old articles.`);
      process.exit(0);

    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      process.exit(1);
    }
  }

  async status() {
    console.log('📊 Getting refresh status...');
    console.log('=============================');

    try {
      // Initialize the service
      await this.refreshService.initialize();

      const status = await this.refreshService.getRefreshStatus();

      console.log('Current Status:');
      console.log(`📰 Total Articles: ${status.totalArticles}`);
      console.log(`📅 Latest Article: ${status.latestArticleDate || 'None'}`);
      console.log(`🕒 Retention Days: ${status.retentionDays}`);
      console.log(`⏰ Cron Schedule: ${status.cronSchedule}`);
      console.log(`📡 Sources: ${status.sources.length} configured`);

      process.exit(0);

    } catch (error) {
      console.error('❌ Failed to get status:', error.message);
      process.exit(1);
    }
  }
}

// Parse command line arguments
const command = process.argv[2];
const script = new NewsRefreshScript();

switch (command) {
  case 'refresh':
    script.run();
    break;
  case 'cleanup':
    script.cleanup();
    break;
  case 'status':
    script.status();
    break;
  default:
    console.log('📰 News Refresh Script');
    console.log('=====================');
    console.log('');
    console.log('Usage:');
    console.log('  npm run refresh:news refresh  - Full refresh (cleanup + scrape new)');
    console.log('  npm run refresh:news cleanup  - Cleanup old articles only');
    console.log('  npm run refresh:news status   - Show current status');
    console.log('');
    console.log('Environment Variables:');
    console.log('  NEWS_RETENTION_DAYS     - Days to keep articles (default: 7)');
    console.log('  DAILY_REFRESH_CRON      - Cron schedule (default: 0 6 * * *)');
    console.log('  MAX_ARTICLES            - Max articles to keep (default: 50)');
    process.exit(1);
}