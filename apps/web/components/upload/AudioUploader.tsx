'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, Music, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const ACCEPTED_AUDIO_TYPES = new Set([
  'audio/mpeg',        // .mp3
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
]);

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB

interface AudioUploaderProps {
  projectId: string;
  onUploadComplete: (s3Key: string) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

export function AudioUploader({ projectId, onUploadComplete }: AudioUploaderProps) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setError('');
    setFilename(file.name);
    setStatus('uploading');
    setProgress(0);

    if (!ACCEPTED_AUDIO_TYPES.has(file.type)) {
      setError(`Unsupported format: ${file.type || 'unknown'}. Use MP3, WAV, FLAC, OGG, or AAC.`);
      setStatus('error');
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 200 MB.`);
      setStatus('error');
      return;
    }

    try {
      // 1. Get presigned upload URL from the API
      const presignRes = await fetch('/api/storage/presigned-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type,
          project_id: projectId,
        }),
      });

      if (!presignRes.ok) {
        throw new Error('Failed to get upload URL. Please try again.');
      }

      const { upload_url, s3_key } = (await presignRes.json()) as {
        upload_url: string;
        s3_key: string;
      };

      // 2. Upload directly to S3/MinIO via presigned PUT — no server proxy for large files
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: HTTP ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('PUT', upload_url);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      setProgress(100);
      setStatus('done');
      onUploadComplete(s3_key);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setStatus('error');
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void uploadFile(file);
    },
    [projectId],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadFile(file);
    },
    [projectId],
  );

  function handleReset() {
    setStatus('idle');
    setProgress(0);
    setFilename('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  if (status === 'done') {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-6 flex items-center gap-4">
        <CheckCircle2 className="h-8 w-8 text-green-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-green-400">Upload complete</p>
          <p className="text-sm text-muted-foreground truncate mt-0.5">{filename}</p>
        </div>
        <button
          onClick={handleReset}
          className="text-muted-foreground hover:text-white transition-colors"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (status === 'uploading') {
    return (
      <div className="rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-3">
          <Loader2 className="h-5 w-5 animate-spin text-fountain-400" />
          <span className="text-sm font-medium truncate">{filename}</span>
          <span className="ml-auto text-sm text-muted-foreground">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-fountain-500 rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={[
          'rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all',
          isDragging
            ? 'border-fountain-400 bg-fountain-500/10'
            : 'border-border hover:border-fountain-500/50 hover:bg-secondary/30',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleInputChange}
        />

        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-fountain-500/20 flex items-center justify-center">
            {isDragging ? (
              <Music className="h-7 w-7 text-fountain-400" />
            ) : (
              <Upload className="h-7 w-7 text-fountain-400" />
            )}
          </div>

          <div>
            <p className="font-medium">
              {isDragging ? 'Drop your audio file here' : 'Upload audio file'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Drag & drop or click to browse — MP3, WAV, FLAC, OGG, AAC up to 200 MB
            </p>
          </div>
        </div>
      </div>

      {status === 'error' && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
