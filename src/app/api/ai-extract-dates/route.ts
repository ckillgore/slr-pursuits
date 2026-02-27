import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are a real estate contract analyst. Extract all important dates and deadlines from the provided Purchase and Sale Agreement (PSA) or real estate contract.

For each date found, return a JSON object with:
- "label": A short descriptive name for the date/deadline
- "matched_type": One of these standard types if applicable, or "custom" if none match:
  "Contract Execution", "Earnest Money Due", "Option Period Expiry", "Inspection Period End",
  "Financing Contingency", "Title Commitment Due", "Survey Due", "Closing Date",
  "Extension Deadline", "Notice Deadline"
- "date_value": The date in YYYY-MM-DD format. If a relative date (e.g., "30 days after execution"),
  calculate from any reference dates found. If you cannot determine an absolute date, use null.
- "contract_reference": The specific section, paragraph, or page reference (e.g., "Section 4.1(a), Page 12")
- "confidence": A number from 0 to 1 indicating your confidence in the extraction
- "context_snippet": A brief quote (max 100 chars) from the contract showing the relevant text

Return ONLY a JSON array of date objects. No markdown, no explanation. If no dates are found, return [].

Important rules:
- Extract ALL dates, even if you're uncertain — flag low confidence appropriately
- For conditional dates ("within X days of Y"), calculate if a reference date exists
- Include both explicit dates and deadline-based dates
- Capture multiple earnest money deposit dates if present
- Note any extension provisions with their deadlines`;

export async function POST(request: Request) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.type !== 'application/pdf') {
            return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
        }

        // Convert file to base64
        const bytes = await file.arrayBuffer();
        const base64Data = Buffer.from(bytes).toString('base64');

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview',
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                mimeType: 'application/pdf',
                                data: base64Data,
                            },
                        },
                        {
                            text: SYSTEM_PROMPT,
                        },
                    ],
                },
            ],
            config: {
                maxOutputTokens: 8000,
                temperature: 0.1,
            },
        });

        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        // Parse JSON from the response
        let dates: any[] = [];
        try {
            // Strip any markdown code fences if present
            const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            dates = JSON.parse(cleaned);
        } catch {
            // Try to find JSON array in the response
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    dates = JSON.parse(match[0]);
                } catch {
                    return NextResponse.json({
                        error: 'Could not parse AI response',
                        rawResponse: text.substring(0, 500),
                    }, { status: 422 });
                }
            }
        }

        // Validate and normalize results
        const normalized = dates
            .filter((d: any) => d && typeof d === 'object')
            .map((d: any) => ({
                label: String(d.label || 'Unknown'),
                matched_type: String(d.matched_type || 'custom'),
                date_value: d.date_value || null,
                contract_reference: d.contract_reference || null,
                confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
                context_snippet: d.context_snippet || null,
            }));

        return NextResponse.json({ dates: normalized });
    } catch (err: any) {
        console.error('AI extract dates error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to extract dates' },
            { status: 500 }
        );
    }
}
