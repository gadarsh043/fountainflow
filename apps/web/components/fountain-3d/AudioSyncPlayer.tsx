'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

export interface PlaybackState {
  currentTimeMs: number;
  isPlaying: boolean;
  duration: number;
}

interface AudioSyncPlayerProps {
  audioUrl: string | null;
  onTimeUpdate: (state: PlaybackState) => void;
}

/**
 * Audio playback control using Web Audio API.
 *
 * IMPORTANT: Uses AudioContext.currentTime as the single source of truth —
 * never Date.now() or performance.now() for audio sync.
 *
 * The onTimeUpdate callback fires every animation frame so the 3D scene
 * stays perfectly in sync with the audio.
 */
export function AudioSyncPlayer({ audioUrl, onTimeUpdate }: AudioSyncPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0); // AudioContext.currentTime when playback started
  const rafRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;
    audioRef.current.src = audioUrl;
    audioRef.current.load();
  }, [audioUrl]);

  function initAudioContext() {
    if (audioCtxRef.current) return;
    const ctx = new AudioContext();
    if (audioRef.current) {
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(ctx.destination);
    }
    audioCtxRef.current = ctx;
  }

  function tick() {
    const ctx = audioCtxRef.current;
    const audio = audioRef.current;
    if (!ctx || !audio) return;

    const currentTimeMs = audio.currentTime * 1000;
    onTimeUpdate({
      currentTimeMs,
      isPlaying: !audio.paused,
      duration: audio.duration ?? 0,
    });

    rafRef.current = requestAnimationFrame(tick);
  }

  async function handlePlayPause() {
    if (!audioRef.current || !audioUrl) return;
    initAudioContext();

    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audioRef.current.pause();
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    } else {
      await audioRef.current.play();
      rafRef.current = requestAnimationFrame(tick);
      setIsPlaying(true);
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const t = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
    }
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  function handleLoadedMetadata() {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }

  function handleEnded() {
    setIsPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }

  const currentTime = audioRef.current?.currentTime ?? 0;
  const formatted = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!audioUrl) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-black/60 backdrop-blur-sm rounded-lg border border-white/10">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* Play / Pause */}
      <button
        onClick={() => { void handlePlayPause(); }}
        className="h-8 w-8 rounded-full bg-fountain-500 flex items-center justify-center hover:bg-fountain-400 transition-colors shrink-0"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 text-white" />
        ) : (
          <Play className="h-4 w-4 text-white ml-0.5" />
        )}
      </button>

      {/* Time display */}
      <span className="text-xs text-white/70 font-mono w-24 shrink-0">
        {formatted(currentTime)} / {formatted(duration)}
      </span>

      {/* Seek bar */}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        className="flex-1 h-1 accent-fountain-400 cursor-pointer"
      />

      {/* Volume */}
      <Volume2 className="h-4 w-4 text-white/50 shrink-0" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={handleVolumeChange}
        className="w-16 h-1 accent-fountain-400 cursor-pointer shrink-0"
      />
    </div>
  );
}
