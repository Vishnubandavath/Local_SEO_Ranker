import Report from '@/models/Report';

/**
 * Analytics + Feedback Loop Queries
 * 
 * Exposes MongoDB aggregation pipelines to extract insights from historic usage.
 * This can be wired into an internal Admin Dashboard or a chron job to rebalance weights.
 */

// 1. Top Searched Keywords & Conversion Rates
export async function getKeywordPerformance() {
  return Report.aggregate([
    {
      $group: {
        _id: { $toLower: "$keyword" },
        totalSearches: { $sum: 1 },
        avgSeoScore: { $avg: "$seoScore" },
        timesConverted: { 
          $sum: { $cond: ["$isConvertedToLead", 1, 0] } 
        }
      }
    },
    {
      $project: {
        keyword: "$_id",
        totalSearches: 1,
        avgSeoScore: { $round: ["$avgSeoScore", 1] },
        conversionRate: { 
          $round: [{ $divide: ["$timesConverted", "$totalSearches"] }, 2 ]
        }
      }
    },
    { $sort: { totalSearches: -1 } }
  ]);
}

// 2. Feature Impact on Ranking & Score (Foundation for ML Feedback Loop)
export async function getFeatureCorrelations() {
  return Report.aggregate([
    { $match: { "features.rankBucket": { $exists: true } } },
    {
      $group: {
        _id: "$features.rankBucket",
        count: { $sum: 1 },
        avgCompetitorDensity: { $avg: "$features.competitorDensity" },
        avgDirectoryDensity: { $avg: "$features.directoryDensity" },
        percentInMapPack: {
          $avg: { $cond: ["$features.inMapPack", 1, 0] }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}
