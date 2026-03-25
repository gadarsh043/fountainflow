"""
Audio analysis pipeline — main orchestrator.

Calls all sub-analyzers in sequence and returns an AudioAnalysisResult dict
that matches the TypeScript AudioAnalysisResult interface in:
  packages/shared/src/types/audio-analysis.ts

Pipeline stages:
  1. Convert audio to WAV (FFmpeg) — required by madmom
  2. Load WAV with librosa at sr=22050
  3. Compute RMS energy envelope + spectral centroid
  4. Extract 6-band frequency energies
  5. Detect beats (madmom RNN)
  6. Detect onsets (librosa)
  7. Segment + classify sections (MSAF)
  8. Detect song boundaries (silence + centroid shift)
"""

from __future__ import annotations

import hashlib
import logging
import os
import subprocess
from datetime import datetime, timezone
from typing import Any, TypedDict

import librosa  # type: ignore[import]
import numpy as np
from numpy.typing import NDArray

from audio_analysis.band_extractor import extract_all_bands
from audio_analysis.beat_tracker import track_beats
from audio_analysis.energy_analyzer import compute_energy_envelope
from audio_analysis.onset_detector import detect_onsets
from audio_analysis.section_detector import detect_sections
from audio_analysis.song_boundary import detect_song_boundaries
from settings import WorkerSettings

logger = logging.getLogger(__name__)

# Type alias for the full analysis result dict (matches TS interface)
AudioAnalysisResult = dict[str, Any]


def run_analysis_pipeline(
    audio_path: str,
    work_dir: str,
    settings: WorkerSettings,
    audio_hash: str,
) -> AudioAnalysisResult:
    """Run the complete audio analysis pipeline on an audio file.

    Args:
        audio_path: Absolute path to input audio file (MP3 or WAV).
        work_dir: Writable temporary directory for intermediate files.
        settings: WorkerSettings (sr, hop length, thresholds, etc.).
        audio_hash: Pre-computed SHA-256 of the raw audio bytes.

    Returns:
        AudioAnalysisResult dict matching the TypeScript interface.

    Raises:
        RuntimeError: If FFmpeg conversion fails.
        FileNotFoundError: If audio_path does not exist.
    """
    if not os.path.isfile(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    logger.info("Starting audio analysis pipeline: %s", audio_path)

    # ------------------------------------------------------------------
    # Step 1: Convert to WAV (required for madmom)
    # ------------------------------------------------------------------
    wav_path = _convert_to_wav(audio_path, work_dir, settings.ffmpeg_bin)

    # ------------------------------------------------------------------
    # Step 2: Load audio with librosa at fixed 22050 Hz
    # ------------------------------------------------------------------
    sr = settings.audio_sample_rate
    hop_length = 512

    logger.info("Loading audio at sr=%d", sr)
    audio: NDArray[np.float32]
    audio, _ = librosa.load(wav_path, sr=sr, mono=True, dtype=np.float32)
    duration_s = float(len(audio)) / float(sr)
    duration_ms = round(duration_s * 1000.0, 1)
    logger.info("Audio loaded: %.2f seconds (%d samples)", duration_s, len(audio))

    # ------------------------------------------------------------------
    # Step 3: Energy envelope + spectral centroid
    # ------------------------------------------------------------------
    logger.info("Computing energy envelope")
    energy_data = compute_energy_envelope(audio, sr, hop_length=hop_length)
    rms_array = np.array(energy_data["rms"], dtype=np.float32)
    centroid_array = np.array(energy_data["spectral_centroid"], dtype=np.float32)
    frame_rate = energy_data["frame_rate"]

    # ------------------------------------------------------------------
    # Step 4: 6-band frequency extraction
    # ------------------------------------------------------------------
    logger.info("Extracting frequency bands")
    bands, _ = extract_all_bands(audio, sr, hop_length=hop_length)

    # ------------------------------------------------------------------
    # Step 5: Beat tracking (madmom)
    # ------------------------------------------------------------------
    logger.info("Tracking beats")
    beats, bpm = track_beats(wav_path)

    # ------------------------------------------------------------------
    # Step 6: Onset detection
    # ------------------------------------------------------------------
    logger.info("Detecting onsets")
    onsets = detect_onsets(audio, sr, hop_length=hop_length)

    # ------------------------------------------------------------------
    # Step 7: Section segmentation + classification
    # ------------------------------------------------------------------
    logger.info("Detecting sections")
    sections = detect_sections(
        wav_path=wav_path,
        rms_envelope=rms_array,
        frame_rate=frame_rate,
        duration_seconds=duration_s,
    )

    # ------------------------------------------------------------------
    # Step 8: Song boundary detection
    # ------------------------------------------------------------------
    logger.info("Detecting song boundaries")
    song_boundaries = detect_song_boundaries(
        rms_envelope=rms_array,
        spectral_centroid=centroid_array,
        frame_rate=frame_rate,
        silence_energy_threshold_pct=settings.silence_energy_threshold_pct,
        min_silence_duration_ms=float(settings.min_silence_duration_ms),
    )

    # ------------------------------------------------------------------
    # Assemble result
    # ------------------------------------------------------------------
    result: AudioAnalysisResult = {
        "duration_ms": duration_ms,
        "sample_rate": sr,
        "bpm": round(bpm, 2),
        "time_signature": 4,  # Assumed 4/4; madmom meter analysis is future work
        "beats": beats,
        "onsets": onsets,
        "sections": sections,
        "song_boundaries": song_boundaries,
        "energy": {
            "frame_rate": frame_rate,
            "rms": energy_data["rms"],
            "bands": bands,
            "spectral_centroid": energy_data["spectral_centroid"],
        },
        "audio_hash": audio_hash,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }

    logger.info(
        "Analysis complete: duration=%.2fs bpm=%.1f beats=%d onsets=%d sections=%d boundaries=%d",
        duration_s,
        bpm,
        len(beats),
        len(onsets),
        len(sections),
        len(song_boundaries),
    )
    return result


def _convert_to_wav(
    audio_path: str,
    work_dir: str,
    ffmpeg_bin: str,
) -> str:
    """Convert audio file to 22050 Hz mono WAV using FFmpeg.

    If the file is already a WAV, returns the same path without conversion.

    Args:
        audio_path: Path to input audio file.
        work_dir: Directory to write the converted WAV.
        ffmpeg_bin: Name or path of the FFmpeg binary.

    Returns:
        Absolute path to the WAV file.

    Raises:
        RuntimeError: If FFmpeg exits with a non-zero status code.
    """
    if audio_path.lower().endswith(".wav"):
        logger.debug("Input is already WAV — skipping conversion: %s", audio_path)
        return audio_path

    wav_path = os.path.join(work_dir, "input_converted.wav")
    cmd = [
        ffmpeg_bin,
        "-y",           # Overwrite output
        "-i", audio_path,
        "-ar", "22050",  # Resample to 22050 Hz
        "-ac", "1",      # Mono
        "-sample_fmt", "s16",
        wav_path,
    ]
    logger.info("Converting to WAV: %s -> %s", audio_path, wav_path)
    result = subprocess.run(cmd, capture_output=True, timeout=300)
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"FFmpeg conversion failed (exit {result.returncode}): {stderr}")

    logger.info("WAV conversion complete: %s", wav_path)
    return wav_path
