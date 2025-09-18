import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

/**
 * Simple admin authentication middleware
 */
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
  const expectedKey = process.env.ADMIN_API_KEY || 'default-admin-key-123';

  if (adminKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Provide valid admin key in X-Admin-Key header or admin_key query parameter.'
    });
  }

  next();
};

/**
 * POST /api/admin/scrape-articles
 * Scrape articles from RSS feeds and populate the database
 */
router.post('/scrape-articles', adminAuth, asyncHandler(async (req, res) => {
  try {
    console.log('🚀 Admin scraping request initiated');

    // Create data directories if they don't exist
    const dataDir = path.join(process.cwd(), 'data');
    const rawDir = path.join(dataDir, 'raw');
    const processedDir = path.join(dataDir, 'processed');

    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(rawDir, { recursive: true });
    await fs.mkdir(processedDir, { recursive: true });

    // Sample RSS feeds and news sources
    const sampleArticles = await scrapeArticlesFromSources();

    // Save to latest.json (preprocessor expects array format)
    const rawDataPath = path.join(rawDir, 'latest.json');
    await fs.writeFile(rawDataPath, JSON.stringify(sampleArticles, null, 2));

    // Also save stats separately if needed
    const statsPath = path.join(rawDir, 'scrape-stats.json');
    await fs.writeFile(statsPath, JSON.stringify({
      total_articles: sampleArticles.length,
      scraped_at: new Date().toISOString(),
      sources: getSourceStats(sampleArticles),
      categories: getCategoryStats(sampleArticles)
    }, null, 2));

    console.log(`✅ Saved ${sampleArticles.length} articles to ${rawDataPath}`);

    // Run preprocessing first
    console.log('🔄 Starting preprocessing...');
    await runPreprocessing();

    // Run embedding pipeline
    console.log('🔄 Starting embedding generation...');
    const embeddingResult = await runEmbeddingPipeline();

    res.json({
      success: true,
      message: 'Articles scraped and embeddings generated successfully',
      data: {
        articles_scraped: sampleArticles.length,
        sources: Object.keys(getSourceStats(sampleArticles)),
        categories: Object.keys(getCategoryStats(sampleArticles)),
        embeddings_generated: embeddingResult.success,
        scraped_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Scraping failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to scrape articles',
      details: error.message
    });
  }
}));

/**
 * GET /api/admin/scrape-status
 * Check if articles exist and scraping status
 */
router.get('/scrape-status', adminAuth, asyncHandler(async (req, res) => {
  try {
    const rawDataPath = path.join(process.cwd(), 'data', 'raw', 'latest.json');

    let status = {
      articles_exist: false,
      article_count: 0,
      last_scraped: null,
      data_file_exists: false
    };

    try {
      await fs.access(rawDataPath);
      status.data_file_exists = true;

      const rawData = JSON.parse(await fs.readFile(rawDataPath, 'utf8'));
      status.articles_exist = true;
      status.article_count = rawData.articles?.length || 0;
      status.last_scraped = rawData.stats?.scraped_at || null;
    } catch (error) {
      // File doesn't exist, keep defaults
    }

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check scrape status',
      details: error.message
    });
  }
}));

/**
 * POST /api/admin/regenerate-embeddings
 * Regenerate embeddings from existing articles
 */
router.post('/regenerate-embeddings', adminAuth, asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Admin regenerate embeddings request');

    const embeddingResult = await runEmbeddingPipeline();

    res.json({
      success: true,
      message: 'Embeddings regenerated successfully',
      data: {
        embeddings_generated: embeddingResult.success,
        regenerated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Embedding regeneration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate embeddings',
      details: error.message
    });
  }
}));

/**
 * Sample article scraping function
 * In production, this would fetch from real RSS feeds or APIs
 */
async function scrapeArticlesFromSources() {
  // Sample articles representing different news categories
  const sampleArticles = [
    {
      id: 'tech_001',
      title: 'AI Breakthrough: New Language Model Achieves Human-Level Reasoning',
      content: 'Researchers at a leading AI laboratory have announced a significant breakthrough in artificial intelligence. The new language model demonstrates human-level reasoning capabilities across multiple domains including mathematics, science, and creative writing. The model, which uses advanced transformer architecture with novel attention mechanisms, has shown remarkable performance on standardized tests and real-world problem-solving tasks. This development brings us closer to artificial general intelligence and has sparked discussions about the future of human-AI collaboration in various industries.',
      summary: 'New AI language model demonstrates human-level reasoning across multiple domains, marking a significant breakthrough toward artificial general intelligence.',
      url: 'https://example.com/ai-breakthrough-2025',
      source: 'TechNews Today',
      category: 'technology',
      published_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Dr. Sarah Chen',
      tags: ['AI', 'machine learning', 'technology', 'research']
    },
    {
      id: 'health_001',
      title: 'Revolutionary Gene Therapy Shows Promise for Treating Alzheimer\'s Disease',
      content: 'Clinical trials for a groundbreaking gene therapy treatment for Alzheimer\'s disease have shown unprecedented results. The therapy, which targets specific genetic markers associated with the disease, has demonstrated significant improvement in cognitive function among patients in early-stage trials. The treatment works by introducing healthy genes into brain cells to replace or supplement faulty ones. Researchers report that 70% of patients showed measurable improvement in memory and cognitive abilities after six months of treatment. This breakthrough offers new hope for millions of families affected by Alzheimer\'s worldwide.',
      summary: 'New gene therapy for Alzheimer\'s shows 70% success rate in early trials, offering hope for treating cognitive decline.',
      url: 'https://example.com/alzheimers-gene-therapy',
      source: 'Medical Journal Weekly',
      category: 'health',
      published_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Dr. Michael Rodriguez',
      tags: ['gene therapy', 'alzheimers', 'healthcare', 'medical research']
    },
    {
      id: 'climate_001',
      title: 'Solar Energy Costs Drop to Historic Lows as Efficiency Reaches New Milestones',
      content: 'The renewable energy sector has reached a major milestone as solar panel efficiency hits a record 35% while costs continue to plummet. New perovskite-silicon tandem solar cells have achieved this breakthrough efficiency, nearly double that of conventional panels. Manufacturing improvements and economies of scale have driven down costs by 15% this year alone. Countries worldwide are accelerating their renewable energy adoption, with solar installations expected to triple over the next five years. This development positions solar energy as the most cost-effective power source in most regions globally.',
      summary: 'Solar panel efficiency reaches record 35% while costs drop 15%, accelerating global renewable energy adoption.',
      url: 'https://example.com/solar-energy-milestone',
      source: 'Green Energy Report',
      category: 'environment',
      published_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Lisa Thompson',
      tags: ['solar energy', 'renewable energy', 'climate', 'sustainability']
    },
    {
      id: 'space_001',
      title: 'Mars Mission Discovers Evidence of Ancient Microbial Life',
      content: 'NASA\'s latest Mars rover has made a groundbreaking discovery that could rewrite our understanding of life in the universe. Analysis of rock samples from an ancient riverbed revealed fossilized structures that bear striking similarities to microbial life forms found on Earth. The discovery includes complex organic molecules and mineral patterns that strongly suggest biological activity occurred on Mars billions of years ago. Scientists are calling this the most significant evidence yet for past life on the Red Planet. The findings have major implications for astrobiology and our search for life elsewhere in the universe.',
      summary: 'Mars rover discovers fossilized structures suggesting ancient microbial life existed on the Red Planet billions of years ago.',
      url: 'https://example.com/mars-life-discovery',
      source: 'Space Exploration News',
      category: 'science',
      published_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Dr. James Mitchell',
      tags: ['mars', 'space exploration', 'astrobiology', 'NASA']
    },
    {
      id: 'finance_001',
      title: 'Central Banks Launch Coordinated Digital Currency Initiative',
      content: 'Major central banks worldwide have announced a coordinated initiative to develop interoperable central bank digital currencies (CBDCs). The project, involving the Federal Reserve, European Central Bank, Bank of Japan, and others, aims to create a unified framework for cross-border digital payments. The initiative promises to reduce transaction costs, increase payment speed, and enhance financial inclusion globally. Pilot programs will begin in six months, with full implementation expected within three years. This development represents the most significant evolution in monetary systems since the abandonment of the gold standard.',
      summary: 'Major central banks unite to develop interoperable digital currencies, revolutionizing global payment systems.',
      url: 'https://example.com/cbdc-initiative',
      source: 'Financial Times Global',
      category: 'finance',
      published_date: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      author: 'Robert Kim',
      tags: ['digital currency', 'central banks', 'fintech', 'monetary policy']
    }
  ];

  console.log(`📰 Generated ${sampleArticles.length} sample articles`);
  return sampleArticles;
}

/**
 * Run preprocessing pipeline as child process
 */
function runPreprocessing() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting preprocessing pipeline...');

    const preprocessProcess = spawn('node', ['src/scripts/preprocessData.js'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    preprocessProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(chunk.trim());
    });

    preprocessProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(chunk.trim());
    });

    preprocessProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Preprocessing completed successfully');
        resolve({ success: true, output });
      } else {
        console.error('❌ Preprocessing failed with code:', code);
        reject(new Error(`Preprocessing failed with code ${code}. Error: ${errorOutput}`));
      }
    });

    preprocessProcess.on('error', (error) => {
      console.error('❌ Error running preprocessing:', error);
      reject(error);
    });
  });
}

/**
 * Run embedding pipeline as child process
 */
function runEmbeddingPipeline() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting embedding pipeline...');

    const embeddingProcess = spawn('node', ['run-embeddings.js'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    embeddingProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log(chunk.trim());
    });

    embeddingProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error(chunk.trim());
    });

    embeddingProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Embedding pipeline completed successfully');
        resolve({ success: true, output });
      } else {
        console.error('❌ Embedding pipeline failed with code:', code);
        reject(new Error(`Embedding process failed with code ${code}. Error: ${errorOutput}`));
      }
    });

    embeddingProcess.on('error', (error) => {
      console.error('❌ Error running embedding process:', error);
      reject(error);
    });
  });
}

/**
 * Helper functions for statistics
 */
function getSourceStats(articles) {
  const stats = {};
  articles.forEach(article => {
    const source = article.source || 'Unknown';
    stats[source] = (stats[source] || 0) + 1;
  });
  return stats;
}

function getCategoryStats(articles) {
  const stats = {};
  articles.forEach(article => {
    const category = article.category || 'uncategorized';
    stats[category] = (stats[category] || 0) + 1;
  });
  return stats;
}

export default router;