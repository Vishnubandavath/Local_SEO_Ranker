import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Lead from '@/models/Lead';
import Report from '@/models/Report';
import { sendLeadNotification } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    // Rate limit: 10 lead submissions per minute per IP
    const ip = getClientIp(req);
    const limit = checkRateLimit(`lead-${ip}`, { maxRequests: 10, windowSeconds: 60 });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Too many submissions. Please try again in ${limit.resetInSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(limit.resetInSeconds) } }
      );
    }

    await dbConnect();
    const body = await req.json();
    const { reportId, name, email, phone } = body;

    if (!reportId || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      { isConvertedToLead: true },
      { new: true }
    );
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const lead = new Lead({
      name,
      email,
      phone,
      keyword: report.keyword,
      location: report.location
    });

    await lead.save();

    // Fire-and-forget email notification to admin
    sendLeadNotification({
      name,
      email,
      phone,
      keyword: report.keyword,
      location: report.location
    }).catch(() => {}); // Swallow any unhandled rejections

    return NextResponse.json({ success: true, message: 'Lead saved successfully' });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
