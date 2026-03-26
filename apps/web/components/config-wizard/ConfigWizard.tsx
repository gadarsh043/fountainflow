'use client';

import { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import {
  FOUNTAIN_PRESETS,
  type FountainPreset,
  type TargetPlatform,
  type FountainConfig,
  type NozzleType,
  type NozzleConfig,
} from '@fountainflow/shared';
import { PresetSelector } from './PresetSelector';
import { PlatformSelector } from './PlatformSelector';
import { NozzleForm } from './NozzleForm';
import { PdfImportButton } from './PdfImportButton';
import type { ParsedNozzle } from '@/app/api/ai/parse-fountain/route';

// Flat nozzle format used in the wizard UI
interface WizardNozzle {
  id: string;
  type: NozzleType;
  position_x: number;
  position_y: number;
  max_height_ft: number;
}

interface ConfigWizardProps {
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

/** Convert a shared NozzleConfig (with positions array) to wizard flat format */
function toWizardNozzle(n: NozzleConfig, index: number): WizardNozzle {
  const pos = n.positions?.[0];
  return {
    id: n.id ?? `nozzle_${index}`,
    type: n.type,
    position_x: pos?.x ?? 0,
    position_y: pos?.y ?? 0,
    max_height_ft: n.max_height_ft,
  };
}

/** Convert wizard flat nozzle back to NozzleConfig for the API */
function toNozzleConfig(n: WizardNozzle): NozzleConfig {
  return {
    id: n.id,
    type: n.type,
    count: 1,
    max_height_ft: n.max_height_ft,
    positions: [{ x: n.position_x, y: n.position_y }],
  };
}

export function ConfigWizard({ onComplete }: ConfigWizardProps) {
  const [step, setStep] = useState<Step>('preset');
  const [selectedPreset, setSelectedPreset] = useState<FountainPreset | null | ''>(null);
  const [nozzles, setNozzles] = useState<WizardNozzle[]>([]);
  const [platforms, setPlatforms] = useState<TargetPlatform[]>(['arduino_mega']);
  const [projectName, setProjectName] = useState('');

  const stepIndex = STEPS.indexOf(step);

  function applyPreset(preset: FountainPreset | '' | null) {
    setSelectedPreset(preset);
    if (preset && FOUNTAIN_PRESETS[preset as FountainPreset]) {
      const config = FOUNTAIN_PRESETS[preset as FountainPreset];
      setNozzles((config.nozzles as NozzleConfig[]).map(toWizardNozzle));
    }
  }

  function handlePdfImport(parsed: ParsedNozzle[]) {
    const mapped: WizardNozzle[] = parsed.map((n, i) => ({
      id: `pdf_${i}`,
      type: 'center_jet' as NozzleType,
      position_x: n.position_x,
      position_y: n.position_y,
      max_height_ft: n.max_height_ft,
    }));
    setNozzles(mapped);
    setSelectedPreset(null);
    setStep('nozzles');
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

    const presetConfig = selectedPreset ? FOUNTAIN_PRESETS[selectedPreset as FountainPreset] ?? null : null;

    const fountainConfig: FountainConfig = {
      id: presetConfig ? (presetConfig as unknown as FountainConfig).id ?? 'custom' : 'custom',
      name: presetConfig?.name ?? projectName,
      dimensions: presetConfig?.dimensions ?? { length_ft: 30, width_ft: 20, depth_ft: 2 },
      pumps: presetConfig?.pumps ?? [],
      valves: presetConfig?.valves ?? {
        count: 0,
        min_cycle_ms: 200,
        min_close_time_large_pipe_ms: 300,
        max_frequency_hz: 5,
      },
      leds: presetConfig?.leds ?? {
        count: 0,
        type: 'rgb',
        channels_per_fixture: 3,
        dmx_channel_start: 1,
        dmx_universe: 1,
      },
      nozzles: nozzles.map(toNozzleConfig),
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
                Start from a pre-configured layout, import from a PDF blueprint, or build from scratch.
              </p>
            </div>
            <PresetSelector
              selected={selectedPreset}
              onSelect={(p) => applyPreset(p || null)}
            />
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-2">Or import from your own design document:</p>
              <PdfImportButton onImport={handlePdfImport} />
            </div>
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
