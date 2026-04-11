import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Report from '@/models/Report';
import axios from 'axios';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  calculateSeoScore,
  findBusinessInResults,
  findBusinessInLocalPack,
  extractCompetitors,
  countDirectoriesInTopN,
  extractFeatures,
  calculateCustomerLoss,
  enrichCompetitorsWithDominance
} from '@/lib/seo-utils';
import { performSeoAudit } from '@/lib/audit-utils';
import { extractReviewMetrics } from '@/lib/review-utils';
import {
  serpCache,
  llmCache,
  makeCacheKey,
  makeCanonicalSerpKey,
  makeLlmCacheKey,
  findCachedReport,
  CachedSerpData,
  getCacheMetrics,
} from '@/lib/cache';
import {
  extractKeywordIdeas,
  generateFallbackInsights,
  buildCompressedLlmPrompt,
} from '@/lib/keyword-extractor';

// ── Observability Wrapper ──
function timeIt<T>(label: string, fn: () => T | Promise<T>): { result: T; durationMs: number } | Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const res = fn();
  if (res instanceof Promise) {
    return res.then(r => ({ result: r, durationMs: Math.round(performance.now() - start) }));
  }
  return { result: res, durationMs: Math.round(performance.now() - start) };
}

// ── SERP Fetch Helper ──
async function fetchSerp(query: string, location: string, apiKey: string): Promise<CachedSerpData> {
  const canonicalKey = makeCanonicalSerpKey(query, location);
  const cached = serpCache.get(canonicalKey, true);
  if (cached) return cached;

  try {
    const res = await axios.get('https://serpapi.com/search', {
      params: { engine: 'google', q: query, location, api_key: apiKey, num: 100, gl: 'us', hl: 'en' },
    });
    const data: CachedSerpData = {
      organicResults: res.data.organic_results || [],
      localResults: res.data.local_results?.places || [],
      totalOrganicResults: res.data.organic_results?.length || 0,
      trueSearchVolume: res.data.search_information?.total_results || 0,
      timestamp: Date.now(),
    };
    // Save to shared canonical pool (3h TTL)
    serpCache.set(canonicalKey, data, 3 * 60 * 60);
    return data;
  } catch (err) {
    return { organicResults: [], localResults: [], totalOrganicResults: 0, trueSearchVolume: 0, timestamp: Date.now() };
  }
}

export async function POST(req: Request) {
  const t0 = performance.now();
  const logs: Record<string, any> = { event: 'AnalysisRequest' };

  try {
    const ip = getClientIp(req);
    const limit = checkRateLimit(ip, { maxRequests: 5, windowSeconds: 60 });
    if (!limit.allowed) {
      return NextResponse.json({ error: `Try again in ${limit.resetInSeconds}s.` }, { status: 429 });
    }

    await dbConnect();
    const body = await req.json();
    const { keyword, location, businessName, website } = body;

    if (!keyword || !location) {
      return NextResponse.json({ error: 'Keyword and location required' }, { status: 400 });
    }

    logs.keyword = keyword;
    logs.location = location;

    // L2 Cache
    const cachedReport = await findCachedReport(Report, keyword, location, businessName, website, 3 * 3600 * 1000);
    if (cachedReport) {
      logs.cacheHit = 'L2_MONGO';
      logs.durationMs = Math.round(performance.now() - t0);
      console.log(JSON.stringify(logs));
      return NextResponse.json({ reportId: cachedReport._id, ranking: cachedReport.ranking, seoScore: cachedReport.seoScore, message: "Partial data returned." });
    }

    const serpApiKey = process.env.SERPAPI_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    // FEATURE 3: Start Audit concurrently with SERP
    const auditPromise = performSeoAudit(website, keyword);

    let serpQueriesCount = 0;
    let organicResults: any[] = [];
    let localResults: any[] = [];
    let allQueriesOrganicResults: any[][] = [];
    let ranking = 0;
    let foundInLocalPack = false;

    // ── PROGRESSIVE MULTI-QUERY EXTRACTION ──
    if (serpApiKey) {
      // Query 1: Base Query
      const { result: baseData, durationMs: ms1 } = await timeIt('Serp1', () => fetchSerp(`${keyword} in ${location}`, location, serpApiKey));
      serpQueriesCount++;
      organicResults = baseData.organicResults;
      localResults = baseData.localResults;
      allQueriesOrganicResults.push(baseData.organicResults);
      logs.serpMs = ms1;

      if (businessName || website) {
        const match = findBusinessInResults(organicResults, businessName, website);
        if (match.found) ranking = match.position;
        foundInLocalPack = findBusinessInLocalPack(localResults, businessName, website);
      }

      // Check Confidence
      const isWeakRanking = ranking === 0 || ranking > 10;
      
      if (isWeakRanking) {
        // Query 2 & 3: Expansions
        const q2 = `best ${keyword} in ${location}`;
        const q3 = `${keyword} near me`;
        
        const { result: extVars, durationMs: msExt } = await timeIt('SerpExt', () => 
          Promise.all([fetchSerp(q2, location, serpApiKey), fetchSerp(q3, location, serpApiKey)])
        );
        serpQueriesCount += 2;
        logs.serpExpandMs = msExt;

        // Aggregate
        for (const data of extVars) {
          allQueriesOrganicResults.push(data.organicResults);
          const match = findBusinessInResults(data.organicResults, businessName, website);
          if (match.found && (ranking === 0 || match.position < ranking)) {
            ranking = match.position;
          }
          if (!foundInLocalPack && findBusinessInLocalPack(data.localResults, businessName, website)) {
            foundInLocalPack = true;
          }
        }
      }
    } else {
      ranking = 15;
      organicResults = [{ title: "Mock", link: "mock.com", snippet: "Mock", position: 1 }];
      allQueriesOrganicResults.push(organicResults);
    }

    // ── FEATURE ENGINEERING ──
    const searchFeatures = extractFeatures(ranking, foundInLocalPack, organicResults, keyword);

    // ── SCORING ──
    const seoScore = calculateSeoScore({
      ranking,
      foundInLocalPack,
      organicResultsCount: organicResults.length,
      totalSearchResults: 1000,
      directoryCountInTop10: countDirectoriesInTopN(organicResults, 10),
    });

    let competitors = extractCompetitors(organicResults, keyword);
    
    // FEATURE 1 & 5: Dominance Score and Market Share
    const domRes = enrichCompetitorsWithDominance(competitors, allQueriesOrganicResults, localResults);
    competitors = domRes.enriched;
    const dominanceData = domRes.dominance;

    // FEATURE 2: Review Metric Extraction
    const reviewMetrics = extractReviewMetrics(localResults, businessName, website);

    const keywords = extractKeywordIdeas(competitors, keyword, location, 5);

    // ── LLM INSIGHTS ──
    let insights = "";
    if (groqApiKey) {
      const llmKey = makeLlmCacheKey(keyword, location, ranking, seoScore);
      const cachedLlm = llmCache.get(llmKey);
      if (cachedLlm) {
        insights = cachedLlm.insights;
        logs.llmHit = true;
      } else {
        logs.llmHit = false;
        try {
          const prompt = buildCompressedLlmPrompt({
            businessName: businessName || '', keyword, location, ranking, seoScore, foundInLocalPack, 
            totalOrganicResults: organicResults.length,
            topCompetitors: competitors.slice(0, 5).map(c => ({ name: c.title, position: c.position })),
            localPackTop: localResults.slice(0, 3).map((r: any) => ({ name: r.title, rating: r.rating || 0, reviews: r.reviews || 0 })),
          });
          
          const { result: llmRes, durationMs: llmMs } = await timeIt('LLM', async () => {
            return axios.post('https://api.groq.com/openai/v1/chat/completions', {
              model: "llama-3.3-70b-versatile",
              messages: [{ role: "system", content: "You are an SEO expert. Output JSON." }, { role: "user", content: prompt }],
              response_format: { type: "json_object" },
              max_tokens: 300,
            }, { headers: { Authorization: `Bearer ${groqApiKey}`, "Content-Type": "application/json" } });
          });
          logs.llmMs = llmMs;

          const content = llmRes.data.choices[0].message.content;
          const parsed = JSON.parse(content?.replace(/```json/gi, '').replace(/```/g, '').trim() || '{}');
          insights = parsed.insights || "";
          if (insights) llmCache.set(llmKey, { insights }, 6 * 3600); // 6h adaptive TTL hook
        } catch (e: any) { logs.llmError = e.message; }
      }
    }

    if (!insights) {
      insights = generateFallbackInsights({
        keyword, location, ranking, seoScore, foundInLocalPack, totalOrganicResults: organicResults.length,
        topCompetitorName: competitors[0]?.title || '', topCompetitorPosition: competitors[0]?.position || 0,
      });
      logs.insightsFallback = true;
    }

    // FEATURE 3 & 4 resolution
    const seoAudit = await auditPromise;
    const lossEstimateData = calculateCustomerLoss(ranking);

    // ── DATABASE PERSISTENCE ──
    const report = new Report({
      keyword, location, businessName, website,
      ranking, competitors, keywords, seoScore, insights,
      features: searchFeatures,
      reviewMetrics,
      seoAudit,
      dominanceData,
      lossEstimate: lossEstimateData.lossPercent
    });
    await report.save();

    // Finalize Observability
    logs.cacheMetrics = getCacheMetrics();
    logs.serpQueriesUsed = serpQueriesCount;
    logs.durationMs = Math.round(performance.now() - t0);
    console.log(JSON.stringify(logs));

    return NextResponse.json({ reportId: report._id, ranking: report.ranking, seoScore: report.seoScore, message: "Partial data returned." });

  } catch (error: any) {
    logs.error = error.message;
    console.error(JSON.stringify(logs));
    return NextResponse.json({ error: error.message || 'Error' }, { status: 500 });
  }
}
