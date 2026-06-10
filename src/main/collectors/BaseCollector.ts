import { CollectorCapabilities, CollectorSource } from '../../shared/types';
import { EventBus } from '../engine/EventBus';

export abstract class BaseCollector {
  protected bus: EventBus;
  protected isRunning: boolean = false;

  constructor() {
    this.bus = EventBus.getInstance();
  }

  abstract get capabilities(): CollectorCapabilities;
  
  abstract start(): Promise<void>;
  
  async stop(): Promise<void> {
    this.isRunning = false;
  }

  get source(): CollectorSource {
    return this.capabilities.source;
  }
}
