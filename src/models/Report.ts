import mongoose, { Schema, Document } from 'mongoose';

export interface ICompetitor {
  title: string;
  link: string;
  snippet?: string;
  position: number;
  isDirectory?: boolean;
  competitorScore?: number;
  rankReasons?: string[];
  dominanceScore?: number;
  marketShare?: number;
}

export interface IKeywordIdea {
  keyword: string;
  searchVolume: string;
  difficulty: string;
}

export interface IReport extends Document {
  keyword: string;
  location: string;
  businessName?: string;
  website?: string;
  ranking: number;
  competitors: ICompetitor[];
  keywords: IKeywordIdea[];
  seoScore: number;
  insights: string;
  createdAt: Date;
  isConvertedToLead?: boolean;
  features?: {
    rankBucket: string;
    inMapPack: boolean;
    competitorDensity: number;
    directoryDensity: number;
    localIntentSignal: number;
  };
  reviewMetrics?: any;
  seoAudit?: any;
  dominanceData?: any;
  lossEstimate?: number;
}

const CompetitorSchema = new Schema({
  title: String,
  link: String,
  snippet: String,
  position: Number,
  isDirectory: { type: Boolean, default: false },
  competitorScore: { type: Number, default: 0 },
  rankReasons: [{ type: String }],
  dominanceScore: { type: Number, default: 0 },
  marketShare: { type: Number, default: 0 }
});

const KeywordIdeaSchema = new Schema({
  keyword: String,
  searchVolume: String,
  difficulty: String,
});

const ReportSchema: Schema = new Schema({
  keyword: { type: String, required: true },
  location: { type: String, required: true },
  businessName: { type: String },
  website: { type: String },
  ranking: { type: Number, default: 0 },
  competitors: [CompetitorSchema],
  keywords: [KeywordIdeaSchema],
  seoScore: { type: Number, default: 0 },
  insights: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  isConvertedToLead: { type: Boolean, default: false },
  features: {
    rankBucket: { type: String, enum: ['top3', 'top10', 'page2', 'buried', 'none'] },
    inMapPack: { type: Boolean },
    competitorDensity: { type: Number },
    directoryDensity: { type: Number },
    localIntentSignal: { type: Number },
  },
  reviewMetrics: { type: Schema.Types.Mixed },
  seoAudit: { type: Schema.Types.Mixed },
  dominanceData: { type: Schema.Types.Mixed },
  lossEstimate: { type: Schema.Types.Mixed }
});

// Clear Mongoose model cache in Next.js Hot Module Reloads
if (mongoose.models.Report) {
  delete mongoose.models.Report;
}

export default mongoose.model<IReport>('Report', ReportSchema);
