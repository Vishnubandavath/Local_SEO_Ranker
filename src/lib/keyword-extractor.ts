/**
 * Hybrid Keyword Engine & Deterministic Insights
 *
 * Replaces LLM-based keyword generation with a frequency-analysis + template expansion approach.
 * Extracts keyword ideas from competitor titles and snippets, classifies their intent,
 * and merges them with localized templates for maximum long-tail coverage.
 */

// ─────────────────────────────────────────────
// Stop Words
// ─────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
  'it', 'its', 'i', 'we', 'you', 'he', 'she', 'they', 'me', 'us',
  'not', 'no', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'also',
  'all', 'each', 'every', 'any', 'some', 'more', 'most', 'other', 'about',
  'how', 'what', 'when', 'where', 'who', 'which', 'why', 'as', 'into',
  'www', 'com', 'http', 'https', 'org', 'net', 'html', 'php', 'top', 
  // 'best', 'review', 'affordable', 'cheap' are left in as intent signals!
]);

// ─────────────────────────────────────────────
// Token Utilities
// ─────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

function extractNgrams(tokens: string[], maxN: number = 3): string[] {
  const ngrams: string[] = [];
  for (let n = 2; n <= maxN; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(' '));
    }
  }
  return ngrams;
}

// ─────────────────────────────────────────────
// Intent Classification
// ─────────────────────────────────────────────

export type KeywordIntent = 'Navigational' | 'Informational' | 'Commercial' | 'Transactional' | 'Local';

/**
 * Classifies the intent of a generated keyword phrase
 */
export function classifyIntent(phrase: string): KeywordIntent {
  const p = phrase.toLowerCase();
  if (p.match(/\b(near me|in|area|city|state)\b/)) return 'Local';
  if (p.match(/\b(best|top|review|vs|compare)\b/)) return 'Commercial';
  if (p.match(/\b(buy|cheap|affordable|hire|cost|price|service)\b/)) return 'Transactional';
  if (p.match(/\b(how to|guide|what is|tips)\b/)) return 'Informational';
  return 'Local'; // Default fallback broadly to Local for this tool
}

// ─────────────────────────────────────────────
// Keyword Interfaces
// ─────────────────────────────────────────────

export interface ExtractedKeyword {
  keyword: string;
  searchVolume: 'High' | 'Medium' | 'Low';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  intent: KeywordIntent;
}

interface CompetitorInput {
  title: string;
  snippet: string;
  position: number;
  isDirectory: boolean;
}

// ─────────────────────────────────────────────
// Core Engine
// ─────────────────────────────────────────────

/**
 * Hybrid Extractor:
 * 1. N-gram frequency extraction from SERP competitors
 * 2. Hardcoded template localized expansion
 * 3. Unified deduplication, intent classification, and scoring
 */
export function extractKeywordIdeas(
  competitors: CompetitorInput[],
  keyword: string,
  location: string,
  topN: number = 5
): ExtractedKeyword[] {
  const keywordTokens = new Set(tokenize(keyword));
  const locationTokens = new Set(tokenize(location));
  const freqMap = new Map<string, number>();

  // Stage 1: Extract real tokens from competitors
  for (const comp of competitors) {
    const posWeight = comp.isDirectory ? 0.3 : 1 / Math.max(1, comp.position);
    const titleTokens = tokenize(comp.title);
    const snippetTokens = tokenize(comp.snippet);

    for (const token of titleTokens) {
      if (!keywordTokens.has(token) && !locationTokens.has(token)) {
        freqMap.set(token, (freqMap.get(token) || 0) + posWeight * 2);
      }
    }
    for (const token of snippetTokens) {
      if (!keywordTokens.has(token) && !locationTokens.has(token)) {
        freqMap.set(token, (freqMap.get(token) || 0) + posWeight);
      }
    }
    for (const ngram of extractNgrams(titleTokens, 2)) {
      if (!ngram.split(' ').every(t => keywordTokens.has(t) || locationTokens.has(t))) {
        freqMap.set(ngram, (freqMap.get(ngram) || 0) + posWeight * 3);
      }
    }
    for (const ngram of extractNgrams(snippetTokens, 2)) {
      if (!ngram.split(' ').every(t => keywordTokens.has(t) || locationTokens.has(t))) {
        freqMap.set(ngram, (freqMap.get(ngram) || 0) + posWeight * 1.5);
      }
    }
  }

  const keywordBase = keyword.toLowerCase().trim();
  const locationBase = location.toLowerCase().trim();

  // Candidate Pool (phrase -> heuristic score)
  const candidatePool = new Map<string, number>();

  // Add dynamically extracted variants to pool
  const sortedExtracts = [...freqMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [token, score] of sortedExtracts) {
    if (token.length < 3) continue;
    candidatePool.set(`${token} ${keywordBase} in ${locationBase}`, score * 0.8);
    candidatePool.set(`${token} ${keywordBase} near me`, score * 0.9);
    candidatePool.set(`best ${token} ${keywordBase}`, score * 0.7);
  }

  // Add strong template variants to pool
  candidatePool.set(`best ${keywordBase} in ${locationBase}`, 5.0);
  candidatePool.set(`affordable ${keywordBase} ${locationBase}`, 4.0);
  candidatePool.set(`top rated ${keywordBase} near me`, 4.5);
  candidatePool.set(`emergency ${keywordBase} ${locationBase}`, 3.5);
  candidatePool.set(`${keywordBase} near me`, 6.0); // very high volume standard

  // Deduplicate and Rank
  const results: ExtractedKeyword[] = [];
  const seen = new Set<string>();

  const finalRanked = [...candidatePool.entries()]
    .sort((a, b) => b[1] - a[1]); // Descending score

  for (const [phrase, score] of finalRanked) {
    if (results.length >= topN) break;
    const norm = phrase.toLowerCase();
    if (seen.has(norm) || norm === keywordBase) continue;
    seen.add(norm);

    const difficulty = score > 4.5 ? 'Hard' : score > 2.5 ? 'Medium' : 'Easy';
    const volume = score > 4.0 ? 'High' : score > 2.0 ? 'Medium' : 'Low';
    
    results.push({
      keyword: phrase,
      searchVolume: volume,
      difficulty,
      intent: classifyIntent(phrase)
    });
  }

  return results;
}

// ─────────────────────────────────────────────
// Deterministic Fallback Logic (Unchanged)
// ─────────────────────────────────────────────

interface InsightContext {
  keyword: string;
  location: string;
  ranking: number;
  seoScore: number;
  foundInLocalPack: boolean;
  totalOrganicResults: number;
  topCompetitorName: string;
  topCompetitorPosition: number;
}

export function generateFallbackInsights(ctx: InsightContext): string {
  const parts: string[] = [];

  if (ctx.ranking > 0 && ctx.ranking <= 3) {
    parts.push(`Your business ranks #${ctx.ranking} on Google for "${ctx.keyword}" in ${ctx.location} — you're in the top 3 where ~75% of clicks occur.`);
  } else if (ctx.ranking > 0 && ctx.ranking <= 10) {
    parts.push(`Your business ranks #${ctx.ranking} on Google for "${ctx.keyword}" in ${ctx.location}. You're on page 1, but positions 1–3 capture majority traffic. Focus on closing that gap.`);
  } else if (ctx.ranking > 10) {
    const page = Math.ceil(ctx.ranking / 10);
    parts.push(`Your business ranks #${ctx.ranking} (page ${page}) for "${ctx.keyword}" in ${ctx.location}. Pages 2+ receive under 5% of clicks.`);
  } else {
    parts.push(`Your business was not found in the top ${ctx.totalOrganicResults} Google results for "${ctx.keyword}" in ${ctx.location}. Start by claiming your Google Profile and establishing local citations.`);
  }

  if (ctx.foundInLocalPack) {
    parts.push('You appear in the Google Map Pack — maintain your review velocity.');
  } else {
    parts.push('You\'re not appearing in the Google Map Pack. Optimize your Google Business Profile (NAP consistency, photos, reviews).');
  }

  if (ctx.topCompetitorName) {
    parts.push(`The top organic competitor is "${ctx.topCompetitorName}" at position #${ctx.topCompetitorPosition}. Analyze their content strategy and review profile.`);
  }

  return parts.join(' ');
}

interface LlmPromptContext {
  businessName: string;
  keyword: string;
  location: string;
  ranking: number;
  seoScore: number;
  foundInLocalPack: boolean;
  totalOrganicResults: number;
  topCompetitors: { name: string; position: number }[];
  localPackTop: { name: string; rating: number; reviews: number }[];
}

export function buildCompressedLlmPrompt(ctx: LlmPromptContext): string {
  const rankStr = ctx.ranking > 0
    ? `#${ctx.ranking}/${ctx.totalOrganicResults}`
    : `Not found`;
  const comps = ctx.topCompetitors.map(c => `#${c.position} ${c.name}`).join(';');
  const locals = ctx.localPackTop.length > 0
    ? ctx.localPackTop.map(l => `${l.name}(${l.rating}★)`).join(';')
    : 'None';

  return `SEO analysis data:
Biz: ${ctx.businessName || 'Unknown'} | KW: "${ctx.keyword}" | Loc: ${ctx.location}
Rank: ${rankStr} | MapPack: ${ctx.foundInLocalPack ? 'Y' : 'N'} | Score: ${ctx.seoScore}
Competitors: ${comps}
LocalPack: ${locals}

Write 3-4 sentences of actionable local SEO insights. Reference competitors by name. Mention ranking position. Give concrete next steps. Output JSON { "insights": "..." }.`;
}
