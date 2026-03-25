'use client';

import { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { FOUNTAIN_PRESETS, type FountainPreset, type TargetPlatform, type FountainConfig } from '@fountainflow/shared';
import { PresetSelector } from './PresetSelector';
import { PlatformSelector } from './PlatformSelector';
import { NozzleForm } from './NozzleForm';

interface Nozzle {
  id: string;
  type: string;
  position_x: number;
  position_y: number;
  max_height_ft: number;
}

interface ConfigWizardProps {
  /** Called when the user completes all config steps. Page is responsible for project creation. */
  onComplete: (config: FountainConfig, name: string) => void;
}

type Step = 'preset' | 'nozzles' | 'platform' | 'name';

const STEPS: Step[] = ['preset', 'nozzles', 'platform', 'name'];
const STEP_LABELS: Record<Step, string> = {
  preset: 'Choose a preset',
  nozzles: 'Configure nozzles',
  platform: 'Target platform',
  name: 'Project name',
};

export function ConfigWizard({ onComplete }: ConfigWizardProps) {
  const [step, setStep] = useState<Step>('preset');
  const [selectedPreset, setSelectedPreset] = useState<FountainPreset | null>(null);
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [platforms, setPlatforms] = useState<TargetPlatform[]>(['arduino_mega']);
  const [projectName, setProjectName] = useState('');

  const stepIndex = STEPS.indexOf(step);

  function applyPreset(preset: FountainPreset | null) {
    setSelectedPreset(preset);
    if (preset && FOUNTAIN_PRESETS[preset]) {
      const config = FOUNTAIN_PRESETS[preset];
      const configNozzles = (config as Record<string, unknown>)?.nozzles as Nozzle[] | undefined;
      setNozzles(configNozzles ?? []);
    }
  }

  function canAdvance() {
    if (step === 'preset') return true;
    if (step === 'nozzles') return nozzles.length > 0;
    if (step === 'platform') return platforms.length > 0;
    if (step === 'name') return projectName.trim().length >= 2;
    return true;
  }

  function advance() {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  }

  function back() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function handleSubmit() {
    if (!canAdvance()) return;

    const baseConfig = selectedPreset && FOUNTAIN_PRESETS[selectedPreset]
      ? FOUNTAIN_PRESETS[selectedPreset]
      : {
          id: 'custom',
          name: projectName,
          dimensions: { width_ft: 50, length_ft: 30, depth_ft: 3 },
          pumps: [],
          valves: [],
          leds: { count: 0 },
        };

    const fountainConfig: FountainConfig = {
      ...(baseConfig as FountainConfig),
      nozzles: nozzles as FountainConfig['nozzles'],
      target_platform: platforms[0] ?? 'arduino_mega',
    };

    onComplete(fountainConfig, projectName.trim());
  }

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={[
                'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                i < stepIndex
                  ? 'bg-fountain-500 text-white'
                  : i === stepIndex
                    ? 'bg-fountain-500 text-white ring-2 ring-fountain-500/30 ring-offset-2 ring-offset-background'
                    : 'bg-secondary text-muted-foreground',
              ].join(' ')}
            >
              {i < stepIndex ? '✓' : i + 1}
            </div>
            <span
              className={[
                'text-sm hidden sm:block',
                i === stepIndex ? 'font-medium' : 'text-muted-foreground',
              ].join(' ')}
            >
              {STEP_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div>
        {step === 'preset' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose a fountain preset</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Start from a pre-configured layout or build your own from scratch.
              </p>
            </div>
            <PresetSelector
              selected={selectedPreset}
              onSelect={(p) => applyPreset(p || null)}
            />
          </div>
        )}

        {step === 'nozzles' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Configure nozzles</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Set positions and types for each water jet.
              </p>
            </div>
            <NozzleForm nozzles={nozzles} onChange={setNozzles} />
          </div>
        )}

        {step === 'platform' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Target platform</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select which hardware and output formats to generate.
              </p>
            </div>
            <PlatformSelector selected={platforms} onChange={setPlatforms} />
          </div>
        )}

        {step === 'name' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Name your project</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Give this choreography project a memorable name.
              </p>
            </div>
            <input
              type="text"
              placeholder="e.g. Summer Gala 2026"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canAdvance()) handleSubmit(); }}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-fountain-500/50"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={back}
          disabled={stepIndex === 0}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-white disabled:opacity-0 transition-all"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {step !== 'name' ? (
          <button
            onClick={advance}
            disabled={!canAdvance()}
            className="flex items-center gap-1 rounded-lg bg-fountain-500 px-5 py-2 text-sm font-medium text-white hover:bg-fountain-400 disabled:opacity-40 transition-all"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canAdvance()}
            className="rounded-lg bg-fountain-500 px-5 py-2 text-sm font-medium text-white hover:bg-fountain-400 disabled:opacity-40 transition-all"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
