'use client';

import type { TargetPlatform } from '@fountainflow/shared';

interface PlatformOption {
  value: TargetPlatform;
  label: string;
  description: string;
  icon: string;
  badge?: string;
}

const PLATFORMS: PlatformOption[] = [
  {
    value: 'arduino_mega',
    label: 'Arduino Mega',
    description: 'SD card binary playback, NeoPixel LEDs, relay valves',
    icon: '🔌',
    badge: 'Popular',
  },
  {
    value: 'esp32',
    label: 'ESP32',
    description: 'SPIFFS filesystem, WiFi HTTP trigger, PWM outputs',
    icon: '📡',
  },
  {
    value: 'dmx_artnet',
    label: 'DMX / Art-Net',
    description: 'Professional DMX512 controllers, Art-Net over Ethernet',
    icon: '🎛️',
    badge: 'Pro',
  },
  {
    value: 'json_timeline',
    label: 'JSON Timeline',
    description: 'Portable format for custom players and integrations',
    icon: '{}',
  },
  {
    value: 'csv',
    label: 'CSV Export',
    description: 'Spreadsheet-compatible per-frame channel data',
    icon: '📊',
  },
  {
    value: 'modbus',
    label: 'Modbus RTU',
    description: 'VFD speed control via Modbus FC06 registers',
    icon: '⚡',
  },
];

interface PlatformSelectorProps {
  selected: TargetPlatform[];
  onChange: (platforms: TargetPlatform[]) => void;
}

export function PlatformSelector({ selected, onChange }: PlatformSelectorProps) {
  function toggle(platform: TargetPlatform) {
    if (selected.includes(platform)) {
      onChange(selected.filter((p) => p !== platform));
    } else {
      onChange([...selected, platform]);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select one or more output formats. All selected formats will be included in the download package.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map((p) => {
          const isSelected = selected.includes(p.value);
          return (
            <button
              key={p.value}
              onClick={() => toggle(p.value)}
              className={[
                'rounded-xl border p-4 text-left transition-all flex items-start gap-3',
                isSelected
                  ? 'border-fountain-500 bg-fountain-500/10 ring-1 ring-fountain-500/30'
                  : 'border-border bg-card hover:border-fountain-500/40 hover:bg-secondary/30',
              ].join(' ')}
            >
              <span className="text-xl shrink-0">{p.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.label}</span>
                  {p.badge && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-fountain-500/20 text-fountain-400 uppercase tracking-wide">
                      {p.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
              </div>
              <div
                className={[
                  'h-4 w-4 rounded border shrink-0 mt-0.5 flex items-center justify-center transition-all',
                  isSelected
                    ? 'border-fountain-500 bg-fountain-500'
                    : 'border-muted-foreground',
                ].join(' ')}
              >
                {isSelected && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white fill-current">
                    <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
