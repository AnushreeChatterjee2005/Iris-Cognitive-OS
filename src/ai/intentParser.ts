import { pipeline, env } from '@xenova/transformers';

// In the browser, we use remote models (from HuggingFace CDN)
// and it automatically uses the WASM backend, avoiding any Node.js native binding crashes!
env.allowLocalModels = false;

export class IntentParser {
  private static classifier: any = null;
  private static isInitializing: boolean = false;
  private static lastError: string = '';

  static async init() {
    if (this.classifier) return;
    if (this.isInitializing) return;
    
    this.isInitializing = true;
    console.log('Initializing WebAI Intent Parser...');
    try {
      this.classifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');
      console.log('WebAI Intent Parser Initialized Successfully.');
    } catch (e: any) {
      this.lastError = e.message || String(e);
      console.error('Failed to initialize AI:', e);
    } finally {
      this.isInitializing = false;
    }
  }

  static async parseIntent(text: string) {
    if (!this.classifier) await this.init();
    if (!this.classifier) return { module: `Error: ${this.lastError}`, confidence: 0, text };

    console.log(`Parsing intent: "${text}"`);
    
    const candidateLabels = [
      'find a file or search for a document', 
      'manage windows or split screen layout', 
      'automate a task or extract text', 
      'configure settings or system shell'
    ];
    
    // Perform zero-shot classification via WebAssembly
    const result = await this.classifier(text, candidateLabels);
    
    const topLabel = result.labels[0];
    const confidence = result.scores[0];

    let module = 'Unknown';
    if (topLabel.includes('file')) module = 'FileSystem';
    else if (topLabel.includes('windows')) module = 'WindowManager';
    else if (topLabel.includes('automate')) module = 'Automation';
    else if (topLabel.includes('settings')) module = 'Shell';

    console.log(`Intent parsed -> Module: ${module} (Confidence: ${(confidence * 100).toFixed(2)}%)`);
    return { module, confidence, text };
  }
}
