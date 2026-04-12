/**
 * SEO Analysis Utilities
 *
 * Contains production-grade logic for:
 * 1. Normalized SEO scoring (weighted, continuous)
 * 2. Domain normalization & entity matching
 * 3. SERP noise filtering (directory/aggregator detection)
 */

// ─────────────────────────────────────────────
// 1. SEO SCORING — Normalized Weighted Formula
// ─────────────────────────────────────────────

/**
 * Weight distribution across scoring factors (must sum to 1.0):
 *
 *   Ranking Position  → 0.45  (primary signal, continuous decay)
 *   Map Pack Presence → 0.25  (binary but high-impact for local SEO)
 *   Competition Depth → 0.15  (how saturated the SERP is)
 *   Keyword Difficulty → 0.15  (proxy: ratio of directories in top 10)
 *
 * Each factor produces a normalized 0–1 signal, then final = Σ(weight × signal) × 100
 */

const SCORE_WEIGHTS = {
  ranking: 0.45,
  mapPack: 0.25,
  competition: 0.15,
  difficulty: 0.15,
} as const;

export interface SeoScoreInput {
  ranking: number;
  foundInLocalPack: boolean;
  strongCompetitorCount: number;
  directoryRatio: number;
  avgCompetitorStrength: number;
}

export function calculateSeoScore(input: SeoScoreInput): number {
  const {
    ranking,
    foundInLocalPack,
    strongCompetitorCount,
    directoryRatio,
    avgCompetitorStrength
  } = input;

  // Task 2: Smoother Ranking Signal
  let rankScore = 0;
  if (ranking > 0) {
    rankScore = 1 / (1 + 0.05 * (ranking - 1));
  }

  // Task 3: Competition Signal (# strong competitors in top 10 / 10)
  const competition = Math.min(strongCompetitorCount, 10) / 10;

  // Task 4: Difficulty Signal (Directory Ratio + Avg Strength)
  const difficulty = 0.5 * directoryRatio + 0.5 * avgCompetitorStrength;

  const mapPresence = foundInLocalPack ? 1.0 : 0.0;

  // Task 5: Final Visibility Score
  const rawScore =
    0.45 * rankScore +
    0.25 * mapPresence +
    0.15 * (1 - competition) +
    0.15 * (1 - difficulty);

  return Math.round(Math.min(100, Math.max(0, rawScore * 100)));
}

// ─────────────────────────────────────────────
// 2. ENTITY MATCHING — Domain + Fuzzy Name
// ─────────────────────────────────────────────

/**
 * Extracts a comparable root domain from a URL or domain string.
 *
 * "https://www.sub.joesplumbing.com/page?q=1" → "joesplumbing.com"
 * "joesplumbing.com" → "joesplumbing.com"
 * "" / undefined → ""
 */
export function normalizeDomain(input: string | undefined | null): string {
  if (!input) return '';

  let domain = input.trim().toLowerCase();

  // Strip protocol
  domain = domain.replace(/^https?:\/\//, '');
  // Strip path, query, hash
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  // Strip port
  domain = domain.split(':')[0];
  // Strip www and any leading subdomains — keep last 2 segments (or 3 for co.uk etc.)
  const parts = domain.split('.');

  // Handle compound TLDs (co.uk, com.au, co.in, etc.)
  const compoundTlds = new Set([
    'co.uk', 'co.in', 'com.au', 'co.nz', 'co.za', 'com.br',
    'co.jp', 'co.kr', 'com.mx', 'com.sg', 'com.my',
  ]);

  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (compoundTlds.has(lastTwo)) {
      // e.g. www.shop.example.co.uk → example.co.uk
      return parts.slice(-3).join('.');
    }
  }

  // Standard: www.sub.example.com → example.com
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }

  return domain;
}

/**
 * Computes a simple token-overlap similarity score between two strings.
 * Returns a value between 0 and 1.
 *
 * "Joe's Plumbing Austin" vs "Joe's Plumbing" → ~0.67
 */
function tokenSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[''`]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
  const tokensA = new Set(normalize(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalize(b).split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  // Jaccard similarity
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Known directory / aggregator domains that should NEVER match
 * as the user's own business, even if their name appears in the title.
 */
const DIRECTORY_DOMAINS = new Set([
  'yelp.com', 'justdial.com', 'practo.com', 'sulekha.com',
  'yellowpages.com', 'bbb.org', 'manta.com', 'angi.com',
  'thumbtack.com', 'homeadvisor.com', 'angieslist.com',
  'tripadvisor.com', 'glassdoor.com', 'indeed.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'pinterest.com', 'tiktok.com',
  'mapquest.com', 'foursquare.com', 'citysearch.com',
  'superpages.com', 'whitepages.com', 'brownbook.net',
  'hotfrog.com', 'spoke.com', 'merchantcircle.com',
  'crunchbase.com', 'zaubacorp.com', 'indiamart.com',
  'tradeindia.com', 'grotal.com', 'fundoodata.com',
  'reddit.com', 'quora.com', 'wikipedia.org',
  'youtube.com', 'amazon.com', 'flipkart.com',
  'naukri.com', 'shine.com', 'monsterindia.com',
]);

interface SerpResult {
  title: string;
  link: string;
  snippet?: string;
  position: number;
  website?: string; // present in local_results
}

interface MatchResult {
  found: boolean;
  position: number;
  matchType: 'domain' | 'fuzzy_name' | 'none';
  confidence: number;
}

/**
 * Finds the best match for the user's business in a list of SERP results.
 *
 * Strategy (in priority order):
 *   1. Exact root-domain match on `link` (confidence 1.0)
 *   2. Fuzzy token-overlap match on `title` vs businessName (confidence = similarity)
 *      — only if similarity ≥ 0.5 AND the result is NOT a directory domain
 *   3. No match → { found: false }
 *
 * Returns the BEST match (highest confidence), not the first.
 */
export function findBusinessInResults(
  results: SerpResult[],
  businessName: string | undefined,
  website: string | undefined
): MatchResult {
  const userDomain = normalizeDomain(website);

  let bestMatch: MatchResult = {
    found: false,
    position: 0,
    matchType: 'none',
    confidence: 0,
  };

  for (const result of results) {
    const resultDomain = normalizeDomain(result.link);

    // Priority 1: Exact domain match
    if (userDomain && resultDomain && userDomain === resultDomain) {
      // Domain match is always highest confidence — return immediately
      return {
        found: true,
        position: result.position,
        matchType: 'domain',
        confidence: 1.0,
      };
    }

    // Priority 2: Fuzzy name match (only if no website provided, to avoid false positives)
    if (!userDomain && businessName && result.title) {
      // Skip directory domains — they often contain business names in titles
      if (DIRECTORY_DOMAINS.has(resultDomain)) continue;

      const similarity = tokenSimilarity(businessName, result.title);
      if (similarity >= 0.5 && similarity > bestMatch.confidence) {
        bestMatch = {
          found: true,
          position: result.position,
          matchType: 'fuzzy_name',
          confidence: similarity,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Checks if a business appears in the Google Local Map Pack results.
 * Uses the same domain + fuzzy matching strategy as organic results,
 * but also checks the `website` field that local results provide.
 */
export function findBusinessInLocalPack(
  localResults: any[],
  businessName: string | undefined,
  website: string | undefined
): boolean {
  const userDomain = normalizeDomain(website);

  for (const result of localResults) {
    // Check domain match against the local result's website field
    if (userDomain) {
      const localDomain = normalizeDomain(result.website);
      if (localDomain && userDomain === localDomain) return true;
    }

    // Check name match
    if (businessName && result.title) {
      const similarity = tokenSimilarity(businessName, result.title);
      if (similarity >= 0.5) return true;
    }
  }

  return false;
}

// ─────────────────────────────────────────────
// 3. SERP NOISE FILTERING
// ─────────────────────────────────────────────

/**
 * Extended list of directory / aggregator / social media domains
 * that should be deprioritized in competitor extraction.
 */
const DIRECTORY_DOMAIN_SET = DIRECTORY_DOMAINS;

/**
 * Classifies whether a URL belongs to a known directory or aggregator site.
 */
export function isDirectoryDomain(url: string): boolean {
  const domain = normalizeDomain(url);
  return DIRECTORY_DOMAIN_SET.has(domain);
}

export interface CompetitorResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  isDirectory: boolean;
  competitorScore: number;
  rankReasons: string[];
  dominanceScore?: number;
  marketShare?: number;
  frequency?: number;
  category?: string;
}

// ── Competitor Scoring Weights ──
const COMPETITOR_WEIGHTS = {
  serpPosition: 0.30,
  keywordRelevance: 0.30,
  snippetQuality: 0.25,
  domainType: 0.15,
} as const;

/**
 * Scores a single competitor on a 0–100 scale and generates
 * deterministic "why they rank" explanations.
 *
 * Factors:
 *   - SERP Position (40%): exponential decay, position 1 = 1.0
 *   - Keyword Relevance (25%): token overlap between keyword and title
 *   - Snippet Quality (20%): length + keyword presence in snippet
 *   - Domain Type (15%): real business = 1.0, directory = 0.3
 */
function scoreCompetitor(
  result: { title: string; link: string; snippet: string; position: number },
  keyword: string,
  isDir: boolean
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const kwTokens = keyword.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const titleLower = result.title.toLowerCase();
  const snippetLower = (result.snippet || '').toLowerCase();

  // Factor 1: SERP position (bounded logarithmic decay)
  // position 1 -> 1.0, position 100 -> ~0.0
  const posSignal = Math.max(0, 1 - Math.log(result.position) / Math.log(100));
  if (result.position <= 3) reasons.push('Top 3 ranking position');
  else if (result.position <= 10) reasons.push(`Strong page 1 position (#${result.position})`);

  // Factor 2: Keyword relevance in title
  const matchedKw = kwTokens.filter(t => titleLower.includes(t));
  const kwSignal = kwTokens.length > 0 ? matchedKw.length / kwTokens.length : 0;
  if (kwSignal >= 1.0) reasons.push('Exact keyword match in title');
  else if (kwSignal >= 0.5) reasons.push('Partial keyword match in title');

  // Factor 3: Snippet quality
  const snippetLength = result.snippet?.length || 0;
  const snippetLengthSignal = Math.min(1, snippetLength / 200); // 200 chars = full score
  const snippetKwMatch = kwTokens.some(t => snippetLower.includes(t)) ? 1 : 0;
  const snippetSignal = snippetLengthSignal * 0.5 + snippetKwMatch * 0.5;
  if (snippetKwMatch) reasons.push('Keyword present in meta description');
  if (snippetLength > 150) reasons.push('Rich snippet content');

  // Factor 4: Domain type
  const domainSignal = isDir ? 0.3 : 1.0;
  if (!isDir) reasons.push('Dedicated business website');
  else reasons.push('Listed on directory/aggregator');

  // Check for local intent signals
  const localSignals = ['near', 'local', 'city', 'area', 'serving', 'service'];
  if (localSignals.some(s => titleLower.includes(s) || snippetLower.includes(s))) {
    reasons.push('Strong local intent signal');
  }

  // Weighted sum → 0–100
  const raw =
    COMPETITOR_WEIGHTS.serpPosition * posSignal +
    COMPETITOR_WEIGHTS.keywordRelevance * kwSignal +
    COMPETITOR_WEIGHTS.snippetQuality * snippetSignal +
    COMPETITOR_WEIGHTS.domainType * domainSignal;

  return {
    score: Math.round(Math.min(100, Math.max(0, raw * 100))),
    reasons,
  };
}

/**
 * Normalizes a SERP title to extract the clean brand/business name.
 * Removes pricing, geographical noise, SEO pipelines, and generic phrases.
 */
function cleanTitle(title: string): string {
  let cleaned = title.trim();
  // Remove common SEO separators and tail text
  cleaned = cleaned.split(/\s[|—\-:]\s/)[0];
  cleaned = cleaned.split(/,\s(?:Inc|LLC|Ltd|Co)/i)[0];
  // Remove pricing or action verbs
  cleaned = cleaned.replace(/^(Best|Top|Affordable|Expert|Local|Hire)\s+/i, '');
  cleaned = cleaned.replace(/\s+\(?[\$£€]\d+.*$/i, '');
  // Remove trailing location modifiers
  cleaned = cleaned.replace(/\s+(in|near|around)\s+[A-Z][a-z]+.*$/i, '');
  return cleaned.trim() || title.trim();
}

/**
 * Determines whether the domain is an ecommerce marketplace.
 */
const MARKETPLACE_DOMAINS = new Set([
  'amazon.com', 'amazon.ca', 'amazon.co.uk', 'amazon.in',
  'flipkart.com', 'etsy.com', 'ebay.com', 'ebay.co.uk',
  'walmart.com', 'target.com', 'homedepot.com', 'lowes.com',
  'indiamart.com', 'tradeindia.com', 'aliexpress.com'
]);

type EntityCategory = 'local_business' | 'marketplace' | 'directory';

function classifyEntity(domain: string): EntityCategory {
  if (MARKETPLACE_DOMAINS.has(domain)) return 'marketplace';
  if (DIRECTORY_DOMAIN_SET.has(domain)) return 'directory';
  return 'local_business';
}

/**
 * Extracts the real brand name from a SERP title.
 * Handles patterns like "Keyword - Brand" or "Brand | Keyword".
 * Fallbacks to domain parsing if no clear separator exists.
 */
function extractBrandName(title: string, domain: string): string {
  const parts = title.split(/\s*[-|—–:•]\s*/);
  
  if (parts.length > 1) {
    const domainPrefix = domain.split('.')[0].toLowerCase();
    
    // Strategy 1: Does any part perfectly match the domain name?
    for (const part of parts) {
      if (part.toLowerCase().replace(/[^a-z0-9]/g, '').includes(domainPrefix)) {
        return part.trim();
      }
    }
    
    // Strategy 2: Grab the shortest part (brands are usually shorter than SEO keyword stuffed titles)
    const validParts = parts.filter(p => p.length < 30 && p.length > 2);
    if (validParts.length > 0) {
      return validParts.sort((a,b) => a.length - b.length)[0].trim();
    }
  }

  // Fallback Strategy: Title-cased domain root
  const domainPrefix = domain.split('.')[0];
  if (domainPrefix && domainPrefix.length > 2) {
    return domainPrefix.charAt(0).toUpperCase() + domainPrefix.slice(1);
  }
  
  return title.split(' ')[0] || domain;
}

/**
 * Checks if a brand name is just generic SEO stuffing
 * (e.g., "Bike Rentals Hyderabad", "Affordable Plumber Near Me").
 */
function isGenericBrand(brand: string, keyword: string): boolean {
  const bLower = brand.toLowerCase();
  const kLower = keyword.toLowerCase();
  
  // Exact or near-exact match to keyword without a unique identifier
  if (bLower === kLower || bLower.includes(`${kLower} near me`)) return true;
  
  // Contains heavy SEO spam phrasing
  if (/\b(services|rentals|experts|best|top|affordable|cheap|guide|cost|how to|near me)\b/i.test(bLower)) {
    // If it's a multi-word phrase with generic terms, it's not a real brand
    const wordCount = bLower.split(/\s+/).length;
    if (wordCount >= 3) return true;
  }
  
  // Extreme domain hyphens usually indicate generic lead gen
  if ((brand.match(/-/g) || []).length > 2) return true;

  return false;
}

/**
 * Filters, scores, dedupes, and ranks SERP results for competitor extraction.
 *
 * Strategy:
 *   1. Extract raw Brand Name to use as the Entity Deduplication Key.
 *   2. Filter out generic SEO pages and keyword stuffing.
 *   3. Classify into Local Business, Marketplace, or Directory.
 *   4. Score each entity.
 *   5. Enforce Diversity: Max 1 Directory, Max 1 Marketplace, Rest Local.
 *   6. Output exactly 5 distinct entities if possible.
 */
export function extractCompetitors(
  organicResults: any[],
  keyword: string = ''
): CompetitorResult[] {
  const entityMap = new Map<string, CompetitorResult & { category: EntityCategory }>();

  for (const result of organicResults) {
    const rawDomain = result.link ? normalizeDomain(result.link) : '';
    if (!rawDomain) continue;

    // 1. Extract Brand
    const brandName = extractBrandName(result.title || '', rawDomain);
    
    // 2. Reject Generics
    if (isGenericBrand(brandName, keyword)) continue;

    // 3. Classify
    const category = classifyEntity(rawDomain);
    const isDirOrMarketplace = category !== 'local_business';
    
    // Clean original title for display purposes
    const cleanedTitle = cleanTitle(result.title || '');
    
    // 4. Score
    const { score, reasons } = scoreCompetitor(result, keyword, isDirOrMarketplace);

    const competitor = {
      title: cleanedTitle, // Use cleaned title for final UX
      link: result.link || '',
      snippet: result.snippet || '',
      position: result.position || 0,
      isDirectory: isDirOrMarketplace,
      competitorScore: score,
      rankReasons: reasons,
      category
    };

    // 5. Entity Clustering (Deduplicate by Brand Name)
    const entityKey = brandName.toLowerCase();
    
    if (entityMap.has(entityKey)) {
      // Keep the URL/page that ranks highest
      if (score > entityMap.get(entityKey)!.competitorScore) {
        entityMap.set(entityKey, competitor);
      }
    } else {
      entityMap.set(entityKey, competitor);
    }
  }

  // 6. Diversity Enforcement
  const allEntities = Array.from(entityMap.values());
  
  const marketplaces = allEntities.filter(c => c.category === 'marketplace').sort((a,b) => b.competitorScore - a.competitorScore);
  const directories = allEntities.filter(c => c.category === 'directory').sort((a,b) => b.competitorScore - a.competitorScore);
  const locals = allEntities.filter(c => c.category === 'local_business').sort((a,b) => b.competitorScore - a.competitorScore);

  const finalOutput: CompetitorResult[] = [];
  
  // Max 1 Marketplace, Max 1 Directory
  if (marketplaces.length > 0) finalOutput.push(marketplaces.shift()!);
  if (directories.length > 0) finalOutput.push(directories.shift()!);
  
  // Backfill with local businesses
  while (finalOutput.length < 5 && locals.length > 0) {
    finalOutput.push(locals.shift()!);
  }
  
  // If we still don't have 5, reluctantly backfill with remaining directories/marketplaces
  while (finalOutput.length < 5 && directories.length > 0) {
    finalOutput.push(directories.shift()!);
  }
  while (finalOutput.length < 5 && marketplaces.length > 0) {
    finalOutput.push(marketplaces.shift()!);
  }

  // Clean wrapper types and final resort
  return finalOutput.map(c => {
    const { category, ...rest } = c;
    return rest;
  }).sort((a, b) => b.competitorScore - a.competitorScore);
}

/**
 * Counts how many of the top N organic results are directory/aggregator domains.
 * Used as a keyword-difficulty proxy in the SEO score.
 */
export function countDirectoriesInTopN(organicResults: any[], n: number = 10): number {
  let count = 0;
  const limit = Math.min(n, organicResults.length);
  for (let i = 0; i < limit; i++) {
    if (isDirectoryDomain(organicResults[i]?.link || '')) {
      count++;
    }
  }
  return count;
}

// ─────────────────────────────────────────────
// 4. FEATURE ENGINEERING LAYER
// ─────────────────────────────────────────────

export interface SearchFeatures {
  rankBucket: 'top3' | 'top10' | 'page2' | 'buried' | 'none';
  inMapPack: boolean;
  competitorDensity: number;
  directoryDensity: number;
  localIntentSignal: number;
}

/**
 * Extracts normalized ML-ready features from raw SERP data.
 */
export function extractFeatures(
  ranking: number,
  foundInLocalPack: boolean,
  organicResults: any[],
  keyword: string
): SearchFeatures {
  let rankBucket: SearchFeatures['rankBucket'] = 'none';
  if (ranking > 0) {
    if (ranking <= 3) rankBucket = 'top3';
    else if (ranking <= 10) rankBucket = 'top10';
    else if (ranking <= 20) rankBucket = 'page2';
    else rankBucket = 'buried';
  }

  const directoryDensity = Math.min(1.0, countDirectoriesInTopN(organicResults, 10) / 10);
  const competitorDensity = 1.0 - directoryDensity;

  const kwLower = keyword.toLowerCase();
  const hasLocalIntent = /\b(near me|in|area|city)\b/.test(kwLower) ? 1.0 : 0.0;

  return {
    rankBucket,
    inMapPack: foundInLocalPack,
    competitorDensity,
    directoryDensity,
    localIntentSignal: hasLocalIntent,
  };
}

export function calculateCustomerLoss(rank: number, keyword: string, baseTraffic: number) {
  const ctrMap = [0.28, 0.15, 0.10, 0.07, 0.05, 0.04, 0.03, 0.02, 0.01, 0.01];
  const ctrRank1 = 0.28;
  const ctrCurrent = (rank > 0 && rank <= 10) ? ctrMap[rank - 1] : 0;
  
  const kwLower = keyword.toLowerCase();
  let intentWeight = 0.7; // generic
  if (/\b(near me|nearby)\b/.test(kwLower)) {
    intentWeight = 1.2;
  } else if (/\b(in |area|city)\b/.test(kwLower) || kwLower.split(' ').length > 2) {
    intentWeight = 1.0;
  }

  const estimatedSearchVolume = baseTraffic > 0 ? baseTraffic : 1200;

  const potentialTraffic = ctrRank1 * intentWeight * estimatedSearchVolume;
  const actualTraffic = ctrCurrent * intentWeight * estimatedSearchVolume;
  
  const loss = Math.max(0, potentialTraffic - actualTraffic);
  const lossPercent = Math.round((ctrRank1 - ctrCurrent) / ctrRank1 * 100);
  
  return {
    potentialTraffic,
    actualTraffic,
    lossPercent: Math.max(0, lossPercent),
    estimatedLostCustomers: Math.round(loss)
  };
}

export interface DominanceData {
  topDominantName: string;
  message: string;
}

export function enrichCompetitorsWithDominance(
  competitors: CompetitorResult[],
  allOrganicResults: any[][],
  localResults: any[]
): { enriched: CompetitorResult[], dominance: DominanceData } {
  let totalDominance = 0;

  // Pre-calculate maxRep once
  let maxRep = 1;
  for (const r of localResults) {
    if (r.rating && r.reviews) {
      const score = Math.pow(r.rating, 2) * Math.log(1 + r.reviews);
      if (score > maxRep) maxRep = score;
    }
  }

  const enriched = competitors.map(comp => {
    const rankingScore = comp.position > 0 ? (1 / comp.position) * 100 : 0;
    
    let reviewStrength = 0;
    const compDomain = comp.link ? normalizeDomain(comp.link) : '';
    const compLocal = localResults.find((r: any) => 
      (r.website && normalizeDomain(r.website) === compDomain) ||
      (r.title && r.title.toLowerCase().includes(comp.title.toLowerCase()))
    );
    if (compLocal) {
      const rawRep = Math.pow(compLocal.rating || 0, 2) * Math.log(1 + (compLocal.reviews || 0));
      reviewStrength = Math.min(100, (rawRep / maxRep) * 100);
    }

    const keywordMatch = comp.competitorScore;

    let frequency = 0;
    for (const resList of allOrganicResults) {
      const found = resList.some((r: any) => {
        const d = r.link ? normalizeDomain(r.link) : '';
        return d && d === compDomain;
      });
      if (found) frequency++;
    }
    const presenceAcrossQueries = allOrganicResults.length > 0 ? (frequency / allOrganicResults.length) * 100 : 100;

    const dominanceScore = Math.round(
      0.4 * rankingScore + 
      0.25 * reviewStrength + 
      0.2 * presenceAcrossQueries + 
      0.15 * keywordMatch
    );

    totalDominance += dominanceScore;

    return { ...comp, dominanceScore, frequency };
  });

  const finalEnriched = enriched.map(c => {
    return {
      ...c,
      marketShare: totalDominance > 0 ? Math.round((c.dominanceScore! / totalDominance) * 100) : 0
    };
  }).sort((a,b) => b.dominanceScore! - a.dominanceScore!);

  let dominance = { topDominantName: '', message: '' };
  if (finalEnriched.length > 0) {
    const top = finalEnriched[0];
    dominance.topDominantName = top.title;
    dominance.message = `${top.title} dominates this market. Appears in ${top.frequency}/${allOrganicResults.length || 1} queries with highest dominance.`;
  }

  return { enriched: finalEnriched, dominance };
}
