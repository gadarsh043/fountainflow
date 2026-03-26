'use client';

import { FOUNTAIN_PRESETS, type FountainPreset } from '@fountainflow/shared';

interface PresetSelectorProps {
  selected: FountainPreset | null | '';
  onSelect: (preset: FountainPreset | '') => void;
}

const PRESET_DISPLAY_NAMES: Record<string, string> = {
  maker_associates_100x30: 'Theatrical 100×30',
  municipal_50x20: 'Municipal 50×20',
  small_garden_15x10: 'Garden 15×10',
  hobbyist_5_nozzle: 'Hobbyist 5-Nozzle',
};

const PRESET_DESCRIPTIONS: Record<string, string> = {
  maker_associates_100x30: '100×30 ft · 10 nozzle groups · theatrical scale',
  municipal_50x20: '50×20 ft · 4 nozzle groups · park installation',
  small_garden_15x10: '15×10 ft · 3 nozzle groups · compact venue',
  hobbyist_5_nozzle: '6×4 ft · 2 nozzle groups · DIY / home use',
};

const PRESET_ICONS: Record<string, string> = {
  maker_associates_100x30: '🏟️',
  municipal_50x20: '🌳',
  small_garden_15x10: '🌿',
  hobbyist_5_nozzle: '💧',
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
            <p className="font-medium text-sm">
              {PRESET_DISPLAY_NAMES[preset] ?? preset.replace(/_/g, ' ')}
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
