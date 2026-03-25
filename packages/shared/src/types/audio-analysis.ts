/**
 * Audio analysis result types.
 * Output of the Python audio analysis pipeline.
 */

export interface BeatEvent {
  /** Time in milliseconds */
  time_ms: number;
  /** Beat strength (0.0–1.0) */
  strength: number;
}

export interface OnsetEvent {
  /** Time in milliseconds */
  time_ms: number;
  /** Onset strength (0.0–1.0) */
  strength: number;
}

export interface SectionInfo {
  /** Section start time in milliseconds */
  start_ms: number;
  /** Section end time in milliseconds */
  end_ms: number;
  /**
   * MSAF-assigned label (e.g., 'A', 'B', 'C') or
   * human-readable after classification ('intro', 'verse', 'chorus', etc.)
   */
  label: string;
  /** Classified section type for choreography (after classification pass) */
  section_type?: SectionType;
  /** Mean energy in this section relative to global peak (0.0–1.0) */
  energy_level?: number;
}

export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre_chorus'
  | 'chorus'
  | 'bridge'
  | 'outro'
  | 'silence'
  | 'instrumental'
  | 'breakdown'
  | 'build';

export interface SongBoundary {
  /** Time in milliseconds where a new song begins within a stitched file */
  time_ms: number;
  /** Duration of the silence gap in milliseconds */
  silence_duration_ms: number;
}

/** Six-band frequency energy arrays (one value per analysis frame) */
export interface FrequencyBands {
  /** 20–60 Hz: sub-bass, kick drum rumble */
  sub_bass: number[];
  /** 60–250 Hz: bass guitar, bass drum */
  bass: number[];
  /** 250–500 Hz: guitar body, male vocals low end */
  low_mid: number[];
  /** 500–2000 Hz: vocals, melodic content */
  mid: number[];
  /** 2000–4000 Hz: presence, attack */
  high_mid: number[];
  /** 4000–20000 Hz: treble, cymbals, air */
  treble: number[];
}

export interface EnergyEnvelope {
  /** Number of analysis frames per second (typically 43 at sr=22050, hop=512) */
  frame_rate: number;
  /** RMS energy per frame (0.0–1.0, normalized to peak) */
  rms: number[];
  /** Per-band energy per frame */
  bands: FrequencyBands;
  /** Spectral centroid per frame (Hz) — used for song boundary detection */
  spectral_centroid?: number[];
}

export interface AudioAnalysisResult {
  /** Total song duration in milliseconds */
  duration_ms: number;
  /** Audio sample rate used for analysis (always 22050 Hz) */
  sample_rate: number;
  /** Detected tempo in BPM */
  bpm: number;
  /** Time signature numerator (usually 4 for 4/4) */
  time_signature?: number;
  /** All detected beat events */
  beats: BeatEvent[];
  /** All detected onset events (note attacks, transients) */
  onsets: OnsetEvent[];
  /** Detected song sections */
  sections: SectionInfo[];
  /** Song boundaries within a stitched multi-song file (empty for single songs) */
  song_boundaries: SongBoundary[];
  /** Energy envelope data */
  energy: EnergyEnvelope;
  /** SHA-256 hash of the original audio file */
  audio_hash: string;
  /** Analysis timestamp */
  analyzed_at: string;
}

/** Normalized band mapping for nozzle assignment */
export const BAND_NOZZLE_MAPPING = {
  sub_bass: { range: [20, 60] as [number, number], nozzles: ['water_screen'] },
  bass: { range: [60, 250] as [number, number], nozzles: ['center_jet', 'high_jets', 'ring_fountains'] },
  low_mid: { range: [250, 500] as [number, number], nozzles: ['organ_fountains', 'corner_jets'] },
  mid: { range: [500, 2000] as [number, number], nozzles: ['peacock_tail', 'rising_sun', 'revolving'] },
  high_mid: { range: [2000, 4000] as [number, number], nozzles: ['butterfly', 'moving_head'] },
  treble: { range: [4000, 20000] as [number, number], nozzles: ['mist_lines'] },
} as const;
