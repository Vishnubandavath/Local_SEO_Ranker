import mongoose, { Schema, Document } from 'mongoose';

export interface ICompetitor {
  title: string;
  link: string;
  snippet?: string;
  position: number;
  isDirectory?: boolean;
  competitorScore?: number;
  rankReasons?: string[];
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
}

const CompetitorSchema = new Schema({
  title: String,
  link: String,
  snippet: String,
  position: Number,
  isDirectory: { type: Boolean, default: false },
  competitorScore: { type: Number, default: 0 },
  rankReasons: [{ type: String }],
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
  }
});

export default mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);
