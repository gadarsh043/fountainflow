'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { NozzleType } from '@fountainflow/shared';

interface Nozzle {
  id: string;
  type: NozzleType;
  position_x: number;
  position_y: number;
  max_height_ft: number;
}

interface NozzleFormProps {
  nozzles: Nozzle[];
  onChange: (nozzles: Nozzle[]) => void;
}

const NOZZLE_TYPES: { value: NozzleType; label: string }[] = [
  { value: 'center_jet', label: 'Center Jet' },
  { value: 'high_jet', label: 'High Jet' },
  { value: 'ring_fountain', label: 'Ring Fountain' },
  { value: 'peacock_tail', label: 'Peacock Tail' },
  { value: 'rising_sun', label: 'Rising Sun' },
  { value: 'revolving', label: 'Revolving' },
  { value: 'butterfly', label: 'Butterfly' },
  { value: 'moving_head', label: 'Moving Head' },
  { value: 'organ_fountain', label: 'Organ Fountain' },
  { value: 'corner_jet', label: 'Corner Jet' },
  { value: 'mist_line', label: 'Mist Line' },
  { value: 'water_screen', label: 'Water Screen' },
  { value: 'fan_jet', label: 'Fan Jet' },
];

function generateId() {
  return `n${Date.now().toString(36)}`;
}

export function NozzleForm({ nozzles, onChange }: NozzleFormProps) {
  function addNozzle() {
    onChange([
      ...nozzles,
      {
        id: generateId(),
        type: 'center_jet',
        position_x: 0,
        position_y: 0,
        max_height_ft: 10,
      },
    ]);
  }

  function removeNozzle(id: string) {
    onChange(nozzles.filter((n) => n.id !== id));
  }

  function updateNozzle(id: string, patch: Partial<Nozzle>) {
    onChange(nozzles.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  return (
    <div className="space-y-3">
      {nozzles.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No nozzles configured. Add one below.
        </div>
      )}

      {nozzles.map((nozzle, i) => (
        <div key={nozzle.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Nozzle {i + 1}
            </span>
            <button
              onClick={() => removeNozzle(nozzle.id)}
              className="text-muted-foreground hover:text-red-400 transition-colors"
              aria-label="Remove nozzle"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Type */}
            <div className="col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">Type</label>
              <select
                value={nozzle.type}
                onChange={(e) => updateNozzle(nozzle.id, { type: e.target.value as NozzleType })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-fountain-500"
              >
                {NOZZLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Position X */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Position X (ft)</label>
              <input
                type="number"
                value={nozzle.position_x}
                onChange={(e) => updateNozzle(nozzle.id, { position_x: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-fountain-500"
              />
            </div>

            {/* Position Y */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Position Y (ft)</label>
              <input
                type="number"
                value={nozzle.position_y}
                onChange={(e) => updateNozzle(nozzle.id, { position_y: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-fountain-500"
              />
            </div>

            {/* Max height */}
            <div className="col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">
                Max Height: {nozzle.max_height_ft} ft
              </label>
              <input
                type="range"
                min={1}
                max={60}
                step={1}
                value={nozzle.max_height_ft}
                onChange={(e) => updateNozzle(nozzle.id, { max_height_ft: parseInt(e.target.value, 10) })}
                className="w-full h-1 accent-fountain-400 cursor-pointer"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={addNozzle}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-fountain-500/50 hover:text-fountain-400 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add nozzle
      </button>
    </div>
  );
}
