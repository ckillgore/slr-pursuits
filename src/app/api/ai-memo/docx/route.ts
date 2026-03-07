import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/app/api/_lib/auth';
import { createClient } from '@/lib/supabase/server';
import HTMLtoDOCX from 'html-to-docx';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY; // The user said Gemini and Claude API keys are in .env.local

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

const CLAUDE_WRITER_PROMPT = `You are a Senior Partner at a top-tier institutional real estate private equity firm.
You are writing a highly persuasive, institutional-quality Investment Committee (IC) Memo for a multifamily development opportunity.

You will be provided with an "Investment Fact-Sheet" prepared by your analyst.

Your job is to draft the final IC Memo based on this data. The memo must be elegant, professional, highly analytical, and structured beautifully.
It should be comprehensive and make a clear case (while acknowledging risks).

REQUIRED FORMAT:
You MUST output your response entirely in standard HTML format (do not use markdown). 
Use proper HTML tags like <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, and <table> for beautiful exhibits.
Make sure the tables are well-formatted with <thead>, <tbody>, <tr>, <th>, <td>. Add inline CSS styles to the tables to make them look professional (e.g., border-collapse, padding, subtle background colors for headers).

Structure the memo generally as follows (though you may adapt based on the data):
- Executive Summary
- Site & Location Overview
- Market & Demographic Fundamentals
- Proposed Development & Zoning
- Financial Underwriting & Feasibility 
- Competitive Comps (Rents & Sales)
- Execution Timeline
- Risk Factors & Mitigants
- Conclusion & Recommendation

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
        const payload = await request.json();
        const pursuitId = payload.pursuitData?.id; // UUID from the Database
        
        // --- 1. Aggregation / Context String ---
        const rawJsonString = JSON.stringify(payload, null, 2);

        // --- 2. Model #1: Analyst (Gemini) ---
        console.log('[AI Memo] Pass 1: Gemini Analyst analyzing %d chars of raw data...', rawJsonString.length);
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        const geminiResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: GEMINI_ANALYST_PROMPT },
                        { text: "\\n\\nRAW PURSUIT DATA:\\n" + rawJsonString }
                    ],
                },
            ],
            config: {
                temperature: 0.2,
                maxOutputTokens: 8000,
            },
        });

        const factSheet = geminiResponse.text || '';
        console.log('[AI Memo] Pass 1 complete. Fact-sheet length: %d chars', factSheet.length);

        // --- 3. Model #2: Writer (Claude) ---
        console.log('[AI Memo] Pass 2: Claude generating Memo HTML...');
        const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });
        const claudeResponse = await anthropic.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 4000,
            system: CLAUDE_WRITER_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: \`Here is the Investment Fact-Sheet:\\n\\n\${factSheet}\`
                }
            ],
            temperature: 0.3,
        });

        let htmlContent = '';
        if (claudeResponse.content[0].type === 'text') {
            htmlContent = claudeResponse.content[0].text;
        }

        // Clean up markdown fences if Claude ignored instructions
        htmlContent = htmlContent.replace(/\\`\\`\\`html\\n/g, '').replace(/\\`\\`\\`/g, '').trim();
        console.log('[AI Memo] Pass 2 complete. HTML length: %d chars', htmlContent.length);

        // --- 3.5. Save to Supabase ---
        if (pursuitId) {
            console.log('[AI Memo] Saving HTML to Supabase executive_memo column...');
            const supabase = await createClient();
            const { error: dbError } = await supabase
                .from('pursuits')
                .update({ executive_memo: htmlContent })
                .eq('id', pursuitId);
            if (dbError) {
                console.error('[AI Memo] Failed to save to Supabase:', dbError);
            }
        }

        // --- 4. Convert HTML to DOCX ---
        console.log('[AI Memo] Pass 3: Converting HTML to DOCX...');
        
        // Wrap with some basic styling for docx conversion if needed
        const fullHtml = \`
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <title>Investment Memo</title>
                </head>
                <body style="font-family: Arial, sans-serif;">
                    \${htmlContent}
                </body>
            </html>
        \`;

        const fileBuffer = await HTMLtoDOCX(fullHtml, null, {
            table: { row: { cantSplit: true } },
            footer: true,
            pageNumber: true,
        });

        // --- 5. Return the DOCX buffer ---
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': 'attachment; filename="Investment_Memo.docx"',
            },
        });

    } catch (err: any) {
        console.error('[AI Memo] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to generate memo' },
            { status: 500 }
        );
    }
}
