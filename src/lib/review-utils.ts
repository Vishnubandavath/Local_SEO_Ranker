import { normalizeDomain } from './seo-utils';

export interface ReviewMetrics {
  userRating: number;
  userReviews: number;
  competitorAvgRating: number;
  competitorAvgReviews: number;
  topCompetitorName: string;
  topCompetitorRating: number;
  topCompetitorReviews: number;
  messages: string[];
}

function tokenSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/['`]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim();
    
  const normA = normalize(a);
  const normB = normalize(b);

  if (!normA || !normB) return 0;
  
  if (normA === normB || normB.includes(normA) || normA.includes(normB)) return 1.0;

  const tokensA = normA.split(/\s+/).filter(Boolean);
  const tokensB = new Set(normB.split(/\s+/).filter(Boolean));

  let matchCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) matchCount++;
  }

  return tokensA.length > 0 ? matchCount / tokensA.length : 0;
}

export function extractReviewMetrics(
  localResults: any[],
  businessName?: string,
  website?: string
): ReviewMetrics {
  const result: ReviewMetrics = {
    userRating: 0,
    userReviews: 0,
    competitorAvgRating: 0,
    competitorAvgReviews: 0,
    topCompetitorName: '',
    topCompetitorRating: 0,
    topCompetitorReviews: 0,
    messages: []
  };

  if (!localResults || localResults.length === 0) return result;

  const userDomain = normalizeDomain(website);
  let userResultIndex = -1;

  for (let i = 0; i < localResults.length; i++) {
    const res = localResults[i];
    if (userDomain && res.website && normalizeDomain(res.website) === userDomain) {
      userResultIndex = i;
      break;
    }
    if (businessName && res.title && tokenSimilarity(businessName, res.title) >= 0.5) {
      userResultIndex = i;
      break;
    }
  }

  if (userResultIndex >= 0) {
    result.userRating = localResults[userResultIndex].rating || 0;
    result.userReviews = localResults[userResultIndex].reviews || 0;
  }

  let compTotalRating = 0;
  let compTotalReviews = 0;
  let compCount = 0;

  let bestRepScore = -1;

  for (let i = 0; i < localResults.length; i++) {
    if (i === userResultIndex) continue;
    
    const r = localResults[i];
    const rating = r.rating || 0;
    const reviews = r.reviews || 0;
    
    if (reviews > 0) {
      compTotalRating += rating;
      compTotalReviews += reviews;
      compCount++;
      
      const repScore = Math.pow(rating, 2) * Math.log(1 + reviews);
      if (repScore > bestRepScore) {
        bestRepScore = repScore;
        result.topCompetitorName = r.title || 'Competitor';
        result.topCompetitorRating = rating;
        result.topCompetitorReviews = reviews;
      }
    }
  }

  if (compCount > 0) {
    result.competitorAvgRating = Number((compTotalRating / compCount).toFixed(1));
    result.competitorAvgReviews = Math.round(compTotalReviews / compCount);
    
    if (userResultIndex >= 0) {
      result.messages.push(`You have ${result.userReviews} reviews vs competitor avg ${result.competitorAvgReviews}.`);
    } else {
      result.messages.push(`Your business is actively missing from the Map Pack (Top Competitors average ${result.competitorAvgReviews} reviews).`);
    }
    
    if (result.topCompetitorName) {
      const topRating = result.topCompetitorRating.toFixed(1);
      const uRating = result.userRating ? result.userRating.toFixed(1) : 'N/A';
      result.messages.push(`Top competitor (${result.topCompetitorName}) has ${topRating}★ vs your ${uRating}★.`);
    }
  } else {
    result.messages.push('No sufficient review data found for competitors.');
  }

  return result;
}
