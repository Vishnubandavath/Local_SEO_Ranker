/**
 * Robust Caching with Observability
 *
 * L1: In-memory Map with Adaptive TTL
 * L2: MongoDB Report reuse
 */

import crypto from 'crypto';

// ─────────────────────────────────────────────
// Observability: Cache Metrics
// ─────────────────────────────────────────────

interface CacheMetrics {
  hits: number;
  misses: number;
  canonicalHits: number;
}

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  canonicalHits: 0,
};

export function getCacheMetrics(): CacheMetrics {
  return { ...metrics };
}

// ─────────────────────────────────────────────
// Cache Key Strategy
// ─────────────────────────────────────────────

/**
 * Generates a deterministic base key from keyword + location.
 */
export function makeCacheKey(keyword: string, location: string): string {
  const normalized = `${keyword.toLowerCase().trim().replace(/\s+/g, ' ')}::${location.toLowerCase().trim().replace(/\s+/g, ' ')}`;
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Generates a canonical SERP key. Maps variants to a single representation.
 * E.g., "plumbers austin" and "plumber in austin tx" should share SERP results.
 */
export function makeCanonicalSerpKey(keyword: string, location: string): string {
  let kw = keyword.toLowerCase().trim();
  // Strip common noisy intent modifiers from the SERP cache key to maximize cross-user hit rate
  kw = kw.replace(/^(best|top|affordable|cheap|local)\s+/i, '');
  kw = kw.replace(/\s+(near me|nearby|in my area)$/i, '');
  kw = kw.replace(/\s+/g, ' ').trim();
  
  const loc = location.toLowerCase().trim().replace(/\b(in|tx|ca|ny|fl|wa|il|pa|oh|ga|nc|mi)\b/g, '').replace(/\s+/g, '').trim();
  
  return crypto.createHash('sha256').update(`${kw}::${loc}`).digest('hex').slice(0, 16);
}

/**
 * Generates an LLM-cache key that includes a signature of the current features.
 */
export function makeLlmCacheKey(
  keyword: string,
  location: string,
  ranking: number,
  seoScore: number
): string {
  const base = makeCacheKey(keyword, location);
  const contextHash = crypto
    .createHash('md5')
    .update(`${ranking}:${seoScore}`)
    .digest('hex')
    .slice(0, 8);
  return `${base}:llm:${contextHash}`;
}

// ─────────────────────────────────────────────
// L1: In-Memory Adaptive Cache
// ─────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor() {
    // Periodic cleanup
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
        }
      }
    }, 10 * 60 * 1000);
  }

  get(key: string, isCanonical: boolean = false): T | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) this.store.delete(key);
      metrics.misses++;
      return null;
    }
    metrics.hits++;
    if (isCanonical) metrics.canonicalHits++;
    return entry.data;
  }

  /**
   * Set with an adaptive TTL explicitly provided per call
   * @param key cache key
   * @param data payload
   * @param ttlSeconds Expiration (e.g., 3600 for high-intent/volatile, 21600 for stable)
   */
  set(key: string, data: T, ttlSeconds: number): void {
    const ttlMs = ttlSeconds * 1000;
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  has(key: string): boolean {
    return this.store.has(key) && Date.now() <= this.store.get(key)!.expiresAt;
  }
}

// ─────────────────────────────────────────────
// Cached Data Shapes
// ─────────────────────────────────────────────

export interface CachedSerpData {
  organicResults: any[];
  localResults: any[];
  totalOrganicResults: number;
  trueSearchVolume: number;
  timestamp: number;
}

export interface CachedLlmData {
  insights: string;
}

export const serpCache = new MemoryCache<CachedSerpData>();
export const llmCache = new MemoryCache<CachedLlmData>();

// ─────────────────────────────────────────────
// L2: MongoDB Report Reuse
// ─────────────────────────────────────────────

export async function findCachedReport(
  ReportModel: any,
  keyword: string,
  location: string,
  businessName?: string,
  website?: string,
  maxAgeMs: number = 3 * 60 * 60 * 1000
): Promise<any | null> {
  try {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const query: any = {
      keyword: { $regex: new RegExp(`^${escapeRegex(keyword.trim())}$`, 'i') },
      location: { $regex: new RegExp(`^${escapeRegex(location.trim())}$`, 'i') },
      createdAt: { $gte: cutoff },
    };

    const conditions = [];

    if (businessName) {
      conditions.push({ businessName: { $regex: new RegExp(`^${escapeRegex(businessName.trim())}$`, 'i') } });
    } else {
      conditions.push({ $or: [{ businessName: { $exists: false } }, { businessName: "" }, { businessName: null }] });
    }

    if (website) {
      conditions.push({ website: { $regex: new RegExp(`^${escapeRegex(website.trim())}$`, 'i') } });
    } else {
      conditions.push({ $or: [{ website: { $exists: false } }, { website: "" }, { website: null }] });
    }

    if (conditions.length > 0) {
      query.$and = conditions;
    }

    const report = await ReportModel.findOne(query)
      .sort({ createdAt: -1 })
      .lean();

    return report || null;
  } catch (err) {
    console.error('[Cache] MongoDB lookup error:', err);
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
