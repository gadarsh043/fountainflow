'use client';

import { useState } from 'react';
import { FileUp, Loader2, CheckCircle2, X } from 'lucide-react';
import type { ParsedNozzle } from '@/app/api/ai/parse-fountain/route';

interface PdfImportButtonProps {
  onImport: (nozzles: ParsedNozzle[]) => void;
}

/**
 * Extract text from a PDF via the server-side API route.
 * The server uses pymupdf (already installed in the worker venv) — no webpack issues.
 */
async function extractPdfText(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('pdf', file);
  const res = await fetch('/api/ai/extract-pdf', { method: 'POST', body: formData });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || !data.text) throw new Error(data.error ?? 'Failed to extract PDF text');
  return data.text;
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

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractPdfText(file);
  if (name.endsWith('.docx')) return extractDocxText(file);
  throw new Error(`Unsupported file type: ${file.name}`);
}

export function PdfImportButton({ onImport }: PdfImportButtonProps) {
  const [status, setStatus] = useState<'idle' | 'extracting' | 'parsing' | 'review' | 'error'>('idle');
  const [statusLabel, setStatusLabel] = useState('');
  const [error, setError] = useState('');
  const [nozzles, setNozzles] = useState<ParsedNozzle[]>([]);

  async function handleFiles(files: FileList | File[]) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    setError('');

    try {
      // Step 1: Extract text from all files
      setStatus('extracting');
      const textParts: string[] = [];
      for (const file of fileArr) {
        setStatusLabel(`Reading ${file.name}…`);
        const text = await extractText(file);
        if (text.trim()) textParts.push(`=== ${file.name} ===\n${text}`);
      }

      const combinedText = textParts.join('\n\n');
      if (!combinedText.trim()) {
        throw new Error('Could not extract text from the uploaded files. PDFs may be image-only — try uploading the specification document (.docx) instead.');
      }

      // Step 2: Send to AI
      setStatus('parsing');
      setStatusLabel('AI is analysing nozzle layout…');
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
  }

  if (status === 'review') {
    return (
      <div className="rounded-xl border border-fountain-500/30 bg-fountain-500/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-fountain-400">
            AI extracted {nozzles.length} nozzle{nozzles.length !== 1 ? 's' : ''} — edit if needed, then confirm
          </p>
          <button onClick={() => setStatus('idle')} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
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
                <tr key={i} className="group hover:bg-secondary/20">
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

        <p className="text-xs text-muted-foreground">
          Positions are in feet from the fountain center. X = left/right, Y = front/back.
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
