"""
Choreography engine — main orchestrator.

Three-layer generation:
  Layer 1: section_themes.assign_section_themes() → one theme per section
  Layer 2: beat_scheduler.schedule_beats_for_section() → valve keyframes per beat
  Layer 3: energy_mapper.generate_vfd_keyframes() → VFD keyframes from band energy

Then: color_engine, aesthetic_rules, safety all run as post-processors.
Finally: compile all tracks into a ShowTimeline JSON dict.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from choreography.aesthetic_rules import apply_aesthetic_rules
from choreography.beat_scheduler import schedule_beats_for_section
from choreography.color_engine import generate_led_keyframes
from choreography.energy_mapper import generate_vfd_keyframes
from choreography.safety import enforce_safety_constraints
from choreography.section_themes import assign_section_themes
from settings import WorkerSettings

logger = logging.getLogger(__name__)

GENERATOR_VERSION = "1.0.0"
FRAME_RATE = 40  # fps (DMX-compatible)

# DMX channel assignments for common actuator types
# These are assigned dynamically from fountain_config in _assign_dmx_channels()
_ACTUATOR_TYPE_MAP = {
    "vfd": "vfd",
    "valve": "valve",
    "rgb_led": "rgb_led",
    "laser": "laser",
}


def run_choreography_engine(
    analysis_result: dict[str, Any],
    fountain_config: dict[str, Any],
    song_name: str,
    settings: WorkerSettings,
) -> dict[str, Any]:
    """Generate a complete ShowTimeline from audio analysis + fountain config.

    Args:
        analysis_result: AudioAnalysisResult dict from the audio pipeline.
        fountain_config: FountainConfig dict from the user.
        song_name: Human-readable song name (used in metadata).
        settings: WorkerSettings.

    Returns:
        ShowTimeline dict matching the TypeScript ShowTimeline interface.
    """
    logger.info("Choreography engine starting for song: %s", song_name)

    sections: list[dict[str, Any]] = analysis_result.get("sections", [])
    beats: list[dict[str, Any]] = analysis_result.get("beats", [])
    duration_ms = float(analysis_result.get("duration_ms", 0))
    audio_hash = str(analysis_result.get("audio_hash", ""))

    if not sections:
        logger.warning("No sections detected — using single full-song section")
        sections = [{
            "start_ms": 0,
            "end_ms": duration_ms,
            "label": "A",
            "section_type": "verse",
            "energy_level": 0.5,
        }]

    # ── Layer 1: Assign section themes ────────────────────────────────────
    logger.info("Layer 1: Assigning section themes to %d sections", len(sections))
    themed_sections = assign_section_themes(sections, fountain_config)

    # ── Layer 2: Beat scheduling → valve tracks ────────────────────────────
    logger.info("Layer 2: Scheduling beat-based valve events")
    valve_tracks = _generate_valve_tracks(
        themed_sections=themed_sections,
        beats=beats,
        fountain_config=fountain_config,
        duration_ms=duration_ms,
    )

    # ── Layer 3: Energy mapping → VFD tracks ──────────────────────────────
    logger.info("Layer 3: Mapping band energies to VFD speeds")
    vfd_keyframes_by_nozzle = generate_vfd_keyframes(
        analysis_result=analysis_result,
        fountain_config=fountain_config,
        section_themes=themed_sections,
    )
    vfd_tracks = _build_vfd_tracks(vfd_keyframes_by_nozzle, fountain_config)

    # ── LED color choreography ────────────────────────────────────────────
    logger.info("Generating LED color choreography")
    led_keyframes_by_group = generate_led_keyframes(
        analysis_result=analysis_result,
        fountain_config=fountain_config,
        section_themes=themed_sections,
    )
    led_tracks = _build_led_tracks(led_keyframes_by_group, fountain_config)

    # ── Combine all tracks ─────────────────────────────────────────────────
    all_tracks: list[dict[str, Any]] = valve_tracks + vfd_tracks + led_tracks

    # ── Post-processing: aesthetic rules + safety ─────────────────────────
    logger.info("Applying aesthetic rules")
    all_tracks = apply_aesthetic_rules(all_tracks, analysis_result, fountain_config)

    logger.info("Enforcing safety constraints")
    all_tracks = enforce_safety_constraints(all_tracks, fountain_config)

    # ── Build ShowTimeline ────────────────────────────────────────────────
    config_hash = hashlib.sha256(
        json.dumps(fountain_config, sort_keys=True).encode()
    ).hexdigest()

    total_frames = int(duration_ms / 1000.0 * FRAME_RATE) + 1

    timeline: dict[str, Any] = {
        "version": "1.0",
        "generator": "FountainFlow",
        "metadata": {
            "duration_ms": duration_ms,
            "frame_rate": FRAME_RATE,
            "total_frames": total_frames,
            "fountain_config_hash": config_hash,
            "audio_file_hash": audio_hash,
            "song_name": song_name,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generator_version": GENERATOR_VERSION,
        },
        "tracks": all_tracks,
    }

    logger.info(
        "ShowTimeline generated: %d tracks, duration=%.1fs, frames=%d",
        len(all_tracks),
        duration_ms / 1000.0,
        total_frames,
    )
    return timeline


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _generate_valve_tracks(
    themed_sections: list[tuple[dict[str, Any], Any]],
    beats: list[dict[str, Any]],
    fountain_config: dict[str, Any],
    duration_ms: float,
) -> list[dict[str, Any]]:
    """Generate one valve track per active nozzle with beat-scheduled keyframes.

    Args:
        themed_sections: List of (section, ChoreographyTheme).
        beats: All beat events.
        fountain_config: FountainConfig dict.
        duration_ms: Song duration in ms.

    Returns:
        List of valve Track dicts.
    """
    nozzle_configs: list[dict[str, Any]] = fountain_config.get("nozzles", [])
    valve_config: dict[str, Any] = fountain_config.get("valves", {})

    # Map nozzle_id → valve DMX channel
    nozzle_dmx: dict[str, int] = {}
    dmx_channel = 451  # Start of valve channels (matches CLAUDE.md §5.4)
    for nozzle in nozzle_configs:
        nozzle_id = nozzle["id"]
        count = int(nozzle.get("count", 1))
        for i in range(count):
            valve_name = f"{nozzle_id}_{i + 1:02d}" if count > 1 else nozzle_id
            nozzle_dmx[valve_name] = dmx_channel
            dmx_channel += 1

    # Collect keyframes per nozzle across all sections
    nozzle_keyframes: dict[str, list[dict[str, Any]]] = {}

    for section_idx, (section, theme) in enumerate(themed_sections):
        if theme is None:
            continue
        active_nozzles: list[str] = getattr(theme, "active_nozzles", [])
        total_active = len(active_nozzles)

        for nozzle_idx, nozzle_id in enumerate(active_nozzles):
            section_kfs = schedule_beats_for_section(
                section=section,
                theme=theme,
                all_beats=beats,
                nozzle_id=nozzle_id,
                nozzle_index=nozzle_idx,
                total_nozzles=total_active,
            )
            if nozzle_id not in nozzle_keyframes:
                nozzle_keyframes[nozzle_id] = []
            nozzle_keyframes[nozzle_id].extend(section_kfs)

    # Build Track dicts
    tracks: list[dict[str, Any]] = []
    for nozzle_id, keyframes in nozzle_keyframes.items():
        # Sort and deduplicate keyframes by time
        seen: set[float] = set()
        unique_kfs: list[dict[str, Any]] = []
        for kf in sorted(keyframes, key=lambda k: k["time_ms"]):
            t = kf["time_ms"]
            if t not in seen:
                seen.add(t)
                unique_kfs.append(kf)

        # Ensure keyframe at t=0
        if not unique_kfs or unique_kfs[0]["time_ms"] > 0:
            unique_kfs.insert(0, {"time_ms": 0, "value": 0, "easing": "step"})

        tracks.append({
            "actuator_id": nozzle_id,
            "actuator_name": nozzle_id.replace("_", " ").title(),
            "actuator_type": "valve",
            "dmx_universe": 1,
            "dmx_channel": nozzle_dmx.get(nozzle_id, dmx_channel),
            "keyframes": unique_kfs,
        })

    logger.info("Generated %d valve tracks", len(tracks))
    return tracks


def _build_vfd_tracks(
    vfd_keyframes_by_nozzle: dict[str, list[dict[str, Any]]],
    fountain_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build VFD Track dicts from energy mapper output.

    Args:
        vfd_keyframes_by_nozzle: Dict of nozzle_id → keyframes.
        fountain_config: FountainConfig dict.

    Returns:
        List of VFD Track dicts.
    """
    tracks: list[dict[str, Any]] = []
    # VFD DMX channels start at 489 (see CLAUDE.md §5.4)
    vfd_dmx_start = 489

    for i, (nozzle_id, keyframes) in enumerate(vfd_keyframes_by_nozzle.items()):
        if not keyframes:
            continue
        tracks.append({
            "actuator_id": f"vfd_{nozzle_id}",
            "actuator_name": f"VFD {nozzle_id.replace('_', ' ').title()}",
            "actuator_type": "vfd",
            "dmx_universe": 1,
            "dmx_channel": vfd_dmx_start + i,
            "keyframes": keyframes,
        })

    logger.info("Generated %d VFD tracks", len(tracks))
    return tracks


def _build_led_tracks(
    led_keyframes_by_group: dict[str, list[dict[str, Any]]],
    fountain_config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build RGB LED Track dicts from color engine output.

    Args:
        led_keyframes_by_group: Dict of group_id → keyframes.
        fountain_config: FountainConfig dict.

    Returns:
        List of RGB LED Track dicts.
    """
    led_config: dict[str, Any] = fountain_config.get("leds", {})
    dmx_start = int(led_config.get("dmx_channel_start", 1))
    dmx_universe = int(led_config.get("dmx_universe", 1))
    channels_each = int(led_config.get("channels_per_fixture", 3))

    tracks: list[dict[str, Any]] = []
    for group_id, keyframes in led_keyframes_by_group.items():
        if not keyframes:
            continue
        tracks.append({
            "actuator_id": f"led_{group_id}",
            "actuator_name": f"LED {group_id.replace('_', ' ').title()}",
            "actuator_type": "rgb_led",
            "dmx_universe": dmx_universe,
            "dmx_channel": dmx_start,
            "dmx_channel_count": channels_each,
            "keyframes": keyframes,
        })

    logger.info("Generated %d LED tracks", len(tracks))
    return tracks
