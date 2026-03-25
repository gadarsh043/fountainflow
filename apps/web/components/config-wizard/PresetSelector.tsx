'use client';

import { FOUNTAIN_PRESETS, type FountainPreset } from '@fountainflow/shared';

interface PresetSelectorProps {
  selected: FountainPreset | null;
  onSelect: (preset: FountainPreset) => void;
}

const PRESET_DESCRIPTIONS: Record<string, string> = {
  maker_associates_100x30: '100×30 ft · 24 nozzles · theatrical scale',
  municipal_50x20: '50×20 ft · 12 nozzles · park installation',
  rooftop_garden_20x20: '20×20 ft · 6 nozzles · compact venue',
  hotel_atrium_circular: 'Circular 30 ft · ring fountain pattern',
  competition_stage_80x40: '80×40 ft · 36 nozzles · event stage',
};

const PRESET_ICONS: Record<string, string> = {
  maker_associates_100x30: '🏟️',
  municipal_50x20: '🌳',
  rooftop_garden_20x20: '🌿',
  hotel_atrium_circular: '💧',
  competition_stage_80x40: '🎭',
};

export function PresetSelector({ selected, onSelect }: PresetSelectorProps) {
  const presets = Object.keys(FOUNTAIN_PRESETS) as FountainPreset[];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {presets.map((preset) => {
        const isSelected = selected === preset;
        return (
          <button
            key={preset}
            onClick={() => onSelect(preset)}
            className={[
              'rounded-xl border p-5 text-left transition-all hover:border-fountain-500/50',
              isSelected
                ? 'border-fountain-500 bg-fountain-500/10 ring-1 ring-fountain-500/30'
                : 'border-border bg-card hover:bg-secondary/30',
            ].join(' ')}
          >
            <div className="text-2xl mb-3">{PRESET_ICONS[preset] ?? '⛲'}</div>
            <p className="font-medium text-sm capitalize">
              {preset.replace(/_/g, ' ')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {PRESET_DESCRIPTIONS[preset] ?? 'Fountain configuration'}
            </p>
          </button>
        );
      })}

      {/* Custom option */}
      <button
        onClick={() => onSelect('' as FountainPreset)}
        className={[
          'rounded-xl border p-5 text-left transition-all hover:border-fountain-500/50',
          selected === ''
            ? 'border-fountain-500 bg-fountain-500/10 ring-1 ring-fountain-500/30'
            : 'border-border bg-card hover:bg-secondary/30',
        ].join(' ')}
      >
        <div className="text-2xl mb-3">⚙️</div>
        <p className="font-medium text-sm">Custom Configuration</p>
        <p className="text-xs text-muted-foreground mt-1">Configure nozzles and hardware manually</p>
      </button>
    </div>
  );
}
