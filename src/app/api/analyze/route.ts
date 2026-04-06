import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Report from '@/models/Report';
import axios from 'axios';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Calculates SEO score from real Google SERP data.
 * Now accurate because SerpAPI provides actual Google ranking positions.
 */
function calculateSeoScore(
  ranking: number,
  trueSearchVolume: number,
  organicResultsCount: number,
  hasWebsite: boolean,
  foundInLocalPack: boolean
): number {
  let score = 0;

  // Ranking position (40 pts max)
  if (ranking > 0 && ranking <= 100) {
    if (ranking <= 3) score += 40;           // Top 3 = full points
    else if (ranking <= 10) score += 35 - (ranking - 3);  // Page 1
    else if (ranking <= 20) score += 22 - Math.floor((ranking - 10) / 2); // Page 2
    else if (ranking <= 50) score += 12;     // Pages 3-5
    else score += 5;                          // Found but buried
  }

  // Local Map Pack presence (25 pts) — huge for local SEO
  if (foundInLocalPack) {
    score += 25;
  }

  // Competitor landscape quality (15 pts)
  score += Math.min(15, organicResultsCount);

  // Website presence (10 pts)
  if (hasWebsite) {
    score += 10;
  }

  // Search volume indicator (10 pts) — more results = more competitive market
  if (trueSearchVolume > 1000000) score += 10;
  else if (trueSearchVolume > 100000) score += 5;
  else if (trueSearchVolume > 10000) score += 2;

  return Math.min(100, Math.max(0, score));
}

export async function POST(req: Request) {
  try {
    // Rate limit: 5 analyses per minute per IP
    const ip = getClientIp(req);
    const limit = checkRateLimit(ip, { maxRequests: 5, windowSeconds: 60 });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Please try again in ${limit.resetInSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(limit.resetInSeconds) } }
      );
    }

    await dbConnect();
    const body = await req.json();
    const { keyword, location, businessName, website } = body;

    if (!keyword || !location) {
      return NextResponse.json({ error: 'Keyword and location are required' }, { status: 400 });
    }

    const serpApiKey = process.env.SERPAPI_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    let competitors: any[] = [];
    let ranking = 0;
    let foundInLocalPack = false;
    let localPackResults: any[] = [];
    let totalOrganicResults = 0;
    let trueSearchVolume = 0;
    
    if (serpApiKey) {
      try {
        // ── Fetch real Google SERP data via SerpAPI ──
        const serpResponse = await axios.get('https://serpapi.com/search', {
          params: {
            engine: 'google',
            q: `${keyword} in ${location}`,
            location: location,
            api_key: serpApiKey,
            num: 100,
            gl: 'us',
            hl: 'en'
          }
        });

        // ── Extract organic results ──
        const organicResults = serpResponse.data.organic_results || [];
        totalOrganicResults = organicResults.length;
        trueSearchVolume = serpResponse.data.search_information?.total_results || totalOrganicResults;

        competitors = organicResults.slice(0, 10).map((r: any) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet || '',
          position: r.position
        }));

        // ── Find user's business in organic results ──
        if (businessName || website) {
          const found = organicResults.find((r: any) => {
            if (website && r.link?.toLowerCase().includes(website.toLowerCase())) return true;
            // Only fallback to title match if website was not provided, to prevent false positives
            if (!website && businessName && r.title?.toLowerCase().includes(businessName.toLowerCase())) return true;
            return false;
          });
          if (found) {
            ranking = found.position; // Real Google position!
          }
        }

        // ── Check Google Local Map Pack ──
        const localResults = serpResponse.data.local_results?.places || [];
        if (localResults.length > 0) {
          localPackResults = localResults.slice(0, 5).map((r: any, idx: number) => ({
            title: r.title,
            rating: r.rating,
            reviews: r.reviews,
            position: idx + 1
          }));

          // Check if user is in the local pack
          if (businessName || website) {
            const foundLocal = localResults.find((r: any) => {
              const matchName = businessName && r.title?.toLowerCase().includes(businessName.toLowerCase());
              const matchWebsite = website && r.website?.toLowerCase().includes(website.toLowerCase());
              return matchName || matchWebsite;
            });
            if (foundLocal) {
              foundInLocalPack = true;
            }
          }
        }

      } catch (err: any) {
        console.error("SerpAPI Error:", err.response?.data || err.message);
      }
    } else {
      // Mock data for development without API key
      competitors = [
        { title: "Joe's Plumbing - #1 in Austin", link: "https://joesplumbing.com", snippet: "Top-rated local plumber with 500+ 5-star reviews.", position: 1 },
        { title: "Austin Pro Plumbers", link: "https://austinproplumbers.com", snippet: "24/7 emergency plumbing. Licensed & insured.", position: 2 },
        { title: "Capital City Plumbing Co.", link: "https://capitalcityplumbing.com", snippet: "Serving Austin since 1998. Free estimates.", position: 3 },
        { title: "Lone Star Drain Solutions", link: "https://lonestardrain.com", snippet: "Drain cleaning, water heater repair, pipe replacement.", position: 4 },
        { title: "RotoRooter Austin", link: "https://rotorooter.com/austin", snippet: "Nationwide plumbing with local Austin teams.", position: 5 },
      ];
      ranking = Math.floor(Math.random() * 30) + 5;
      totalOrganicResults = 85;
      trueSearchVolume = 150000;
      localPackResults = [
        { title: "Joe's Plumbing", rating: 4.8, reviews: 523, position: 1 },
        { title: "Austin Pro Plumbers", rating: 4.6, reviews: 312, position: 2 },
      ];
    }

    // ── Calculate SEO score from real SERP data ──
    const seoScore = calculateSeoScore(
      ranking,
      trueSearchVolume,
      totalOrganicResults,
      !!website,
      foundInLocalPack
    );

    // ── Generate AI keywords AND insights using Groq ──
    let keywords: any[] = [];
    let insights = "";

    if (groqApiKey) {
      try {
        const competitorSummary = competitors.slice(0, 5)
          .map(c => `#${c.position}: ${c.title} — ${c.snippet}`)
          .join('\n');

        const localPackSummary = localPackResults.length > 0
          ? localPackResults.map((r: any) => `${r.title} (${r.rating}★, ${r.reviews} reviews)`).join(', ')
          : 'No local pack results';
        
        const aiResponse = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: "llama-3.3-70b-versatile",
            messages: [
              { 
                role: "system", 
                content: "You are a local SEO expert. Provide specific, actionable advice based on real Google search data. Output ONLY valid JSON." 
              },
              { 
                role: "user", 
                content: `Analyze this REAL Google search data and return a JSON response:

BUSINESS: "${businessName || 'Not provided'}"
KEYWORD: "${keyword}"
LOCATION: "${location}"
WEBSITE: ${website || 'Not provided'}
GOOGLE RANKING: ${ranking > 0 ? `#${ranking} out of ${totalOrganicResults} organic results` : `Not found in top ${totalOrganicResults} results`}
IN GOOGLE MAP PACK: ${foundInLocalPack ? 'Yes' : 'No'}
SEO SCORE: ${seoScore}/100

TOP 5 ORGANIC COMPETITORS:
${competitorSummary}

GOOGLE MAP PACK:
${localPackSummary}

Return EXACTLY this JSON:
{
  "keywords": [
    { "keyword": "specific localized keyword", "searchVolume": "High/Medium/Low", "difficulty": "Easy/Medium/Hard" }
  ],
  "insights": "Write 3-4 sentences. Reference specific competitors by name. Mention the actual ranking position. Give concrete next steps (e.g. 'You need X more reviews to match Y competitor'). Be direct."
}

Generate exactly 5 keyword ideas relevant to "${keyword}" in "${location}".`
              }
            ],
            response_format: { type: "json_object" }
          },
          { headers: { Authorization: `Bearer ${groqApiKey}`, "Content-Type": "application/json" } }
        );
        
        const content = aiResponse.data.choices[0].message.content;
        const cleanedContent = content?.replace(/```json/gi, '').replace(/```/g, '').trim() || '{}';
        let parsed: any = {};
        try {
          parsed = JSON.parse(cleanedContent);
        } catch (e) {
          console.error("JSON parse error:", e);
        }
        keywords = parsed.keywords || [];
        insights = parsed.insights || "Analysis complete. Focus on local citations and Google Business Profile optimization.";
      } catch (err: any) {
        console.error("Groq Error:", err.response?.data || err.message);
        // Fallback insights
        insights = ranking > 0
          ? `Your business ranks #${ranking} on Google for "${keyword}" in ${location}. ${ranking <= 10 ? 'You\'re on page 1 — focus on climbing into the top 3 where 75% of clicks happen.' : `You're on page ${Math.ceil(ranking / 10)}. Build more local backlinks and Google reviews to reach page 1.`} ${foundInLocalPack ? 'Great news: you appear in the Google Map Pack!' : 'You\'re not in the Google Map Pack — claim and optimize your Google Business Profile.'}`
          : `Your business was not found in the top ${totalOrganicResults} Google results for "${keyword}" in ${location}. Start by claiming your Google Business Profile, building citations on Yelp and industry directories, and creating "${keyword} in ${location}" content on your website.`;
      }
    } else {
      // Mock data
      keywords = [
        { keyword: `${keyword} near me`, searchVolume: "High", difficulty: "Hard" },
        { keyword: `best ${keyword} in ${location}`, searchVolume: "Medium", difficulty: "Medium" },
        { keyword: `affordable ${keyword} ${location}`, searchVolume: "Medium", difficulty: "Easy" },
        { keyword: `emergency ${keyword} ${location}`, searchVolume: "High", difficulty: "Medium" },
        { keyword: `top rated ${keyword} near ${location}`, searchVolume: "Low", difficulty: "Easy" },
      ];
      insights = `Your business ranks approximately #${ranking} on Google for "${keyword}" in ${location}. ${ranking <= 10 ? 'You\'re on page 1 — optimize for the Map Pack and aim for the top 3.' : `Move toward page 1 by building local backlinks and earning more Google reviews.`} The top competitor, "${competitors[0]?.title}", holds position #1 — study their content strategy and review profile.`;
    }

    const report = new Report({
      keyword,
      location,
      businessName,
      website,
      ranking,
      competitors,
      keywords,
      seoScore,
      insights
    });

    await report.save();

    return NextResponse.json({
      reportId: report._id,
      ranking: report.ranking,
      seoScore: report.seoScore,
      message: "Partial data returned. Submit lead form to unlock full report."
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
