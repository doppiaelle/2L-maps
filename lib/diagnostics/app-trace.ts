export type TraceLevel = 'debug' | 'info' | 'warn' | 'error';

export interface TraceEvent {
  readonly seq: number;
  readonly timestamp: string;
  readonly level: TraceLevel;
  readonly area: string;
  readonly event: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export type TraceInput = Omit<TraceEvent, 'seq' | 'timestamp' | 'data'> & {
  readonly data?: Readonly<Record<string, unknown>>;
};

const MAX_EVENTS = 350;
const SENSITIVE_KEY = /authorization|access.?token|refresh.?token|jwt|secret|anon.?key|api.?key/i;

let sequence = 0;
let entries: TraceEvent[] = [];
const listeners = new Set<() => void>();

export function trace(input: TraceInput): void {
  const event: TraceEvent = {
    seq: ++sequence,
    timestamp: new Date().toISOString(),
    level: input.level,
    area: input.area,
    event: input.event,
    data: sanitizeRecord(input.data ?? {}),
  };

  entries = [...entries, event].slice(-MAX_EVENTS);
  for (const listener of listeners) listener();
}

export function getAppTraceEntries(): readonly TraceEvent[] {
  return entries;
}

export function clearAppTrace(): void {
  entries = [];
  trace({ level: 'info', area: 'diagnostics', event: 'trace_cleared' });
}

export function subscribeAppTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function formatAppTrace(events: readonly TraceEvent[] = entries): string {
  if (events.length === 0) return 'No trace events yet.';

  return events
    .map((entry) => {
      const payload = Object.keys(entry.data).length === 0 ? '' : ` ${JSON.stringify(entry.data)}`;
      return `${entry.seq.toString().padStart(4, '0')} ${entry.timestamp} ${entry.level.toUpperCase()} ${entry.area}.${entry.event}${payload}`;
    })
    .join('\n');
}

export function shortId(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.length === 0) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function sanitizeRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    cleaned[key] = sanitizeValue(key, item);
  }
  return cleaned;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(key, item));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(record)) {
      cleaned[childKey] = sanitizeValue(childKey, childValue);
    }
    return cleaned;
  }
  return value;
}
