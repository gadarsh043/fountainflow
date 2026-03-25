/**
 * Timeline playback engine.
 *
 * Reads keyframes from ShowTimeline, interpolates values at any given time,
 * and provides per-frame actuator states for the 3D simulation.
 *
 * Uses AudioContext.currentTime — NEVER Date.now() — for sync.
 */

import type { ShowTimeline, Track, Keyframe, EasingType } from '@fountainflow/shared';
import { getAudioTime } from './audio-context';

export const FRAME_RATE = 40; // frames per second (matches worker output)

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

function easeIn(t: number): number {
  return t * t;
}

function easeOut(t: number): number {
  return t * (2 - t);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case 'easeIn':
      return easeIn(t);
    case 'easeOut':
      return easeOut(t);
    case 'easeInOut':
      return easeInOut(t);
    case 'step':
      return t < 1 ? 0 : 1;
    case 'linear':
    default:
      return t;
  }
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolate a scalar value between two keyframes at a given time_ms.
 */
function interpolateScalar(from: Keyframe, to: Keyframe, time_ms: number): number {
  const span = to.time_ms - from.time_ms;
  if (span <= 0) return to.value;
  const t = (time_ms - from.time_ms) / span;
  const easedT = applyEasing(Math.max(0, Math.min(1, t)), from.easing);
  return from.value + (to.value - from.value) * easedT;
}

/**
 * Interpolate an RGB value between two keyframes.
 */
function interpolateRgb(
  from: Keyframe,
  to: Keyframe,
  time_ms: number,
): [number, number, number] {
  const span = to.time_ms - from.time_ms;
  const t = span <= 0 ? 1 : Math.max(0, Math.min(1, (time_ms - from.time_ms) / span));
  const easedT = applyEasing(t, from.easing);

  const r = Math.round((from.value_r ?? 0) + ((to.value_r ?? 0) - (from.value_r ?? 0)) * easedT);
  const g = Math.round((from.value_g ?? 0) + ((to.value_g ?? 0) - (from.value_g ?? 0)) * easedT);
  const b = Math.round((from.value_b ?? 0) + ((to.value_b ?? 0) - (from.value_b ?? 0)) * easedT);

  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

// ---------------------------------------------------------------------------
// Track evaluator
// ---------------------------------------------------------------------------

/**
 * Get the interpolated value for a track at a given time_ms.
 * For RGB tracks returns [r, g, b]; for others returns a scalar 0–255.
 */
export function evaluateTrack(
  track: Track,
  time_ms: number,
): number | [number, number, number] {
  const { keyframes } = track;
  if (keyframes.length === 0) return 0;

  // Clamp to bounds
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];

  if (first === undefined || last === undefined) return 0;
  if (time_ms <= first.time_ms) {
    return track.actuator_type === 'rgb_led'
      ? [first.value_r ?? 0, first.value_g ?? 0, first.value_b ?? 0]
      : first.value;
  }
  if (time_ms >= last.time_ms) {
    return track.actuator_type === 'rgb_led'
      ? [last.value_r ?? 0, last.value_g ?? 0, last.value_b ?? 0]
      : last.value;
  }

  // Binary search for surrounding keyframes
  let lo = 0;
  let hi = keyframes.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    const midKf = keyframes[mid];
    if (midKf !== undefined && midKf.time_ms <= time_ms) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const fromKf = keyframes[lo];
  const toKf = keyframes[hi];

  if (fromKf === undefined || toKf === undefined) return 0;

  if (track.actuator_type === 'rgb_led') {
    return interpolateRgb(fromKf, toKf, time_ms);
  }
  return interpolateScalar(fromKf, toKf, time_ms);
}

// ---------------------------------------------------------------------------
// Per-frame state (what the 3D scene reads each animation frame)
// ---------------------------------------------------------------------------

export interface FrameState {
  /** time_ms for this frame */
  time_ms: number;
  /** VFD speed per track actuator_id, 0–255 */
  vfd: Record<string, number>;
  /** Valve open state per actuator_id: true = open */
  valves: Record<string, boolean>;
  /** LED RGB colors per actuator_id */
  leds: Record<string, [number, number, number]>;
}

// ---------------------------------------------------------------------------
// TimelinePlayer class
// ---------------------------------------------------------------------------

export class TimelinePlayer {
  private readonly timeline: ShowTimeline;
  private audioStartTime = 0; // AudioContext.currentTime when playback started
  private playing = false;
  private currentTimeMsInternal = 0;

  constructor(timeline: ShowTimeline) {
    this.timeline = timeline;
  }

  /** Start / resume playback. startAudioContextTime is AudioContext.currentTime at the moment play() is called. */
  play(startAudioContextTime?: number): void {
    this.audioStartTime = startAudioContextTime ?? getAudioTime();
    this.playing = true;
  }

  pause(): void {
    // Capture current position so seek works correctly after pause
    this.currentTimeMsInternal = this.getCurrentTimeMs();
    this.playing = false;
  }

  seek(time_ms: number): void {
    this.currentTimeMsInternal = Math.max(0, Math.min(time_ms, this.timeline.metadata.duration_ms));
    if (this.playing) {
      // Re-sync the start reference
      this.audioStartTime = getAudioTime() - this.currentTimeMsInternal / 1000;
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getDurationMs(): number {
    return this.timeline.metadata.duration_ms;
  }

  /** Get current playback position in milliseconds, using AudioContext.currentTime. */
  getCurrentTimeMs(): number {
    if (!this.playing) return this.currentTimeMsInternal;
    const elapsed = (getAudioTime() - this.audioStartTime) * 1000;
    return Math.min(elapsed, this.timeline.metadata.duration_ms);
  }

  /** Get a FrameState for the current AudioContext time. Call this each animation frame. */
  getFrameState(): FrameState {
    const time_ms = this.getCurrentTimeMs();
    return this.getFrameStateAt(time_ms);
  }

  /** Get a FrameState at an explicit time_ms (for scrubbing). */
  getFrameStateAt(time_ms: number): FrameState {
    const state: FrameState = {
      time_ms,
      vfd: {},
      valves: {},
      leds: {},
    };

    for (const track of this.timeline.tracks) {
      const value = evaluateTrack(track, time_ms);

      switch (track.actuator_type) {
        case 'vfd':
          state.vfd[track.actuator_id] = typeof value === 'number' ? value : 0;
          break;
        case 'valve':
          state.valves[track.actuator_id] =
            typeof value === 'number' ? value > 127 : false;
          break;
        case 'rgb_led':
          state.leds[track.actuator_id] = Array.isArray(value)
            ? (value as [number, number, number])
            : [0, 0, 0];
          break;
        default:
          // generic or laser — ignore for simulation
          break;
      }
    }

    return state;
  }

  /** Convert a 0–255 VFD value to a height multiplier (0–1) using the pump affinity law. */
  static vfdToHeightMultiplier(vfdValue: number): number {
    // H ∝ N²  →  height_pct = (speed_pct)²
    const speedPct = vfdValue / 255;
    return speedPct * speedPct;
  }
}
