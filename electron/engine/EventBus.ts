import { EventEmitter } from 'events';
import { ActivityEvent, CollectorSource, EventType } from '../../shared/types';

// =============================================================================
// IRIS Internal Event Bus
// =============================================================================
// Loose-coupling mechanism between collectors and the rest of the engine.
// Collectors emit events here; the ActivityEngine subscribes to persist + relay.
// =============================================================================

type EventBusListener = (event: ActivityEvent) => void;

export class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(50); // Allow many future collectors/consumers
  }

  /** Singleton — one bus for the lifetime of the app */
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /** Emit an activity event to all subscribers */
  publish(event: ActivityEvent): void {
    this.emit('activity', event);
    this.emit(`activity:${event.source}`, event);    // per-source channel
    this.emit(`activity:${event.type}`, event);      // per-type channel
  }

  /** Subscribe to ALL activity events */
  onActivity(listener: EventBusListener): void {
    this.on('activity', listener);
  }

  /** Subscribe to events from a specific source */
  onSource(source: CollectorSource, listener: EventBusListener): void {
    this.on(`activity:${source}`, listener);
  }

  /** Subscribe to a specific event type */
  onEventType(type: EventType, listener: EventBusListener): void {
    this.on(`activity:${type}`, listener);
  }

  /** Remove a listener from the main activity channel */
  offActivity(listener: EventBusListener): void {
    this.off('activity', listener);
  }
}
