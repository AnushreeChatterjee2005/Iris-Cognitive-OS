import { pipeline, env } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';

// Disable local models to fetch from HF CDN
env.allowLocalModels = false;

interface VectorRecord {
  id: string;
  filePath: string;
  text: string;
  vector: number[];
}

export class SemanticSearchEngine {
  private static extractor: any = null;
  private static vectors: VectorRecord[] = [];
  private static isInitializing = false;

  static async init() {
    if (this.extractor || this.isInitializing) return;
    this.isInitializing = true;
    console.log('Initializing WebAI Semantic Search Engine...');
    try {
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('Semantic Search Engine Initialized Successfully.');
      
      // Load saved index if it exists
      this.loadIndex();
    } catch (e) {
      console.error('Failed to initialize feature extractor:', e);
    } finally {
      this.isInitializing = false;
    }
  }

  private static getIndexPath() {
    // Save to user data folder or project root
    return path.join(process.cwd(), '.iris_semantic_index.json');
  }

  private static saveIndex() {
    try {
      fs.writeFileSync(this.getIndexPath(), JSON.stringify(this.vectors), 'utf-8');
      console.log(`Saved ${this.vectors.length} vectors to index.`);
    } catch (e) {
      console.error('Failed to save semantic index:', e);
    }
  }

  private static loadIndex() {
    try {
      const p = this.getIndexPath();
      if (fs.existsSync(p)) {
        const data = fs.readFileSync(p, 'utf-8');
        this.vectors = JSON.parse(data);
        console.log(`Loaded ${this.vectors.length} vectors from index.`);
      }
    } catch (e) {
      console.error('Failed to load semantic index:', e);
    }
  }

  static async embedText(text: string): Promise<number[]> {
    if (!this.extractor) await this.init();
    if (!this.extractor) throw new Error("Extractor failed to initialize.");
    
    const result = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
  }

  static async indexDirectory(dirPath: string) {
    console.log(`Starting indexing for directory: ${dirPath}`);
    const files = this.getAllFiles(dirPath);
    console.log(`Found ${files.length} files to scan.`);
    
    let indexedFilesCount = 0;
    
    for (const file of files) {
      try {
        const ext = path.extname(file).toLowerCase();
        if (!['.md', '.txt', '.ts', '.tsx', '.js', '.json', '.css', '.html'].includes(ext)) {
          continue; // Skip unsupported files
        }
        
        // Skip node_modules, dist, etc
        if (file.includes('node_modules') || file.includes('dist') || file.includes('.git') || file.includes('dist-electron')) {
          continue;
        }

        const content = fs.readFileSync(file, 'utf-8');
        if (!content.trim()) continue;

        // Simple chunking strategy (split by double newlines or max 500 chars)
        const chunks = this.chunkText(content, 500);
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const vector = await this.embedText(chunk);
          
          this.vectors.push({
            id: `${file}-${i}`,
            filePath: file,
            text: chunk,
            vector
          });
        }
        indexedFilesCount++;
      } catch (e) {
        console.error(`Error indexing file ${file}:`, e);
      }
    }
    
    this.saveIndex();
    console.log('Indexing complete.');
    return { status: 'success', indexedFiles: indexedFilesCount, totalChunks: this.vectors.length };
  }

  static async search(query: string, topK: number = 5) {
    if (!this.extractor) await this.init();
    if (this.vectors.length === 0) {
      return [{ filePath: 'System', text: 'Index is empty. Please run indexing first.', score: 0 }];
    }

    const queryVector = await this.embedText(query);
    
    // Calculate cosine similarity
    const results = this.vectors.map(v => {
      const score = this.cosineSimilarity(queryVector, v.vector);
      return { ...v, score };
    });

    // Sort descending
    results.sort((a, b) => b.score - a.score);
    
    // Return top unique files
    const uniqueFiles = new Set<string>();
    const topResults = [];
    
    for (const r of results) {
      if (uniqueFiles.has(r.filePath)) continue;
      
      uniqueFiles.add(r.filePath);
      topResults.push({
        filePath: r.filePath,
        text: r.text,
        score: r.score
      });
      
      if (topResults.length >= topK) break;
    }
    
    return topResults;
  }

  private static getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'dist-electron') {
            arrayOfFiles = this.getAllFiles(fullPath, arrayOfFiles);
          }
        } else {
          arrayOfFiles.push(fullPath);
        }
      } catch (e) {
        // Skip files that can't be stat'd
      }
    });
    return arrayOfFiles;
  }

  private static chunkText(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    const lines = text.split('\n');
    
    for (const line of lines) {
      if ((currentChunk + '\n' + line).length > maxLen) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
  }

  private static cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
