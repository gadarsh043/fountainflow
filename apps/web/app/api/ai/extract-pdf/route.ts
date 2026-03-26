import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const PYTHON = join(process.cwd(), '../../apps/worker/venv/bin/python3');

// Extracts text from a PDF.
// For text PDFs: returns the embedded text directly.
// For image-only PDFs (e.g. CAD blueprints): extracts each embedded JPEG at native
// resolution, rotates to landscape, and runs tesseract OCR at 0° and 180° to capture
// labels on both sides of the fountain pool centerline.
const EXTRACT_SCRIPT = `
import sys, fitz, json, io, subprocess, tempfile, os
from PIL import Image

path = sys.argv[1]
doc = fitz.open(path)

# --- Step 1: try embedded text ---
pages_text = []
for page in doc:
    pages_text.append(page.get_text().strip())
text = "\\n".join(pages_text).strip()
if text:
    print(json.dumps({"text": text, "pages": len(doc)}))
    sys.exit(0)

# --- Step 2: image-only PDF — OCR each embedded image ---
def ocr_image(img, angle):
    """Run tesseract on a PIL Image at the given rotation angle."""
    rotated = img.rotate(angle, expand=True)
    # Resize to max 2500px on the long side for good OCR speed/quality
    max_px = 2500
    w, h = rotated.size
    if max(w, h) > max_px:
        scale = max_px / max(w, h)
        rotated = rotated.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
        tmp = tf.name
    try:
        rotated.save(tmp, "JPEG", quality=90)
        result = subprocess.run(
            ["tesseract", tmp, "stdout", "-l", "eng", "--psm", "11"],
            capture_output=True, text=True, timeout=30
        )
        return result.stdout.strip()
    finally:
        os.unlink(tmp)

ocr_parts = []
seen_xrefs = set()

for page in doc:
    img_list = page.get_images(full=True)
    for img_info in img_list:
        xref = img_info[0]
        if xref in seen_xrefs:
            continue
        seen_xrefs.add(xref)
        try:
            info = doc.extract_image(xref)
            img = Image.open(io.BytesIO(info["image"])).convert("RGB")
            # Portrait images are likely rotated blueprints — rotate to landscape
            w, h = img.size
            if h > w:
                img = img.rotate(-90, expand=True)
            # OCR at 0° (for top-side labels and dimension numbers)
            t0 = ocr_image(img, 0)
            # OCR at 180° (for bottom-side labels in landscape CAD drawings)
            t180 = ocr_image(img, 180)
            combined = t0 + "\\n" + t180
            if combined.strip():
                ocr_parts.append(combined)
        except Exception:
            pass

if not ocr_parts:
    # Fallback: render page at 300 DPI and OCR
    for page in doc:
        mat = fitz.Matrix(300/72, 300/72)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        t0 = ocr_image(img, 0)
        t180 = ocr_image(img, 180)
        combined = t0 + "\\n" + t180
        if combined.strip():
            ocr_parts.append(combined)

all_text = "\\n\\n".join(ocr_parts)
print(json.dumps({"text": all_text, "pages": len(doc)}))
`;

export async function POST(req: NextRequest) {
  const tmpPath = join(tmpdir(), `ff_pdf_${Date.now()}.pdf`);

  try {
    const formData = await req.formData();
    const file = formData.get('pdf');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, buffer);

    const { stdout } = await execFileAsync(PYTHON, ['-c', EXTRACT_SCRIPT, tmpPath], {
      timeout: 120_000,
    });

    const result = JSON.parse(stdout) as { text: string; pages: number };

    if (!result.text.trim()) {
      return NextResponse.json(
        { error: 'Could not extract any text from this PDF. Try uploading the spec document (.docx) alongside it.' },
        { status: 422 },
      );
    }

    return NextResponse.json({ text: result.text, pages: result.pages, source: 'ocr' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to extract PDF';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await unlink(tmpPath).catch(() => null);
  }
}
