/**
 * Audio context management singleton.
 *
 * Rules:
 * - ONE AudioContext per page (browsers cap concurrent contexts)
 * - AudioContext.currentTime is the SINGLE SOURCE OF TRUTH for sync
 * - NEVER use Date.now() or performance.now() for audio sync
 */

let _audioContext: AudioContext | null = null;

/**
 * Get or create the shared AudioContext singleton.
 * Lazily created on first user gesture (browsers require user interaction).
 */
export function getAudioContext(): AudioContext {
  if (_audioContext === null || _audioContext.state === 'closed') {
    _audioContext = new AudioContext({ latencyHint: 'playback' });
  }
  return _audioContext;
}

/**
 * Resume the AudioContext if it was suspended by the browser.
 * Must be called inside a user gesture handler (click, keydown, etc.).
 */
export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

/**
 * Suspend the AudioContext to save battery when not in use.
 */
export async function suspendAudioContext(): Promise<void> {
  if (_audioContext && _audioContext.state === 'running') {
    await _audioContext.suspend();
  }
}

/**
 * Close and destroy the AudioContext. Call only on page unload.
 */
export async function closeAudioContext(): Promise<void> {
  if (_audioContext) {
    await _audioContext.close();
    _audioContext = null;
  }
}

/**
 * Load an audio buffer from a URL using the shared AudioContext.
 * Uses fetch + decodeAudioData for streaming-friendly loading.
 */
export async function loadAudioBuffer(url: string): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

/**
 * Create a MediaElementAudioSourceNode from an HTMLAudioElement.
 * Connects it to an AnalyserNode and the destination.
 * Returns both so callers can read frequency data.
 */
export interface AudioGraphNodes {
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
}

export function createAudioGraph(audioElement: HTMLAudioElement): AudioGraphNodes {
  const ctx = getAudioContext();
  const source = ctx.createMediaElementSource(audioElement);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  return { source, analyser };
}

/**
 * Get the current time from the AudioContext.
 * This is the ONLY correct way to get time for audio sync.
 */
export function getAudioTime(): number {
  if (_audioContext === null) return 0;
  return _audioContext.currentTime;
}
