"""
Section detector module — MSAF structural segmentation + section type classification.

MSAF (Music Structure Analysis Framework) analyses spectral features to find
musically meaningful section boundaries and assigns repeated-segment labels
(e.g., 'A', 'B', 'A', 'C'). We then classify each label into a human-readable
SectionType using energy, position, and repetition heuristics.

Reference:
    Nieto, O. & Bello, J.P. (2015) "Music Structure Analysis from the Perspective
    of Network Theory", ISMIR.
"""

from __future__ import annotations

import logging
from typing import TypedDict

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

SectionType = (
    "intro",
    "verse",
    "pre_chorus",
    "chorus",
    "bridge",
    "outro",
    "silence",
    "instrumental",
    "breakdown",
    "build",
)

SectionTypeLiteral = str  # Keep as plain str for JSON serialisation compatibility


class SectionInfo(TypedDict):
    """Detected song section.

    Attributes:
        start_ms: Section start time in milliseconds.
        end_ms: Section end time in milliseconds.
        label: MSAF-assigned structural label (e.g., 'A', 'B').
        section_type: Classified human-readable type.
        energy_level: Mean energy relative to global peak (0.0–1.0).
    """

    start_ms: float
    end_ms: float
    label: str
    section_type: SectionTypeLiteral
    energy_level: float


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_sections(
    wav_path: str,
    rms_envelope: NDArray[np.float32],
    frame_rate: float,
    duration_seconds: float,
) -> list[SectionInfo]:
    """Detect and classify structural sections in an audio file.

    Tries MSAF first; falls back to energy-based segmentation if MSAF is
    unavailable or fails. After segmentation, assigns section types using
    position + energy heuristics.

    Args:
        wav_path: Absolute path to WAV file for MSAF analysis.
        rms_envelope: Per-frame RMS energy, shape (n_frames,), normalised [0,1].
        frame_rate: Analysis frame rate in Hz (frames per second).
        duration_seconds: Total audio duration in seconds.

    Returns:
        List of SectionInfo dicts sorted by start time.
    """
    logger.info("Detecting sections in: %s (duration=%.1fs)", wav_path, duration_seconds)

    # Try MSAF first
    boundaries_s, labels = _run_msaf(wav_path, duration_seconds)

    # Fall back to energy-based segmentation if MSAF gave no useful result
    if len(boundaries_s) < 2:
        logger.warning("MSAF returned fewer than 2 boundaries — using energy fallback")
        boundaries_s, labels = _energy_based_segmentation(
            rms_envelope, frame_rate, duration_seconds
        )

    sections = _build_section_list(boundaries_s, labels, rms_envelope, frame_rate)
    sections = _classify_section_types(sections, duration_seconds)

    logger.info("Found %d sections", len(sections))
    return sections


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _run_msaf(
    wav_path: str,
    duration_seconds: float,
) -> tuple[list[float], list[str]]:
    """Run MSAF segmentation on a WAV file.

    Args:
        wav_path: Path to WAV file.
        duration_seconds: Audio duration (seconds) — used as sanity check.

    Returns:
        Tuple of (boundary_times_in_seconds, labels).
        Returns ([0.0, duration_seconds], ['A']) on failure.
    """
    try:
        import msaf  # type: ignore[import]

        boundaries, labels = msaf.process(wav_path, boundaries_id="sf", labels_id="fmc2d")
        # MSAF may return numpy arrays
        boundaries = list(map(float, boundaries))
        labels = list(map(str, labels))

        # Ensure 0.0 is the first boundary
        if not boundaries or boundaries[0] > 0.1:
            boundaries = [0.0] + boundaries
            labels = [labels[0]] + labels if labels else ["A"]

        # Ensure last boundary is at end
        if boundaries[-1] < duration_seconds - 1.0:
            boundaries.append(duration_seconds)

        logger.debug("MSAF boundaries: %s labels: %s", boundaries, labels)
        return boundaries, labels

    except ImportError:
        logger.warning("MSAF not installed — using energy-based fallback")
    except Exception as exc:
        logger.warning("MSAF failed (%s) — using energy-based fallback", exc)

    return [], []


def _energy_based_segmentation(
    rms_envelope: NDArray[np.float32],
    frame_rate: float,
    duration_seconds: float,
    min_section_duration_s: float = 8.0,
) -> tuple[list[float], list[str]]:
    """Segment audio into sections based on RMS energy changes.

    Uses local minima in a smoothed RMS curve as section boundaries.
    Enforces a minimum section duration to avoid over-segmentation.

    Args:
        rms_envelope: Per-frame RMS energy, shape (n_frames,).
        frame_rate: Frames per second.
        duration_seconds: Total audio duration in seconds.
        min_section_duration_s: Minimum section duration in seconds.

    Returns:
        Tuple of (boundary_times_in_seconds, labels).
    """
    from scipy.signal import find_peaks  # type: ignore[import]

    min_frames = max(1, int(min_section_duration_s * frame_rate))

    # Smooth the RMS envelope
    kernel_size = max(1, int(frame_rate * 2))  # 2-second smoothing window
    kernel = np.ones(kernel_size, dtype=np.float32) / kernel_size
    smoothed = np.convolve(rms_envelope, kernel, mode="same")

    # Find valleys (negated peaks) — these are potential section boundaries
    valleys, _ = find_peaks(-smoothed, distance=min_frames, prominence=0.02)

    # Convert frame indices to times
    boundary_times = [0.0] + [float(v / frame_rate) for v in valleys] + [duration_seconds]

    # Generate labels A, B, C, ...
    n_sections = len(boundary_times) - 1
    labels = [chr(ord("A") + (i % 26)) for i in range(n_sections)]

    return boundary_times, labels


def _build_section_list(
    boundaries_s: list[float],
    labels: list[str],
    rms_envelope: NDArray[np.float32],
    frame_rate: float,
) -> list[SectionInfo]:
    """Build SectionInfo list from boundaries, labels, and energy data.

    Args:
        boundaries_s: Boundary times in seconds (includes start=0 and end).
        labels: Section labels, one per section (len = len(boundaries_s) - 1).
        rms_envelope: Per-frame RMS, shape (n_frames,).
        frame_rate: Frames per second.

    Returns:
        List of SectionInfo dicts.
    """
    n_sections = len(boundaries_s) - 1
    global_peak = float(np.max(rms_envelope)) if len(rms_envelope) > 0 else 1.0
    if global_peak == 0.0:
        global_peak = 1.0

    sections: list[SectionInfo] = []
    for i in range(n_sections):
        start_s = boundaries_s[i]
        end_s = boundaries_s[i + 1]
        label = labels[i] if i < len(labels) else chr(ord("A") + i % 26)

        # Compute mean energy for this section
        start_frame = max(0, int(start_s * frame_rate))
        end_frame = min(len(rms_envelope), int(end_s * frame_rate))
        if end_frame > start_frame and len(rms_envelope) > 0:
            section_energy = float(
                np.mean(rms_envelope[start_frame:end_frame]) / global_peak
            )
        else:
            section_energy = 0.0

        sections.append(
            SectionInfo(
                start_ms=round(start_s * 1000.0, 1),
                end_ms=round(end_s * 1000.0, 1),
                label=label,
                section_type="verse",  # Default; classified below
                energy_level=round(float(np.clip(section_energy, 0.0, 1.0)), 4),
            )
        )

    return sections


def _classify_section_types(
    sections: list[SectionInfo],
    duration_seconds: float,
) -> list[SectionInfo]:
    """Assign human-readable section types using position + energy heuristics.

    Heuristics (applied in order):
      1. First section → 'intro' if low energy, else 'verse'
      2. Last section → 'outro' if low energy
      3. Highest-energy sections → 'chorus'
      4. Low-energy middle sections → 'bridge' or 'breakdown'
      5. Rising-energy pre-chorus sections → 'build'
      6. Everything else → 'verse'

    Args:
        sections: Sections with energy_level populated.
        duration_seconds: Full audio duration in seconds.

    Returns:
        Same list with section_type updated.
    """
    if not sections:
        return sections

    energies = [s["energy_level"] for s in sections]
    max_energy = max(energies) if energies else 1.0
    mean_energy = float(np.mean(energies)) if energies else 0.5

    for i, section in enumerate(sections):
        e = section["energy_level"]
        start_fraction = section["start_ms"] / (duration_seconds * 1000.0)
        end_fraction = section["end_ms"] / (duration_seconds * 1000.0)
        is_first = i == 0
        is_last = i == len(sections) - 1

        if is_first and e < mean_energy * 0.7:
            section["section_type"] = "intro"
        elif is_last and e < mean_energy * 0.8:
            section["section_type"] = "outro"
        elif e >= max_energy * 0.85:
            section["section_type"] = "chorus"
        elif e < mean_energy * 0.5 and not is_first and not is_last:
            # Low-energy middle section: bridge or breakdown depending on length
            duration_s = (section["end_ms"] - section["start_ms"]) / 1000.0
            section["section_type"] = "bridge" if duration_s > 20.0 else "breakdown"
        elif (
            i > 0
            and i < len(sections) - 1
            and e > sections[i - 1]["energy_level"] * 1.15
            and sections[i + 1]["section_type"] == "chorus"
        ):
            section["section_type"] = "build"
        elif start_fraction < 0.12 and not is_first:
            section["section_type"] = "intro"
        elif end_fraction > 0.9 and not is_last:
            section["section_type"] = "outro"
        else:
            section["section_type"] = "verse"

    return sections
