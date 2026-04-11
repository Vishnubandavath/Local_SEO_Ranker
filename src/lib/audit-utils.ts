import axios from 'axios';

export interface SeoAuditResult {
  title: string;
  h1: string;
  metaDesc: string;
  score: number;
  issues: string[];
  passed: string[];
}

export async function performSeoAudit(website: string | undefined, keyword: string): Promise<SeoAuditResult> {
  const result: SeoAuditResult = {
    title: '',
    h1: '',
    metaDesc: '',
    score: 0,
    issues: [],
    passed: []
  };

  if (!website) {
    result.issues.push('No website provided for on-page audit.');
    return result;
  }

  try {
    let url = website.trim();
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }

    const { data: html } = await axios.get(url, { timeout: 3000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LocalRankerBot/1.0)' } });
    
    // Extract Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      result.title = titleMatch[1].trim().replace(/[\r\n]+/g, ' ');
    }

    // Extract H1
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      // rough strip tags if inside H1
      result.h1 = h1Match[1].trim().replace(/<[^>]+>/g, '').replace(/[\r\n]+/g, ' ');
    }

    // Extract Meta Description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
                          html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i);
    if (metaDescMatch && metaDescMatch[1]) {
      result.metaDesc = metaDescMatch[1].trim();
    }

    let keywordInTitle = 0;
    let keywordInH1 = 0;
    let titleLengthScore = 0;
    let metaOptScore = 0;

    const kwLower = keyword.toLowerCase();

    // 1. Keyword in Title (30%)
    if (!result.title) {
      result.issues.push('Missing <title> tag.');
    } else {
      if (result.title.toLowerCase().includes(kwLower)) {
        keywordInTitle = 30;
        result.passed.push('Keyword found in title tag.');
      } else {
        result.issues.push('Target keyword is missing from the page title.');
      }
    }

    // 2. Keyword in H1 (25%)
    if (!result.h1) {
      result.issues.push('Missing <h1> heading.');
    } else {
      if (result.h1.toLowerCase().includes(kwLower)) {
        keywordInH1 = 25;
        result.passed.push('Keyword found in primary H1 heading.');
      } else {
        result.issues.push('Target keyword is missing from the H1 heading.');
      }
    }

    // 3. Title Length (20%)
    if (result.title) {
      if (result.title.length >= 30 && result.title.length <= 65) {
        titleLengthScore = 20;
        result.passed.push('Title length is optimal (30-65 chars).');
      } else {
        titleLengthScore = 10; // partial
        result.issues.push(`Title length is ${result.title.length} chars (optimal is 50-60).`);
      }
    }

    // 4. Meta Description (25%)
    if (!result.metaDesc) {
      result.issues.push('Missing meta description.');
    } else {
      if (result.metaDesc.length >= 100 && result.metaDesc.length <= 160) {
        metaOptScore = 25;
        result.passed.push('Meta description length is optimal.');
      } else {
        metaOptScore = 15; // partial
        result.issues.push(`Meta description length is ${result.metaDesc.length} chars (optimal is 150-160).`);
      }
      
      if (result.metaDesc.toLowerCase().includes(kwLower)) {
        result.passed.push('Keyword included in meta description.');
      } else {
        result.issues.push('Consider adding target keyword to meta description.');
      }
    }

    result.score = keywordInTitle + keywordInH1 + titleLengthScore + metaOptScore;

  } catch (error) {
    result.issues.push('Failed to perform on-page audit (Timeout or inaccessible).');
  }

  return result;
}
