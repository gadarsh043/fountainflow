"""
FountainFlow audio analysis package.

Submodules:
    pipeline        — Orchestrates all analysis steps, returns AudioAnalysisResult.
    beat_tracker    — madmom RNN beat tracking (requires WAV input).
    band_extractor  — 6-band frequency energy decomposition via librosa STFT.
    section_detector — MSAF structural segmentation + section type classification.
    onset_detector  — librosa onset detection with peak picking.
    energy_analyzer — RMS energy envelope computation.
    song_boundary   — Silence + spectral-centroid based song boundary detection.
"""

from audio_analysis.pipeline import AudioAnalysisResult, run_analysis_pipeline

__all__ = ["run_analysis_pipeline", "AudioAnalysisResult"]
