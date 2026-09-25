import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/app/api/_lib/auth';
import { upstreamErrorResponse } from '@/app/api/_lib/upstream';
import { createClient } from '@/lib/supabase/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY; // The user said Gemini and Claude API keys are in .env.local

// Two sequential LLM passes (Gemini analyst, then Claude writer) routinely run
// past the default serverless limit.
export const maxDuration = 300;

/** Pursuit + one-pagers + comps without map geometry fit comfortably in this. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const GEMINI_TIMEOUT_MS = 110_000;
const CLAUDE_TIMEOUT_MS = 170_000;

// ────────────────────────── Prompts ──────────────────────────

const GEMINI_ANALYST_PROMPT = `You are an elite real estate investment analyst. 
You will be provided with a raw, unstructured JSON blob representing a complete multifamily development pursuit (demographics, zoning, parcel metrics, pre-development budgets, rent comps, land comps, sale comps, and key dates).

Your job is to parse, synthesize, and extract the MOST critical and compelling information into a highly structured "Investment Fact-Sheet".
This fact-sheet will be used by an Executive Partner to write the final Investment Committee Memo.

Include:
1. Executive Overview (Location, Project Name, Status)
2. Site & Zoning Assessment (Buildable units, density, FAR, constraints)
3. Market & Demographics (Key population trends, income, growth metrics)
4. Financial Feasibility & Budget (Total budget, NOI, Cost per Unit, Yield on Cost from the scenarios)
5. Competitive Landscape (Summary of rent comps, subject achievable rents)
6. Sales & Land Comps (Justification of land basis and exit assumptions)
7. Timeline & Key Dates (When does it close? Inspection periods)
8. Critical Risks & Mitigants

Make it extremely detailed, quantitative, and analytical. Do not write a narrative essay. Write a structured fact-sheet with bullet points and clear data tables (using markdown).`;

const CLAUDE_WRITER_PROMPT = `You are a senior real estate investment analyst preparing a detailed deal summary memorandum.

You will be provided with an "Investment Fact-Sheet" prepared by a junior analyst who has parsed raw data.

Your job is to write a comprehensive, factual deal summary that accurately represents ALL the information available about this opportunity. Do NOT make investment recommendations or votes. Do NOT write persuasive "committee" language. Instead, synthesize and present the data in a clear, analytical, and professional format. Include interesting observations, comparisons, and assessments where the data supports them.

REQUIRED FORMAT:
You MUST output your response entirely in standard HTML format (do not use markdown). 
Use proper HTML tags like <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, and <table> for exhibits.
Make sure the tables are well-formatted with <thead>, <tbody>, <tr>, <th>, <td>. Add inline CSS styles to the tables to make them look professional (e.g., border-collapse, padding, subtle background colors for headers).

Structure the memo generally as follows (adapt based on available data):
- Deal Overview (name, address, asset class, stage, key metrics summary table)
- Site & Location Analysis
- Market & Demographic Profile (reference data rings, income, renter %, growth trends)
- Development Program & Zoning (proposed units, density, building configuration, efficiency)
- Financial Summary (total budget, cost/unit, NOI, YOC — present scenarios if multiple one-pagers exist)
- Competitive Market (summarize rent comp positioning, average rents, occupancy)
- Key Dates & Timeline (if available)
- Risk Considerations (factual observations about density, supply pipeline, cost assumptions)

IMPORTANT: Do NOT include a "Recommendation" or "Conclusion & Recommendation" section. End with "Risk Considerations" or a brief "Summary" that restates key metrics without advocating for or against the deal. The reader will form their own opinions.

Note: Interactive charts and data exhibits (maps, rent comps, financials) will be appended BELOW the memo text automatically by the application. You do NOT need to reproduce detailed comp tables or demographic ring tables — just reference them in your narrative (e.g., "See Exhibit B for detailed rent comp analysis").

Output ONLY valid HTML. Do not wrap it in a markdown fence like \`\`\`html. Start directly with <div> or <h1>.`;

// ────────────────────────── Route ──────────────────────────

export async function POST(request: Request) {
    const { response: authError } = await requireAuth();
    if (authError) return authError;

    if (!GEMINI_API_KEY || !CLAUDE_API_KEY) {
        return NextResponse.json(
            { error: 'Both GEMINI_API_KEY and CLAUDE_API_KEY must be configured in .env.local' },
            { status: 500 }
        );
    }

    try {
        // Bound the request body: the client used to upload the multi-MB map
        // blobs (drive_time_data / income_heatmap_data) only for this route to
        // delete them, and nothing stopped arbitrarily large payloads.
        const declaredLength = Number(request.headers.get('content-length') ?? 0);
        if (declaredLength > MAX_BODY_BYTES) {
            return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
        }
        const bodyText = await request.text();
        if (bodyText.length > MAX_BODY_BYTES) {
            return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
        }
        let payload: { pursuitData?: { id?: unknown } } & Record<string, unknown>;
        try {
            payload = JSON.parse(bodyText);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        if (!payload || typeof payload !== 'object') {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const rawPursuitId = payload?.pursuitData?.id; // UUID from the Database
        const pursuitId = typeof rawPursuitId === 'string' ? rawPursuitId : null;
        
        // --- 1. Aggregation / Context String ---
        // Strip out massive GeoJSON, coordinate arrays, and raw API responses that blow up the token count
        const cleanPayload = JSON.parse(JSON.stringify(payload));
        if (cleanPayload.pursuitData) {
            delete cleanPayload.pursuitData.parcel_data;
            delete cleanPayload.pursuitData.parcel_assemblage;
            delete cleanPayload.pursuitData.drive_time_data;
            delete cleanPayload.pursuitData.income_heatmap_data;
            // The AI doesn't need to read 10,000 sets of GPS coordinates.
        }
        
        // Strip raw Hellodata scraped HTTP responses from rent comps
        if (Array.isArray(cleanPayload.rentComps)) {
            cleanPayload.rentComps.forEach((comp: any) => {
                delete comp.raw_response;
                delete comp.occupancy_over_time; // huge arrays
            });
        }

        // Strip geometry from land comps
        if (Array.isArray(cleanPayload.landComps)) {
            cleanPayload.landComps.forEach((comp: any) => {
                delete comp.parcel_data;
            });
        }

        const rawJsonString = JSON.stringify(cleanPayload, null, 2);

        // --- 2. Model #1: Analyst (Gemini) ---
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        const geminiResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: GEMINI_ANALYST_PROMPT },
                        { text: "\n\nRAW PURSUIT DATA:\n" + rawJsonString }
                    ],
                },
            ],
            config: {
                temperature: 0.2,
                maxOutputTokens: 8000,
                abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
            },
        });

        const factSheet = geminiResponse.text || '';
        if (!factSheet) {
            return NextResponse.json({ error: 'Analyst pass returned no content' }, { status: 502 });
        }

        // --- 3. Model #2: Writer (Claude) ---
        // Claude Opus 5.5: thinking is always on (adaptive) and sampling params
        // like `temperature` are rejected, so depth is steered with effort.
        // max_tokens covers thinking + the HTML memo, so it has to be generous;
        // streaming keeps a long generation clear of HTTP timeouts.
        const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY, timeout: CLAUDE_TIMEOUT_MS, maxRetries: 1 });
        const claudeResponse = await anthropic.messages
            .stream({
                model: 'claude-opus-5-5',
                max_tokens: 32000,
                thinking: { type: 'adaptive' },
                output_config: { effort: 'medium' },
                system: CLAUDE_WRITER_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: `Here is the Investment Fact-Sheet:\n\n${factSheet}`
                    }
                ],
            })
            .finalMessage();

        if (claudeResponse.stop_reason === 'refusal') {
            return NextResponse.json({ error: 'The writer model declined to generate this memo' }, { status: 502 });
        }
        if (claudeResponse.stop_reason === 'max_tokens') {
            console.warn('[AI Memo] Memo hit max_tokens and may be truncated');
        }

        // With thinking on, content[0] is a thinking block, so join the text blocks.
        let htmlContent = claudeResponse.content
            .map((block) => (block.type === 'text' ? block.text : ''))
            .join('');

        // Clean up markdown fences if Claude ignored instructions
        // (the previous regex matched literal backslashes, so it never stripped anything)
        htmlContent = htmlContent.replace(/```html\s*/g, '').replace(/```/g, '').trim();
        if (!htmlContent) {
            return NextResponse.json({ error: 'Memo generation returned no content' }, { status: 502 });
        }

        // --- 3.5. Save to Supabase ---
        if (pursuitId) {
            const supabase = await createClient();
            const { error: dbError } = await supabase
                .from('pursuits')
                .update({ executive_memo: htmlContent })
                .eq('id', pursuitId);
            if (dbError) {
                console.error('[AI Memo] Failed to save to Supabase:', dbError);
            }
        }

        // --- 4. Return HTML Response ---
        return NextResponse.json({
            success: true,
            html: htmlContent
        });

    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'AI Memo', 'Failed to generate memo');
    }
}
