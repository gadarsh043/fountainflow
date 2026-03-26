import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:14b';

export interface ParsedNozzle {
  name: string;
  max_height_ft: number;
  position_x: number;
  position_y: number;
}

// Tested against the Maker Associates 100x30ft spec — this prompt reliably produces
// a bare JSON array with numeric positions when format:json is NOT set.
const SYSTEM_PROMPT = `You are a fountain engineering assistant.
Extract every nozzle / nozzle group from the provided fountain specification.
Return ONLY a JSON array — no wrapper object, no markdown, no explanation.
Start your response with [ and end with ].

Each element must have exactly these four fields (all values must be numbers, not strings):
{"name": string, "max_height_ft": number, "position_x": number, "position_y": number}

Height guidelines (convert meters→feet if needed: 1 m = 3.28 ft):
CENTER JET=60, High Jet=30, 12ft Ring Fountain=15, 10ft Ring Fountain=10,
Peacock Tail=15, Rising Sun=12, Butterfly/Moving Head=10, Organ Fountain=8,
Corner Jet=6, Mist Line=3, Water Screen=20, Revolving Fountain=10.

Position rules (fountain center = 0,0; X = width axis, Y = length axis):
- CENTER JET: x=0, y=0 always.
- If the input contains dimension numbers like 10'-5", 9'-7", 6'-5½", 14'-6" etc., these are
  SPACING measurements between nozzle columns along the fountain length.
  Add them cumulatively from one end to get each column's distance from that end.
  Then subtract half the total length to get center-relative Y coordinates.
  Example on an 85ft fountain with spacings [10.4, 9.6, 6.5, 14.5, 15.5, 6.5, 1]:
  cumulative from end: 0, 10.4, 20, 26.5, 41, 56.5, 63, 64 → subtract 42.5 for center-relative Y.
- CORNER JETs are at the far ends (y = ±half_length) and pool edges (x = ±half_width).
- MIST LINEs run along x-axis near the ends (y near ±half_length, x=0).
- HIGH JETs: spread in symmetric pairs along Y axis, alternating ±X offset.
- RING FOUNTAINs: pair symmetrically in the middle zone on opposite Y sides.
- Others: distribute symmetrically within the pool boundary.

Emit one JSON object per individual nozzle (not per group). If a spec says "24 High Jets",
emit 24 separate entries at evenly-spaced Y positions with alternating ±X.

Example output format:
[{"name":"Center Jet","max_height_ft":60,"position_x":0,"position_y":0},{"name":"Corner Jet","max_height_ft":6,"position_x":7,"position_y":42.5}]`;

/** Coerce a position value to a number (handles model returning strings like "outer edges") */
function coercePosition(val: unknown): number {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const { text } = (await req.json()) as { text?: string };

    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        system: SYSTEM_PROMPT,
        prompt: `Extract nozzle information. Return ONLY a JSON array:\n\n${text.slice(0, 8000)}`,
        stream: false,
        // NOTE: do NOT set format:"json" — it causes the model to return a single object
        // instead of an array. Let the model output freely, then extract the array with regex.
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      return NextResponse.json(
        { error: `Ollama error: ${ollamaRes.status} ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const ollamaData = (await ollamaRes.json()) as { response: string };
    const rawJson = ollamaData.response?.trim() ?? '';

    // Extract the outermost JSON array from the response
    const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'AI did not return a nozzle list. Try adding more detail to your document.', raw: rawJson.slice(0, 300) },
        { status: 422 },
      );
    }

    const raw = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;

    // Coerce and validate each nozzle
    const nozzles: ParsedNozzle[] = raw
      .filter((n) => typeof n.name === 'string' && n.name.trim())
      .map((n) => ({
        name: String(n.name).trim(),
        max_height_ft: coercePosition(n.max_height_ft) || 10,
        position_x: coercePosition(n.position_x),
        position_y: coercePosition(n.position_y),
      }))
      .filter((n) => n.max_height_ft > 0);

    return NextResponse.json({ nozzles });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
