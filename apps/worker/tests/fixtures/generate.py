"""
Generate synthetic test audio fixtures using numpy + soundfile.

Run this script once to create the WAV files needed by the test suite:
    python tests/fixtures/generate.py

These are synthetic signals — not real music — but they exercise the
beat tracker, section detector, and energy analyzer correctly.
"""

from __future__ import annotations

import os

import numpy as np
import soundfile as sf

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
SR = 22050


def generate_pop_english_30s() -> None:
    """Synthetic pop track: 120 BPM kick drum + 440 Hz melody, 30 seconds."""
    duration = 30
    t = np.linspace(0, duration, SR * duration, dtype=np.float32)

    # Kick drum at 120 BPM (2 beats/second)
    beat_times = np.arange(0, duration, 0.5)
    signal = np.zeros_like(t)
    for bt in beat_times:
        signal += np.exp(-30 * (t - bt) ** 2) * np.sin(2 * np.pi * 80 * t)

    # Bass melody at 110 Hz
    signal += 0.3 * np.sin(2 * np.pi * 110 * t) * (1 + 0.3 * np.sin(2 * np.pi * 0.5 * t))

    # High melody at 440 Hz
    signal += 0.15 * np.sin(2 * np.pi * 440 * t)

    # Add chorus-like section (higher energy 15–20s)
    chorus_mask = (t >= 15) & (t < 20)
    signal[chorus_mask] *= 1.8

    signal = _normalize(signal)
    path = os.path.join(OUTPUT_DIR, "pop_english_30s.wav")
    sf.write(path, signal, SR)
    print(f"Generated: {path} ({len(signal) / SR:.1f}s)")


def generate_classical_60s() -> None:
    """Synthetic classical piece: no drums, slowly varying sine waves, 60 seconds."""
    duration = 60
    t = np.linspace(0, duration, SR * duration, dtype=np.float32)

    # Multiple harmonics, slowly varying
    signal = (
        np.sin(2 * np.pi * 261.63 * t) * 0.5  # Middle C
        + np.sin(2 * np.pi * 329.63 * t) * 0.3  # E4
        + np.sin(2 * np.pi * 392.00 * t) * 0.2  # G4
    )

    # Add slow amplitude modulation (simulates bowing / breath)
    signal *= (0.5 + 0.5 * np.sin(2 * np.pi * 0.1 * t))

    # Add gradual crescendo from 20s to 40s
    crescendo = np.ones_like(t)
    mask = (t >= 20) & (t < 40)
    crescendo[mask] = 1.0 + (t[mask] - 20) / 20.0
    signal *= crescendo

    signal = _normalize(signal)
    path = os.path.join(OUTPUT_DIR, "classical_60s.wav")
    sf.write(path, signal, SR)
    print(f"Generated: {path} ({len(signal) / SR:.1f}s)")


def generate_bollywood_30s() -> None:
    """Synthetic Bollywood/tabla rhythm: ~100 BPM with syncopation, 30 seconds."""
    duration = 30
    t = np.linspace(0, duration, SR * duration, dtype=np.float32)

    # Tabla-like pattern: beats at irregular intervals
    # 16-beat tala cycle at 100 BPM
    beat_period = 60.0 / 100.0  # 0.6s per beat
    tabla_pattern = [0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1]  # 16-beat cycle

    signal = np.zeros_like(t)
    cycle_duration = beat_period * 16

    for cycle_start in np.arange(0, duration, cycle_duration):
        for i, on in enumerate(tabla_pattern):
            if on:
                bt = cycle_start + i * beat_period
                if bt < duration:
                    freq = 200.0 if i % 4 == 0 else 120.0
                    signal += np.exp(-25 * (t - bt) ** 2) * np.sin(2 * np.pi * freq * t)

    # Melody at Indian scale (Yaman raga-like: C D E F# G A B)
    melody_freqs = [261.63, 293.66, 329.63, 369.99, 392.00, 440.00, 493.88]
    for i, f in enumerate(melody_freqs):
        signal += 0.08 * np.sin(2 * np.pi * f * t) * np.abs(np.sin(2 * np.pi * 0.2 * (t - i * 0.5)))

    signal = _normalize(signal)
    path = os.path.join(OUTPUT_DIR, "bollywood_30s.wav")
    sf.write(path, signal, SR)
    print(f"Generated: {path} ({len(signal) / SR:.1f}s)")


def generate_silence_gaps() -> None:
    """Two 15-second clips separated by 2 seconds of silence.

    Used to test song boundary detection in stitched files.
    """
    clip_duration = 15
    silence_duration = 2
    sr = SR

    t1 = np.linspace(0, clip_duration, sr * clip_duration, dtype=np.float32)
    clip1 = np.zeros_like(t1)
    for bt in np.arange(0, clip_duration, 0.5):
        clip1 += np.exp(-30 * (t1 - bt) ** 2) * np.sin(2 * np.pi * 100 * t1)
    clip1 += 0.2 * np.sin(2 * np.pi * 440 * t1)

    silence = np.zeros(sr * silence_duration, dtype=np.float32)

    t2 = np.linspace(0, clip_duration, sr * clip_duration, dtype=np.float32)
    clip2 = np.zeros_like(t2)
    for bt in np.arange(0, clip_duration, 0.4):
        clip2 += np.exp(-25 * (t2 - bt) ** 2) * np.sin(2 * np.pi * 150 * t2)
    clip2 += 0.3 * np.sin(2 * np.pi * 220 * t2)

    combined = np.concatenate([
        _normalize(clip1),
        silence,
        _normalize(clip2),
    ])

    path = os.path.join(OUTPUT_DIR, "silence_gaps.wav")
    sf.write(path, combined, sr)
    print(f"Generated: {path} ({len(combined) / sr:.1f}s, silence at ~{clip_duration}s)")


def _normalize(signal: np.ndarray) -> np.ndarray:
    """Normalize signal to peak amplitude 0.9.

    Args:
        signal: Audio samples.

    Returns:
        Normalized signal.
    """
    peak = np.max(np.abs(signal))
    if peak > 0:
        return (signal / peak * 0.9).astype(np.float32)
    return signal


if __name__ == "__main__":
    print(f"Generating test fixtures in {OUTPUT_DIR}...")
    generate_pop_english_30s()
    generate_classical_60s()
    generate_bollywood_30s()
    generate_silence_gaps()
    print("Done.")
