"""
Tests for the audio analysis pipeline.

These tests use synthetic WAV fixtures generated in conftest.py.
Heavy tests (those running madmom/MSAF) are marked as @pytest.mark.slow
and can be skipped with: pytest -m "not slow"
"""

from __future__ import annotations

import os
from typing import Any

import numpy as np
import pytest

from audio_analysis.band_extractor import extract_all_bands
from audio_analysis.energy_analyzer import compute_energy_envelope
from audio_analysis.onset_detector import detect_onsets
from audio_analysis.song_boundary import detect_song_boundaries


class TestEnergyAnalyzer:
    def test_rms_returns_correct_shape(self, pop_wav: str) -> None:
        import librosa
        audio, sr = librosa.load(pop_wav, sr=22050, mono=True)
        result = compute_energy_envelope(audio, sr, hop_length=512)
        assert "rms" in result
        assert "frame_rate" in result
        assert len(result["rms"]) > 0
        assert result["frame_rate"] > 0

    def test_rms_values_normalized(self, pop_wav: str) -> None:
        import librosa
        audio, sr = librosa.load(pop_wav, sr=22050, mono=True)
        result = compute_energy_envelope(audio, sr, hop_length=512)
        rms = np.array(result["rms"])
        assert np.all(rms >= 0.0), "RMS should be non-negative"
        assert np.max(rms) <= 1.01, "RMS should be normalized to ~1.0"


class TestBandExtractor:
    def test_all_six_bands_present(self, pop_wav: str) -> None:
        import librosa
        audio, sr = librosa.load(pop_wav, sr=22050, mono=True)
        bands, freqs = extract_all_bands(audio, sr, hop_length=512)
        expected = {"sub_bass", "bass", "low_mid", "mid", "high_mid", "treble"}
        assert set(bands.keys()) == expected

    def test_band_values_non_negative(self, pop_wav: str) -> None:
        import librosa
        audio, sr = librosa.load(pop_wav, sr=22050, mono=True)
        bands, _ = extract_all_bands(audio, sr, hop_length=512)
        for band_name, values in bands.items():
            arr = np.array(values)
            assert np.all(arr >= 0.0), f"Band {band_name} has negative values"

    def test_bass_nonzero_for_kick_drum(self, pop_wav: str) -> None:
        """The synthetic pop WAV has a 80 Hz kick drum — bass band should be > 0."""
        import librosa
        audio, sr = librosa.load(pop_wav, sr=22050, mono=True)
        bands, _ = extract_all_bands(audio, sr, hop_length=512)
        bass = np.array(bands["bass"])
        assert np.mean(bass) > 0.01, "Bass band should be non-zero for 80 Hz kick drum"


class TestOnsetDetector:
    def test_detects_beats_in_pop(self, pop_wav: str) -> None:
        import librosa
        audio, sr = librosa.load(pop_wav, sr=22050, mono=True)
        onsets = detect_onsets(audio, sr, hop_length=512)
        assert len(onsets) > 0, "Should detect at least some onsets in pop track"

    def test_onset_structure(self, pop_wav: str) -> None:
        import librosa
        audio, sr = librosa.load(pop_wav, sr=22050, mono=True)
        onsets = detect_onsets(audio, sr, hop_length=512)
        for onset in onsets:
            assert "time_ms" in onset
            assert "strength" in onset
            assert onset["time_ms"] >= 0
            assert 0.0 <= onset["strength"] <= 1.0


class TestSongBoundary:
    def test_detects_silence_gap(self, silence_gaps_wav: str) -> None:
        """The silence_gaps fixture has ~2s of silence between two clips."""
        import librosa
        audio, sr = librosa.load(silence_gaps_wav, sr=22050, mono=True)
        from audio_analysis.energy_analyzer import compute_energy_envelope
        energy = compute_energy_envelope(audio, sr)
        rms = np.array(energy["rms"])
        frame_rate = float(energy["frame_rate"])
        centroid = np.array(energy.get("spectral_centroid", [0.0] * len(rms)))

        boundaries = detect_song_boundaries(
            rms_envelope=rms,
            spectral_centroid=centroid,
            frame_rate=frame_rate,
            silence_energy_threshold_pct=2.0,
            min_silence_duration_ms=800.0,
        )

        assert len(boundaries) >= 1, "Should detect at least one song boundary"
        # Boundary should be around 8s (first clip duration)
        boundary_times = [b["time_ms"] for b in boundaries]
        assert any(7000 <= t <= 10000 for t in boundary_times), (
            f"Expected boundary near 8000ms, got {boundary_times}"
        )

    def test_no_false_boundaries_in_continuous_audio(self, pop_wav: str) -> None:
        """Continuous pop audio should have no song boundaries."""
        import librosa
        audio, sr = librosa.load(pop_wav, sr=22050, mono=True)
        from audio_analysis.energy_analyzer import compute_energy_envelope
        energy = compute_energy_envelope(audio, sr)
        rms = np.array(energy["rms"])
        frame_rate = float(energy["frame_rate"])
        centroid = np.array(energy.get("spectral_centroid", [0.0] * len(rms)))

        boundaries = detect_song_boundaries(
            rms_envelope=rms,
            spectral_centroid=centroid,
            frame_rate=frame_rate,
            silence_energy_threshold_pct=2.0,
            min_silence_duration_ms=800.0,
        )

        assert len(boundaries) == 0, f"Pop track should have no boundaries, got {boundaries}"
