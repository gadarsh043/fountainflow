/**
 * Show timeline types — the unified output of the choreography engine.
 * All actuator values are in DMX terms (0-255, 40fps).
 */

export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'step';

export type ActuatorType = 'vfd' | 'valve' | 'rgb_led' | 'laser' | 'generic';

export interface Keyframe {
  /** Time offset in milliseconds from show start */
  time_ms: number;
  /** DMX value 0-255 for single-channel actuators (vfd, valve, laser) */
  value: number;
  /** Red channel 0-255 (rgb_led only) */
  value_r?: number;
  /** Green channel 0-255 (rgb_led only) */
  value_g?: number;
  /** Blue channel 0-255 (rgb_led only) */
  value_b?: number;
  /** Easing from this keyframe to the next */
  easing: EasingType;
}

export interface Track {
  /** Unique actuator identifier (e.g., 'center_jet', 'high_jet_01', 'led_group_a') */
  actuator_id: string;
  /** Human-readable name */
  actuator_name?: string;
  actuator_type: ActuatorType;
  /** DMX universe (1-indexed) */
  dmx_universe: number;
  /** DMX channel within universe (1-512) */
  dmx_channel: number;
  /** For RGB LEDs: channels start here (R=dmx_channel, G=+1, B=+2) */
  dmx_channel_count?: number;
  keyframes: Keyframe[];
}

export interface ShowMetadata {
  /** Total show duration in milliseconds */
  duration_ms: number;
  /** Frame rate for dense timeline expansion (always 40) */
  frame_rate: number;
  /** Total frames at the given frame rate */
  total_frames: number;
  /** SHA-256 of the fountain config JSON */
  fountain_config_hash: string;
  /** SHA-256 of the original audio file */
  audio_file_hash: string;
  /** Original song name */
  song_name: string;
  /** ISO timestamp when the show was generated */
  generated_at: string;
  /** FountainFlow version that generated this */
  generator_version: string;
}

export interface ShowTimeline {
  version: '1.0';
  generator: 'FountainFlow';
  metadata: ShowMetadata;
  /** Full fountain config snapshot (for portability) */
  fountain_config?: Record<string, unknown>;
  tracks: Track[];
}

/** Dense per-frame representation (expanded from keyframes) */
export interface DenseFrame {
  /** Frame index (0-based) */
  index: number;
  /** Time in milliseconds */
  time_ms: number;
  /** DMX channel values indexed by track actuator_id */
  values: Record<string, number | [number, number, number]>;
}

/** 3D simulation data format (streamed to browser) */
export interface SimChunk {
  /** Starting frame index */
  start_frame: number;
  /** Ending frame index (exclusive) */
  end_frame: number;
  /** Frame data: array of per-actuator values */
  frames: Array<{
    /** VFD speed values 0-255 for each nozzle group */
    vfd: number[];
    /** Valve open/closed (0 or 255) for each valve */
    valve: number[];
    /** RGB LED values [r,g,b] for each group */
    led: Array<[number, number, number]>;
  }>;
}
