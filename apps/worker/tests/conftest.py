"""
pytest configuration and shared fixtures for the FountainFlow worker test suite.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Generator

import numpy as np
import pytest
import soundfile as sf

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SR = 22050


@pytest.fixture(scope="session")
def fixture_dir() -> Path:
    """Return path to test fixtures directory."""
    return FIXTURES_DIR


@pytest.fixture(scope="session")
def pop_wav(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Generate and return path to synthetic pop WAV (30s, 120 BPM)."""
    tmp = tmp_path_factory.mktemp("audio")
    path = str(tmp / "pop_test.wav")
    duration = 15  # Shorter for faster tests
    t = np.linspace(0, duration, SR * duration, dtype=np.float32)
    signal = np.zeros_like(t)
    for bt in np.arange(0, duration, 0.5):  # 120 BPM
        signal += np.exp(-30 * (t - bt) ** 2) * np.sin(2 * np.pi * 80 * t)
    signal += 0.3 * np.sin(2 * np.pi * 440 * t)
    signal /= np.max(np.abs(signal)) * 1.1
    sf.write(path, signal, SR)
    return path


@pytest.fixture(scope="session")
def silence_gaps_wav(tmp_path_factory: pytest.TempPathFactory) -> str:
    """Generate WAV with two clips separated by 2s silence."""
    tmp = tmp_path_factory.mktemp("audio")
    path = str(tmp / "silence_gaps.wav")

    clip_dur = 8
    silence_dur = 2

    t = np.linspace(0, clip_dur, SR * clip_dur, dtype=np.float32)
    clip1 = np.zeros_like(t)
    for bt in np.arange(0, clip_dur, 0.5):
        clip1 += np.exp(-30 * (t - bt) ** 2) * np.sin(2 * np.pi * 100 * t)
    clip1 /= np.max(np.abs(clip1)) * 1.1

    silence = np.zeros(SR * silence_dur, dtype=np.float32)

    t2 = np.linspace(0, clip_dur, SR * clip_dur, dtype=np.float32)
    clip2 = np.zeros_like(t2)
    for bt in np.arange(0, clip_dur, 0.4):
        clip2 += np.exp(-25 * (t2 - bt) ** 2) * np.sin(2 * np.pi * 150 * t2)
    clip2 /= np.max(np.abs(clip2)) * 1.1

    combined = np.concatenate([clip1, silence, clip2])
    sf.write(path, combined, SR)
    return path


@pytest.fixture
def work_dir() -> Generator[str, None, None]:
    """Create and yield a temporary working directory, cleaned up after test."""
    with tempfile.TemporaryDirectory(prefix="ff_test_") as d:
        yield d


@pytest.fixture
def small_fountain_config() -> dict[str, Any]:
    """Return a minimal FountainConfig for testing."""
    return {
        "id": "test_fountain",
        "name": "Test Fountain",
        "dimensions": {"length_ft": 10, "width_ft": 8},
        "nozzles": [
            {"id": "center_jet", "type": "center_jet", "count": 1, "max_height_ft": 6},
            {"id": "ring_fountains", "type": "ring_fountain", "count": 1, "max_height_ft": 3},
            {"id": "corner_jets", "type": "corner_jet", "count": 4, "max_height_ft": 2},
        ],
        "pumps": [
            {
                "id": "pump_main",
                "hp": 1.0,
                "feeds": ["center_jet", "ring_fountains", "corner_jets"],
                "vfd_controlled": True,
                "vfd_modbus_address": 1,
            }
        ],
        "valves": {
            "count": 6,
            "min_cycle_ms": 200,
            "min_close_time_large_pipe_ms": 200,
            "max_frequency_hz": 5,
        },
        "leds": {
            "count": 8,
            "type": "rgb",
            "channels_per_fixture": 3,
            "dmx_channel_start": 1,
            "dmx_universe": 1,
        },
        "target_platform": "json_timeline",
    }


@pytest.fixture
def minimal_analysis_result() -> dict[str, Any]:
    """Return a minimal AudioAnalysisResult for unit testing."""
    duration_ms = 10000.0
    frame_rate = 43
    total_frames = int(duration_ms / 1000.0 * frame_rate)

    rng = np.random.default_rng(42)
    rms = rng.uniform(0.1, 0.9, total_frames).tolist()

    band_frames = total_frames

    def make_band() -> list[float]:
        return rng.uniform(0.0, 1.0, band_frames).tolist()

    return {
        "duration_ms": duration_ms,
        "sample_rate": SR,
        "bpm": 120.0,
        "time_signature": 4,
        "beats": [
            {"time_ms": i * 500.0, "strength": 0.8 if i % 4 == 0 else 0.5}
            for i in range(20)
        ],
        "onsets": [
            {"time_ms": i * 250.0, "strength": 0.6}
            for i in range(40)
        ],
        "sections": [
            {"start_ms": 0, "end_ms": 3000, "label": "A", "section_type": "intro", "energy_level": 0.3},
            {"start_ms": 3000, "end_ms": 7000, "label": "B", "section_type": "verse", "energy_level": 0.6},
            {"start_ms": 7000, "end_ms": 10000, "label": "C", "section_type": "chorus", "energy_level": 0.9},
        ],
        "song_boundaries": [],
        "energy": {
            "frame_rate": frame_rate,
            "rms": rms,
            "bands": {
                "sub_bass": make_band(),
                "bass": make_band(),
                "low_mid": make_band(),
                "mid": make_band(),
                "high_mid": make_band(),
                "treble": make_band(),
            },
            "spectral_centroid": make_band(),
        },
        "audio_hash": "test_hash_abc123",
        "analyzed_at": "2026-03-25T00:00:00Z",
    }
