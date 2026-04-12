"use client";

import { useEffect, useState, use } from "react";
import { Trophy, AlertTriangle, CheckCircle, TrendingDown, Target, Building2, MapPin, Star, FileSearch, PieChart, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LeadGateModal } from "@/components/LeadGateModal";
import { ScoreIndicator } from "@/components/ScoreIndicator";

// -- Deterministic Logic Utilities for B2B Output --

const getRankingStrength = (ranking: number) => {
  if (ranking > 0 && ranking <= 3) return "Strong";
  if (ranking > 3 && ranking <= 10) return "Moderate";
  if (ranking > 10 && ranking <= 50) return "Weak";
  return "Critical";
};

const getInsights = (reportData: any) => {
  const competitor = reportData.dominanceData?.topDominantName || reportData.competitors?.[0]?.title || "top-ranking competitors";
  const gap = (reportData.features?.inMapPack) 
    ? "improving your organic ranking positions" 
    : "establishing your presence in the Google Map Pack";
    
  return [
    `Your business is currently yielding a significant share of revenue to ${competitor} due to missing local visibility signals.`,
    `The primary gap holding your growth back is ${gap}, which stops local customers from discovering your services when their intent to buy is highest.`,
    `By implementing the data-backed action plan below, you can capture the unmet demand for "${reportData.keyword}" in ${reportData.location} and recover your lost traffic.`
  ];
};

const getActionPlan = (reportData: any) => {
  const steps = [];
  
  if (!reportData.features?.inMapPack) {
    steps.push({
      title: "Secure Your Map Pack Position",
      description: "Claim, verify, and aggressively optimize your Google Business Profile. Add fresh photos, detailed service lists, and ensure your NAP matches exactly across the web."
    });
  }

  const reviewGap = reportData.reviewMetrics?.competitorAvgReviews - reportData.reviewMetrics?.userReviews;
  if (reviewGap > 0) {
    steps.push({
      title: "Close the Reputation Gap",
      description: `You are behind the market average by ${reviewGap} reviews. Implement an automated review generation system to steadily intercept and surpass the market average.`
    });
  }

  steps.push({
    title: "Reverse-Engineer Your Competition",
    description: `Analyze exactly why ${reportData.dominanceData?.topDominantName || "the market leaders"} are outranking you. Review their keyword density on service pages and replicate their local backlink profile.`
  });

  if (reportData.keywords?.length > 0) {
    const kws = reportData.keywords.map((k: any) => k.keyword).slice(0, 2).join(" and ");
    steps.push({
      title: "Capture High-Intent Search Traffic",
      description: `Create dedicated, conversion-optimized service pages targeting specific, high-intent local searches like "${kws}" to capture ready-to-buy customers that competitors are ignoring.`
    });
  }

  if (reportData.seoAudit && reportData.seoAudit.score < 100) {
    steps.push({
      title: "Resolve On-Page SEO Issues",
      description: "Your landing page failed critical fundamental SEO checks. Update your Title tag and H1 heading to properly target your most valuable keywords before spending money on off-page SEO."
    });
  }

  return steps.slice(0, 4);
};

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [reportData, setReportData] = useState<any>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch(`/api/reports/${resolvedParams.id}`);
        const data = await res.json();
        if (data.report) {
          setReportData(data.report);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [resolvedParams.id, unlocked]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-muted-foreground">Generating Growth Analysis...</p>
        </div>
      </div>
    );
  }

  if (!reportData) {
    return <div className="min-h-screen flex items-center justify-center">Report not found.</div>;
  }

  const lossEstimateObj = reportData.lossEstimate || { lossPercent: 8, estimatedLostCustomers: 0 };
  const lossPercent = typeof lossEstimateObj === 'number' ? lossEstimateObj : lossEstimateObj.lossPercent ?? 8;
  const lostVolume = typeof lossEstimateObj === 'object' ? lossEstimateObj.estimatedLostCustomers : 0;
  const lossClass = lossPercent > 50 ? "text-red-500" : lossPercent > 20 ? "text-yellow-500" : "text-green-500";
  const compDensity = reportData.features?.competitorDensity ?? 0.5;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Local Business Growth Analyzer</h1>
            <p className="text-muted-foreground mt-2 flex items-center text-lg">
              Market Analysis for <span className="font-semibold text-primary mx-2 border-b border-primary/30">"{reportData.keyword}"</span> in <span className="font-semibold text-primary ml-1 border-b border-primary/30">{reportData.location}</span>
            </p>
          </div>
          <div className="mt-4 md:mt-0 text-sm md:text-base text-muted-foreground flex items-center gap-2">
            {reportData.businessName && <><Building2 className="w-5 h-5 text-primary" /> <span>{reportData.businessName}</span></>}
          </div>
        </header>

        {/* Top Cards (Always Visible) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Local Visibility Score */}
          <Card className="col-span-1 lg:col-span-2 border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Target className="text-primary w-7 h-7" />
                Local Visibility Score
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground/80">A comprehensive measure of your digital presence and market share capability.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row items-center gap-8 pb-8">
              <div className="flex-shrink-0 scale-110">
                <ScoreIndicator score={reportData.seoScore} />
              </div>
              <div className="flex-grow w-full space-y-5">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground font-medium uppercase tracking-wider text-xs">Ranking Strength</span>
                    <span className="font-bold text-foreground">{getRankingStrength(reportData.ranking)}</span>
                  </div>
                  <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                     <div className="h-full bg-primary" style={{ width: reportData.ranking > 0 ? `${Math.max(5, 100 - reportData.ranking)}%` : '5%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground font-medium uppercase tracking-wider text-xs">Map Pack Presence</span>
                    <span className="font-bold text-foreground">{reportData.features?.inMapPack ? "Detected" : "Missing"}</span>
                  </div>
                  <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                     <div className={`h-full ${reportData.features?.inMapPack ? 'bg-green-500 w-full' : 'bg-red-500 w-1/4'}`}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground font-medium uppercase tracking-wider text-xs">Market Competition Level</span>
                    <span className="font-bold text-foreground">{compDensity > 0.7 ? "High" : compDensity > 0.4 ? "Moderate" : "Low"}</span>
                  </div>
                  <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                     <div className="h-full bg-orange-500" style={{ width: `${compDensity * 100}%` }}></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Revenue Impact Layer */}
          <Card className="col-span-1 border-red-500/30 bg-gradient-to-br from-red-500/10 via-red-900/5 to-transparent flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <TrendingDown className="w-32 h-32 text-red-500" />
            </div>
            <CardHeader className="relative z-10">
              <CardTitle className="text-xl text-red-400 font-bold uppercase tracking-wide">Customer Loss Estimate</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-center items-center text-center relative z-10 pb-10">
              <span className={`text-7xl font-black tracking-tighter ${lossClass} drop-shadow-sm`}>{lossPercent}%</span>
              <div className="w-16 h-1 bg-red-500/30 my-4 rounded-full"></div>
              <span className="text-foreground text-lg font-medium leading-snug px-2">
                You are losing ~<span className="text-red-400 font-bold">{lossPercent}%</span> of potential customers.
                {lostVolume > 0 && <span className="block mt-2 text-sm text-muted-foreground">Approx. <span className="text-red-400 font-bold">{lostVolume}</span> high-intent local searches missed per month.</span>}
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Premium Content Area (Blurred if locked) */}
        <div className="relative">
          {!unlocked && <LeadGateModal reportId={resolvedParams.id} onUnlock={() => setUnlocked(true)} />}

          <div className={`space-y-8 ${!unlocked ? 'filter blur-[10px] select-none pointer-events-none opacity-40' : ''}`}>
            
            {/* Action Plan */}
            <Card className="border-green-500/30 shadow-lg shadow-green-900/5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-green-500"></div>
              <CardHeader className="pl-8 pb-2">
                <CardTitle className="text-green-400 flex items-center gap-2 text-2xl font-bold">
                  <CheckCircle className="w-6 h-6" /> Executive Action Plan
                </CardTitle>
                <CardDescription className="text-base">Specific, data-driven steps to recover your lost customers.</CardDescription>
              </CardHeader>
              <CardContent className="pl-8 pt-4">
                <div className="space-y-5">
                  {getActionPlan(reportData).map((step: any, i: number) => (
                    <div key={i} className="flex items-start gap-5 p-4 rounded-xl bg-gradient-to-r from-green-500/5 to-transparent border border-green-500/10">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 flex items-center justify-center font-bold text-lg shadow-inner">
                        {i + 1}
                      </div>
                      <div className="pt-1">
                        <h4 className="font-semibold text-foreground text-lg tracking-tight">{step.title}</h4>
                        <p className="text-muted-foreground mt-2 text-base leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Review Reputation Gap */}
              {reportData.reviewMetrics && reportData.reviewMetrics.messages.length > 0 && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="text-amber-400 flex items-center gap-2">
                      <Star className="w-5 h-5" /> Local Reputation Gap
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-4">
                      {reportData.reviewMetrics.messages.map((msg: string, i: number) => (
                        <li key={i} className="flex items-start gap-3">
                          <div className="mt-1.5 h-2 w-2 rounded-full bg-amber-400 shrink-0"></div>
                          <p className="text-foreground/90 font-medium leading-relaxed">{msg}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* On-Page SEO Audit */}
              {reportData.seoAudit ? (
                <Card className="border-purple-500/20 bg-purple-500/5">
                  <CardHeader>
                    <CardTitle className="text-purple-400 flex items-center gap-2">
                      <FileSearch className="w-5 h-5" /> On-Page SEO Audit
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-medium text-muted-foreground">Technical Health</span>
                        <span className="font-bold text-lg text-purple-400">{reportData.seoAudit.score}/100</span>
                      </div>
                      {reportData.seoAudit.issues.slice(0, 3).map((issue: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-red-400 text-sm font-medium bg-red-500/10 p-2 rounded">
                          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>{issue}</span>
                        </div>
                      ))}
                      {reportData.seoAudit.passed.slice(0, 2).map((pass: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-green-400 text-sm font-medium bg-green-500/10 p-2 rounded">
                          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>{pass}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {/* Competitors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-foreground">Top Competitors Dominating Your Market</CardTitle>
                <CardDescription className="text-base">These specific businesses are currently capturing your lost traffic. Here is exactly why they are winning.</CardDescription>
                {reportData.dominanceData?.message && (
                  <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-primary font-semibold flex items-center gap-2">
                       <PieChart className="w-5 h-5" /> {reportData.dominanceData.message}
                    </p>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reportData.competitors?.slice(0, 5).map((comp: any, i: number) => {
                    const primaryReason = comp.rankReasons?.[0] || "Strong local authority matching the keyword intent";
                    const secondaryReason = comp.rankReasons?.[1] || (comp.isDirectory ? "High domain authority scaling" : "Highly optimized service & product pages");
                    
                    return (
                      <div key={i} className="flex flex-col md:flex-row md:items-center p-5 rounded-xl bg-white/[0.02] border border-white/10 transition-all hover:bg-white/[0.04] hover:shadow-lg hover:border-primary/40 gap-6">
                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-background border border-primary/30 text-primary flex items-center justify-center font-black text-xl shadow-[0_0_15px_rgba(var(--primary),0.2)]">
                          {comp.position || (i + 1)}
                        </div>
                        <div className="flex-grow">
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-bold text-foreground text-xl flex items-center gap-2">
                              {comp.title}
                              {comp.isDirectory && <span className="text-xs bg-muted px-2 py-0.5 rounded-sm font-medium text-muted-foreground uppercase tracking-wider">Directory</span>}
                            </h4>
                            {comp.marketShare != null && (
                              <span className="text-sm font-bold bg-primary/10 text-primary px-3 py-1 rounded-full whitespace-nowrap">
                                {comp.marketShare}% Dominance
                              </span>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-start gap-3 bg-background/50 p-3 rounded-lg border border-white/5">
                              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                              <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1 block">Why They Rank</span>
                                <span className="text-sm text-foreground/90 font-medium">{primaryReason}</span>
                              </div>
                            </div>
                            <div className="flex items-start gap-3 bg-background/50 p-3 rounded-lg border border-white/5">
                              <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
                              <div>
                                <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1 block">Key Advantage</span>
                                <span className="text-sm text-foreground/90 font-medium">{secondaryReason}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Key Insights */}
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardHeader>
                <CardTitle className="text-blue-400 text-xl font-bold">Strategic Recovery Blueprint</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-5">
                  {getInsights(reportData).map((insight: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-4">
                      <div className="mt-2 h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0 shadow-sm shadow-blue-500/50"></div>
                      <p className="text-foreground/90 leading-relaxed text-lg">{insight}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
