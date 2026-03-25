'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Download, Loader2, CheckCircle2, AlertCircle, Music, Waves } from 'lucide-react';

// Lazy-load the 3D scene to avoid SSR issues
const FountainScene = dynamic(
  () => import('@/components/fountain-3d/FountainScene').then((m) => m.FountainScene),
  { ssr: false, loading: () => <SimulationSkeleton /> }
);

interface Job {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stage?: string;
  progress_pct: number;
  code_package_key?: string;
  timeline_key?: string;
  simulation_data_key?: string;
  error_message?: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
  fountain_config: Record<string, unknown>;
  jobs: Job[];
}

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  downloading: 'Downloading audio…',
  converting: 'Converting to WAV…',
  analyzing_beats: 'Detecting beats (madmom RNN)…',
  analyzing_sections: 'Segmenting sections (MSAF)…',
  analyzing_energy: 'Analyzing frequency bands…',
  detecting_boundaries: 'Detecting song boundaries…',
  generating_choreography: 'Generating choreography…',
  generating_code: 'Generating control code…',
  packaging: 'Packaging files…',
  uploading: 'Uploading results…',
  completed: 'Complete',
  failed: 'Failed',
};

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [latestJob, setLatestJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulationData, setSimulationData] = useState<unknown>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetchProject();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [id]);

  async function fetchProject() {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Failed to fetch project');
      const data = (await res.json()) as Project;
      setProject(data);

      const job = data.jobs[data.jobs.length - 1] ?? null;
      setLatestJob(job);

      if (job?.status === 'processing' || job?.status === 'pending') {
        pollRef.current = setTimeout(() => { void pollJob(job.job_id); }, 2000);
      }

      const simKey = job?.simulation_data_key ?? job?.timeline_key;
      if (job?.status === 'completed' && simKey) {
        void fetchSimulationData(simKey);
      }
    } finally {
      setLoading(false);
    }
  }

  async function pollJob(jobId: string) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const job = (await res.json()) as Job;
      setLatestJob(job);

      if (job.status === 'processing' || job.status === 'pending') {
        pollRef.current = setTimeout(() => { void pollJob(jobId); }, 2000);
      } else if (job.status === 'completed') {
        const simKey = job.simulation_data_key ?? job.timeline_key;
        if (simKey) void fetchSimulationData(simKey);
      }
    } catch {
      pollRef.current = setTimeout(() => { void pollJob(jobId); }, 5000);
    }
  }

  async function fetchSimulationData(key: string) {
    try {
      const urlRes = await fetch(`/api/storage/download/${encodeURIComponent(key)}`);
      if (!urlRes.ok) return;
      const { download_url } = (await urlRes.json()) as { download_url: string };
      const dataRes = await fetch(download_url);
      const data: unknown = await dataRes.json();
      setSimulationData(data);
    } catch {
      // Simulation data optional — show falls back gracefully
    }
  }

  async function handleDownload(key: string, filename: string) {
    const res = await fetch(`/api/storage/download/${encodeURIComponent(key)}`);
    if (!res.ok) return;
    const { download_url } = (await res.json()) as { download_url: string };
    const a = document.createElement('a');
    a.href = download_url;
    a.download = filename;
    a.click();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-fountain-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container py-12 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const isProcessing = latestJob?.status === 'processing' || latestJob?.status === 'pending';
  const isCompleted = latestJob?.status === 'completed';
  const isFailed = latestJob?.status === 'failed';

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {latestJob ? `Job ${latestJob.job_id.slice(0, 8)}…` : 'No jobs yet'}
          </p>
        </div>
      </div>

      {/* Processing status */}
      {isProcessing && latestJob && (
        <div className="glass rounded-xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-fountain-400" />
            <span className="font-medium">
              {STAGE_LABELS[latestJob.stage ?? ''] ?? 'Processing…'}
            </span>
            <span className="ml-auto text-sm text-muted-foreground">
              {latestJob.progress_pct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-fountain-500 rounded-full transition-all duration-500"
              style={{ width: `${latestJob.progress_pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 mb-8">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div>
              <p className="font-medium text-red-400">Processing failed</p>
              <p className="text-sm text-muted-foreground mt-1">
                {latestJob?.error_message ?? 'An unknown error occurred.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3D Simulation */}
      {isCompleted && (
        <>
          <div className="rounded-xl overflow-hidden border border-border mb-8 bg-black" style={{ height: 480 }}>
            <FountainScene
              fountainConfig={project.fountain_config}
              simulationData={simulationData}
              audioUrl={audioUrl}
            />
          </div>

          {/* Download buttons */}
          <div className="glass rounded-xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              Generated Files
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {latestJob?.code_package_key && (
                <DownloadButton
                  label="Control Code (.zip)"
                  description="Arduino / DMX / JSON files"
                  icon="🗜️"
                  onClick={() => void handleDownload(latestJob.code_package_key!, 'fountain_code.zip')}
                />
              )}
              {latestJob?.timeline_key && (
                <DownloadButton
                  label="JSON Timeline"
                  description="Keyframed show timeline"
                  icon="{}"
                  onClick={() => void handleDownload(latestJob.timeline_key!, 'timeline.json')}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* No job yet — show upload CTA */}
      {!latestJob && (
        <div className="glass rounded-xl p-12 text-center">
          <Music className="mx-auto mb-4 h-12 w-12 text-fountain-400" />
          <h2 className="text-xl font-semibold mb-2">Upload a song to get started</h2>
          <p className="text-muted-foreground mb-6">
            Upload an audio file and the system will generate fountain choreography automatically.
          </p>
        </div>
      )}
    </div>
  );
}

function DownloadButton({
  label,
  description,
  icon,
  onClick,
}: {
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-fountain-500/40 hover:bg-secondary/50 transition-all group"
    >
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium group-hover:text-fountain-400 transition-colors">
          {label}
        </p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function SimulationSkeleton() {
  return (
    <div className="flex items-center justify-center h-full bg-black/80">
      <div className="flex flex-col items-center gap-3">
        <Waves className="h-10 w-10 text-fountain-400 animate-pulse" />
        <span className="text-sm text-muted-foreground">Loading 3D simulation…</span>
      </div>
    </div>
  );
}
