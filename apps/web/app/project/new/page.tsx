'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfigWizard } from '@/components/config-wizard/ConfigWizard';
import { AudioUploader } from '@/components/upload/AudioUploader';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import type { FountainConfig } from '@fountainflow/shared';

type Step = 'config' | 'upload' | 'submit';

const STEPS: { id: Step; label: string }[] = [
  { id: 'config', label: 'Fountain Config' },
  { id: 'upload', label: 'Upload Song' },
  { id: 'submit', label: 'Generate' },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('config');
  const [projectName, setProjectName] = useState('');
  const [fountainConfig, setFountainConfig] = useState<FountainConfig | null>(null);
  const [audioFileKey, setAudioFileKey] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  async function handleConfigComplete(config: FountainConfig, name: string) {
    setFountainConfig(config);
    setProjectName(name);
    setError(null);

    // Create the project
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, fountain_config: config }),
      });

      const data = (await res.json()) as {
        id?: string;
        message?: string;
        errors?: Array<{ field: string; message: string }>;
      };

      if (!res.ok) {
        if (data.errors?.length) {
          const msgs = data.errors.map((e) => `${e.field}: ${e.message}`).join(' · ');
          throw new Error(msgs);
        }
        throw new Error(data.message ?? 'Failed to create project');
      }

      setProjectId(data.id!);
      setCurrentStep('upload');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    }
  }

  function handleUploadComplete(key: string) {
    setAudioFileKey(key);
    setCurrentStep('submit');
  }

  async function handleSubmit() {
    if (!projectId || !audioFileKey || !fountainConfig) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          audio_file_key: audioFileKey,
          target_platforms: [fountainConfig.target_platform, 'json_timeline'],
          use_ai_refinement: false,
        }),
      });
      if (!res.ok) throw new Error('Failed to submit job');
      router.push(`/project/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit job');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="text-2xl font-bold mb-2">New Project</h1>
      <p className="text-muted-foreground mb-8">
        Configure your fountain and upload a song to generate choreography.
      </p>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-10">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                index < stepIndex
                  ? 'bg-fountain-500 text-white'
                  : index === stepIndex
                  ? 'bg-fountain-500/20 border border-fountain-500/50 text-fountain-400'
                  : 'bg-secondary text-muted-foreground'
              }`}
            >
              {index < stepIndex ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
            </div>
            <span
              className={`text-sm hidden sm:inline ${
                index === stepIndex ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Step content */}
      {currentStep === 'config' && (
        <ConfigWizard onComplete={handleConfigComplete} />
      )}

      {currentStep === 'upload' && projectId && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Upload Your Song</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Upload an MP3 or WAV file (up to 200 MB). The audio is processed server-side
            using beat tracking and frequency analysis.
          </p>
          <AudioUploader
            projectId={projectId}
            onUploadComplete={handleUploadComplete}
          />
        </div>
      )}

      {currentStep === 'submit' && (
        <div className="glass rounded-xl p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-400" />
          <h2 className="text-xl font-semibold mb-2">Ready to Generate</h2>
          <p className="text-muted-foreground mb-2">
            <strong className="text-foreground">{projectName}</strong>
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Your fountain config and audio file are ready. Click below to start the
            choreography generation pipeline. This typically takes 1–3 minutes.
          </p>
          <button
            onClick={() => { void handleSubmit(); }}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-fountain-500 px-8 py-3 text-sm font-semibold text-white hover:bg-fountain-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </>
            ) : (
              'Generate Choreography'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
