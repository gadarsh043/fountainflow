'use client';

import { useState, useEffect, useRef } from 'react';
import { FileUp, Loader2, CheckCircle2, X } from 'lucide-react';
import type { ParsedNozzle } from '@/app/api/ai/parse-fountain/route';

interface PdfImportButtonProps {
  onImport: (nozzles: ParsedNozzle[]) => void;
}

const PARSING_MESSAGES = [
  'AI is analysing nozzle layout…',
  'Reading blueprint measurements…',
  'Identifying nozzle types…',
  'Calculating positions from dimensions…',
  'Building nozzle layout…',
];

/** SVG overlay showing nozzle dots on top of the blueprint image */
function NozzleOverlay({
  nozzles,
  hoveredIndex,
}: {
  nozzles: ParsedNozzle[];
  hoveredIndex: number | null;
}) {
  const maxExt = Math.max(
    ...nozzles.flatMap((n) => [Math.abs(n.position_x), Math.abs(n.position_y)]),
    10,
  );
  // viewBox 0 0 100 100, center at (50, 50). 45 = usable radius (leaves 5px margin).
  const toSVG = (x: number, y: number) => ({
    cx: 50 + (x / maxExt) * 45,
    cy: 50 - (y / maxExt) * 45, // flip Y: SVG y goes down, fountain y goes up
  });

  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
      {/* Center crosshair */}
      <line x1="50" y1="2" x2="50" y2="98" stroke="#185FA5" strokeWidth="0.3" opacity="0.35" />
      <line x1="2" y1="50" x2="98" y2="50" stroke="#185FA5" strokeWidth="0.3" opacity="0.35" />
      {/* Nozzle dots */}
      {nozzles.map((n, i) => {
        const { cx, cy } = toSVG(n.position_x, n.position_y);
        const isHovered = hoveredIndex === i;
        return (
          <g key={i}>
            {isHovered && (
              <circle cx={cx} cy={cy} r="5" fill="#D85A30" opacity="0.25" />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={isHovered ? 2.8 : 2.2}
              fill={isHovered ? '#D85A30' : '#185FA5'}
              stroke="white"
              strokeWidth="0.6"
              opacity="0.92"
            >
              <title>{n.name} (x={n.position_x}, y={n.position_y})</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Extract text + preview image from a PDF via the server-side API route.
 * The server uses pymupdf + tesseract OCR — no webpack issues.
 */
async function extractPdfText(file: File): Promise<{ text: string; previewImage: string }> {
  const formData = new FormData();
  formData.append('pdf', file);
  const res = await fetch('/api/ai/extract-pdf', { method: 'POST', body: formData });
  const data = (await res.json()) as { text?: string; preview_image?: string; error?: string };
  if (!res.ok || !data.text) throw new Error(data.error ?? 'Failed to extract PDF text');
  return { text: data.text, previewImage: data.preview_image ?? '' };
}

/** Extract text from a DOCX file using mammoth in the browser */
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (await import('mammoth')) as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const result = await mammoth.extractRawText({ arrayBuffer });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return (result.value as string) ?? '';
}

export function PdfImportButton({ onImport }: PdfImportButtonProps) {
  const [status, setStatus] = useState<'idle' | 'extracting' | 'parsing' | 'review' | 'error'>('idle');
  const [statusLabel, setStatusLabel] = useState('');
  const [error, setError] = useState('');
  const [nozzles, setNozzles] = useState<ParsedNozzle[]>([]);
  const [previewImage, setPreviewImage] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const parsingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle through status messages during the AI parsing phase
  useEffect(() => {
    if (status === 'parsing') {
      let i = 0;
      parsingIntervalRef.current = setInterval(() => {
        i = (i + 1) % PARSING_MESSAGES.length;
        setStatusLabel(PARSING_MESSAGES[i]);
      }, 7000);
    } else {
      if (parsingIntervalRef.current) {
        clearInterval(parsingIntervalRef.current);
        parsingIntervalRef.current = null;
      }
    }
    return () => {
      if (parsingIntervalRef.current) clearInterval(parsingIntervalRef.current);
    };
  }, [status]);

  async function handleFiles(files: FileList | File[]) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    setError('');
    setPreviewImage('');

    try {
      // Step 1: Extract text (and preview image for PDFs) from all files
      setStatus('extracting');
      const textParts: string[] = [];
      for (const file of fileArr) {
        setStatusLabel(`Reading ${file.name}…`);
        const name = file.name.toLowerCase();
        if (name.endsWith('.pdf')) {
          const { text, previewImage: img } = await extractPdfText(file);
          if (text.trim()) textParts.push(`=== ${file.name} ===\n${text}`);
          if (img && !previewImage) setPreviewImage(img);
        } else if (name.endsWith('.docx')) {
          const text = await extractDocxText(file);
          if (text.trim()) textParts.push(`=== ${file.name} ===\n${text}`);
        } else {
          throw new Error(`Unsupported file type: ${file.name}`);
        }
      }

      const combinedText = textParts.join('\n\n');
      if (!combinedText.trim()) {
        throw new Error('Could not extract text from the uploaded files. PDFs may be image-only — try uploading the specification document (.docx) instead.');
      }

      // Step 2: Send to AI
      setStatus('parsing');
      setStatusLabel(PARSING_MESSAGES[0]);
      const res = await fetch('/api/ai/parse-fountain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combinedText }),
      });

      const data = (await res.json()) as { nozzles?: ParsedNozzle[]; error?: string };
      if (!res.ok || !data.nozzles) throw new Error(data.error ?? 'Failed to parse');

      setNozzles(data.nozzles);
      setStatus('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse files');
      setStatus('error');
    }
  }

  function updateNozzle(index: number, field: keyof ParsedNozzle, value: string) {
    setNozzles((prev) =>
      prev.map((n, i) =>
        i === index
          ? { ...n, [field]: field === 'name' ? value : parseFloat(value) || 0 }
          : n,
      ),
    );
  }

  function removeNozzle(index: number) {
    setNozzles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm() {
    onImport(nozzles);
    setStatus('idle');
    setNozzles([]);
    setPreviewImage('');
  }

  if (status === 'review') {
    return (
      <div className="rounded-xl border border-fountain-500/30 bg-fountain-500/5 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-fountain-400">
            AI extracted {nozzles.length} nozzle{nozzles.length !== 1 ? 's' : ''} — edit if needed, then confirm
          </p>
          <button onClick={() => setStatus('idle')} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Two-column: table left, blueprint preview right */}
        <div className="flex flex-col sm:flex-row gap-3 items-start">
          {/* Editable table */}
          <div className="flex-1 overflow-x-auto rounded-lg border border-border min-w-0">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40">
                <tr className="text-muted-foreground">
                  <th className="text-left p-2 font-medium">Name</th>
                  <th className="text-left p-2 font-medium">Height (ft)</th>
                  <th className="text-left p-2 font-medium">X (ft)</th>
                  <th className="text-left p-2 font-medium">Y (ft)</th>
                  <th className="p-2 w-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {nozzles.map((n, i) => (
                  <tr
                    key={i}
                    className="group hover:bg-secondary/20 cursor-default"
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <td className="p-2">
                      <input
                        value={n.name}
                        onChange={(e) => updateNozzle(i, 'name', e.target.value)}
                        className="w-full bg-transparent focus:outline-none focus:ring-1 focus:ring-fountain-500 rounded px-1"
                      />
                    </td>
                    <td className="p-2">
                      <input type="number" value={n.max_height_ft}
                        onChange={(e) => updateNozzle(i, 'max_height_ft', e.target.value)}
                        className="w-16 bg-transparent focus:outline-none focus:ring-1 focus:ring-fountain-500 rounded px-1"
                      />
                    </td>
                    <td className="p-2">
                      <input type="number" value={n.position_x}
                        onChange={(e) => updateNozzle(i, 'position_x', e.target.value)}
                        className="w-14 bg-transparent focus:outline-none focus:ring-1 focus:ring-fountain-500 rounded px-1"
                      />
                    </td>
                    <td className="p-2">
                      <input type="number" value={n.position_y}
                        onChange={(e) => updateNozzle(i, 'position_y', e.target.value)}
                        className="w-14 bg-transparent focus:outline-none focus:ring-1 focus:ring-fountain-500 rounded px-1"
                      />
                    </td>
                    <td className="p-2">
                      <button onClick={() => removeNozzle(i)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all">
                        <X className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Blueprint image with SVG dot overlay (desktop only) */}
          {previewImage && (
            <div className="hidden sm:block shrink-0 w-[260px] rounded-lg overflow-hidden border border-border/60 relative bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${previewImage}`}
                alt="Blueprint preview"
                className="w-full block opacity-50"
              />
              <NozzleOverlay nozzles={nozzles} hoveredIndex={hoveredIndex} />
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Positions are in feet from the fountain center. X = left/right, Y = front/back.
          {previewImage && ' Hover a row to highlight its dot on the blueprint.'}
        </p>

        <div className="flex gap-2">
          <button onClick={handleConfirm} disabled={nozzles.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-fountain-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-fountain-400 disabled:opacity-40 transition-colors">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Use these {nozzles.length} nozzles
          </button>
          <button onClick={() => setStatus('idle')}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const isLoading = status === 'extracting' || status === 'parsing';

  return (
    <div className="space-y-2">
      <label className={[
        'flex items-center justify-center gap-2 rounded-lg border border-dashed border-border',
        'px-4 py-2.5 text-sm text-muted-foreground w-full cursor-pointer',
        'hover:border-fountain-500/50 hover:text-fountain-400 transition-all',
        isLoading ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}>
        {isLoading ? (
          <><Loader2 className="h-4 w-4 animate-spin" />{statusLabel}</>
        ) : (
          <>
            <FileUp className="h-4 w-4" />
            Import from PDF / DOCX blueprint
            <span className="ml-1 text-xs opacity-60">(AI-powered · multi-file)</span>
          </>
        )}
        <input type="file" accept=".pdf,.docx" multiple className="sr-only" disabled={isLoading}
          onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files); e.target.value = ''; }}
        />
      </label>

      {/* Tips */}
      {status === 'idle' && (
        <p className="text-xs text-muted-foreground px-1">
          Tip: Upload both the blueprint (.pdf) and the spec sheet (.docx) together for best results.
          The blueprint provides positions; the spec sheet provides equipment quantities.
        </p>
      )}

      {status === 'error' && (
        <p className="text-xs text-red-400 flex items-start gap-1">
          <X className="h-3 w-3 mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
