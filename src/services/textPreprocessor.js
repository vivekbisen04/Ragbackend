import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TextPreprocessor {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 800;
    this.chunkOverlap = options.chunkOverlap || 200;
    this.minChunkSize = options.minChunkSize || 100;
    this.preserveParagraphs = options.preserveParagraphs || true;
  }

  async preprocessArticles(articles) {
    console.log(`🔄 Preprocessing ${articles.length} articles...`);
    const processedChunks = [];

    for (const article of articles) {
      try {
        const chunks = await this.chunkArticle(article);
        processedChunks.push(...chunks);
      } catch (error) {
        console.warn(`⚠️ Failed to process article: ${article.title}`);
      }
    }

    console.log(`✅ Created ${processedChunks.length} chunks from ${articles.length} articles`);
    await this.saveProcessedChunks(processedChunks);
    return processedChunks;
  }

  async chunkArticle(article) {
    const chunks = [];
    let chunkId = 0;

    // Clean and normalize text
    const cleanContent = this.cleanText(article.content);
    const cleanTitle = this.cleanText(article.title);
    const cleanSummary = this.cleanText(article.summary || '');

    // Create title chunk (always include)
    if (cleanTitle) {
      chunks.push(this.createChunk({
        chunkId: chunkId++,
        article,
        text: `Title: ${cleanTitle}${cleanSummary ? `\n\nSummary: ${cleanSummary}` : ''}`,
        type: 'title',
        startIndex: 0,
        endIndex: cleanTitle.length + (cleanSummary ? cleanSummary.length + 12 : 0)
      }));
    }

    // Process main content
    if (cleanContent && cleanContent.length > this.minChunkSize) {
      const contentChunks = this.preserveParagraphs
        ? this.chunkByParagraphs(cleanContent)
        : this.chunkBySentences(cleanContent);

      for (const contentChunk of contentChunks) {
        chunks.push(this.createChunk({
          chunkId: chunkId++,
          article,
          text: contentChunk.text,
          type: 'content',
          startIndex: contentChunk.startIndex,
          endIndex: contentChunk.endIndex
        }));
      }
    }

    return chunks;
  }

  chunkByParagraphs(text) {
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
    const chunks = [];
    let currentChunk = '';
    let currentStartIndex = 0;
    let currentEndIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      const potentialChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;

      if (potentialChunk.length <= this.chunkSize || currentChunk === '') {
        currentChunk = potentialChunk;
        currentEndIndex = currentStartIndex + currentChunk.length;
      } else {
        // Save current chunk and start new one
        if (currentChunk.length >= this.minChunkSize) {
          chunks.push({
            text: this.addContext(currentChunk),
            startIndex: currentStartIndex,
            endIndex: currentEndIndex
          });
        }

        // Start new chunk with overlap
        const overlap = this.getOverlapText(currentChunk);
        currentChunk = overlap ? `${overlap}\n\n${paragraph}` : paragraph;
        currentStartIndex = currentEndIndex - (overlap ? overlap.length + 2 : 0);
        currentEndIndex = currentStartIndex + currentChunk.length;
      }
    }

    // Add final chunk
    if (currentChunk.length >= this.minChunkSize) {
      chunks.push({
        text: this.addContext(currentChunk),
        startIndex: currentStartIndex,
        endIndex: currentEndIndex
      });
    }

    return chunks;
  }

  chunkBySentences(text) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
    const chunks = [];
    let currentChunk = '';
    let currentStartIndex = 0;
    let sentenceIndex = 0;

    for (const sentence of sentences) {
      const potentialChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;

      if (potentialChunk.length <= this.chunkSize || currentChunk === '') {
        currentChunk = potentialChunk;
      } else {
        // Save current chunk
        if (currentChunk.length >= this.minChunkSize) {
          chunks.push({
            text: this.addContext(currentChunk),
            startIndex: currentStartIndex,
            endIndex: currentStartIndex + currentChunk.length
          });
        }

        // Start new chunk with overlap
        const overlap = this.getOverlapText(currentChunk);
        currentChunk = overlap ? `${overlap} ${sentence}` : sentence;
        currentStartIndex += (currentChunk.length - (overlap ? overlap.length + 1 : 0));
      }
      sentenceIndex++;
    }

    // Add final chunk
    if (currentChunk.length >= this.minChunkSize) {
      chunks.push({
        text: this.addContext(currentChunk),
        startIndex: currentStartIndex,
        endIndex: currentStartIndex + currentChunk.length
      });
    }

    return chunks;
  }

  getOverlapText(text) {
    if (text.length <= this.chunkOverlap) return text;

    // Try to find a natural break point for overlap
    const overlapText = text.slice(-this.chunkOverlap);
    const sentenceBreak = overlapText.lastIndexOf('. ');

    if (sentenceBreak > this.chunkOverlap / 2) {
      return overlapText.slice(sentenceBreak + 2);
    }

    const wordBreak = overlapText.lastIndexOf(' ');
    if (wordBreak > this.chunkOverlap / 2) {
      return overlapText.slice(wordBreak + 1);
    }

    return overlapText;
  }

  addContext(text) {
    // Add any necessary context or formatting
    return text.trim();
  }

  createChunk({ chunkId, article, text, type, startIndex, endIndex }) {
    return {
      id: `${article.id}_chunk_${chunkId}`,
      articleId: article.id,
      chunkId,
      text,
      type,
      startIndex,
      endIndex,
      wordCount: text.split(/\s+/).length,
      charCount: text.length,
      metadata: {
        title: article.title,
        source: article.source,
        category: article.category,
        publishedDate: article.publishedDate,
        url: article.url,
        scrapedAt: article.scrapedAt
      },
      processedAt: new Date().toISOString()
    };
  }

  cleanText(text) {
    if (!text) return '';

    return text
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters but keep punctuation
      .replace(/[^\w\s.,!?;:()\-"']/g, '')
      // Fix multiple periods
      .replace(/\.{3,}/g, '...')
      // Remove extra spaces around punctuation
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/([.,!?;:])\s+/g, '$1 ')
      // Trim
      .trim();
  }

  async saveProcessedChunks(chunks) {
    try {
      const dataDir = path.join(__dirname, '../../data/processed');
      await fs.mkdir(dataDir, { recursive: true });

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `processed_chunks_${timestamp}.json`;
      const filepath = path.join(dataDir, filename);

      await fs.writeFile(filepath, JSON.stringify(chunks, null, 2));
      console.log(`💾 Processed chunks saved to: ${filepath}`);

      // Also save as latest.json for easy access
      const latestPath = path.join(dataDir, 'latest.json');
      await fs.writeFile(latestPath, JSON.stringify(chunks, null, 2));

      // Save processing statistics
      const stats = this.generateStats(chunks);
      const statsPath = path.join(dataDir, `stats_${timestamp}.json`);
      await fs.writeFile(statsPath, JSON.stringify(stats, null, 2));

      return filepath;
    } catch (error) {
      console.error('❌ Error saving processed chunks:', error.message);
      throw error;
    }
  }

  generateStats(chunks) {
    const stats = {
      totalChunks: chunks.length,
      totalArticles: [...new Set(chunks.map(c => c.articleId))].length,
      chunkTypes: {},
      sources: {},
      categories: {},
      avgChunkSize: 0,
      avgWordCount: 0,
      processedAt: new Date().toISOString()
    };

    let totalChars = 0;
    let totalWords = 0;

    for (const chunk of chunks) {
      // Count by type
      stats.chunkTypes[chunk.type] = (stats.chunkTypes[chunk.type] || 0) + 1;

      // Count by source
      const source = chunk.metadata.source;
      stats.sources[source] = (stats.sources[source] || 0) + 1;

      // Count by category
      const category = chunk.metadata.category;
      stats.categories[category] = (stats.categories[category] || 0) + 1;

      totalChars += chunk.charCount;
      totalWords += chunk.wordCount;
    }

    stats.avgChunkSize = Math.round(totalChars / chunks.length);
    stats.avgWordCount = Math.round(totalWords / chunks.length);

    return stats;
  }

  async loadProcessedChunks() {
    try {
      const filepath = path.join(__dirname, '../../data/processed/latest.json');
      const data = await fs.readFile(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('⚠️ No processed chunks found');
      return [];
    }
  }
}

export default TextPreprocessor;