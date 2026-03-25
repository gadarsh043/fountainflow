"""
Tests for the choreography engine (all 3 layers + post-processing).
"""

from __future__ import annotations

from typing import Any

import pytest

from choreography.engine import run_choreography_engine
from choreography.section_themes import assign_section_themes, get_theme_for_section_type
from choreography.beat_scheduler import schedule_beats_for_section
from choreography.energy_mapper import generate_vfd_keyframes
from choreography.color_engine import generate_led_keyframes
from choreography.safety import enforce_safety_constraints


class TestSectionThemes:
    def test_assigns_theme_to_every_section(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        sections = minimal_analysis_result["sections"]
        themed = assign_section_themes(sections, small_fountain_config)
        assert len(themed) == len(sections)

    def test_active_nozzles_filtered_to_config(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        sections = minimal_analysis_result["sections"]
        themed = assign_section_themes(sections, small_fountain_config)
        available_ids = {n["id"] for n in small_fountain_config["nozzles"]}
        for _, theme in themed:
            for nozzle_id in theme.active_nozzles:
                assert nozzle_id in available_ids, (
                    f"Nozzle '{nozzle_id}' in theme but not in fountain config"
                )

    def test_chorus_higher_intensity_than_intro(self) -> None:
        intro = get_theme_for_section_type("intro")
        chorus = get_theme_for_section_type("chorus")
        assert chorus.base_vfd_max > intro.base_vfd_max

    def test_silence_theme_is_intermission(self) -> None:
        theme = get_theme_for_section_type("silence")
        assert theme.intermission is True
        assert theme.base_vfd_max <= 30


class TestBeatScheduler:
    def test_valve_keyframes_respect_min_cycle(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        sections = minimal_analysis_result["sections"]
        beats = minimal_analysis_result["beats"]
        themed = assign_section_themes(sections, small_fountain_config)

        for section, theme in themed:
            kfs = schedule_beats_for_section(
                section=section,
                theme=theme,
                all_beats=beats,
                nozzle_id="center_jet",
                nozzle_index=0,
                total_nozzles=1,
            )
            # Check no two consecutive keyframes are closer than 100ms
            times = [kf["time_ms"] for kf in kfs]
            for i in range(1, len(times)):
                delta = times[i] - times[i - 1]
                assert delta >= 100.0, (
                    f"Valve keyframes too close: {times[i - 1]}ms and {times[i]}ms (delta={delta}ms)"
                )

    def test_all_keyframes_within_section_bounds(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        sections = minimal_analysis_result["sections"]
        beats = minimal_analysis_result["beats"]
        themed = assign_section_themes(sections, small_fountain_config)

        for section, theme in themed:
            start_ms = float(section["start_ms"])
            end_ms = float(section["end_ms"])
            kfs = schedule_beats_for_section(
                section=section,
                theme=theme,
                all_beats=beats,
                nozzle_id="center_jet",
                nozzle_index=0,
                total_nozzles=1,
            )
            for kf in kfs:
                t = kf["time_ms"]
                assert start_ms <= t <= end_ms + 1.0, (
                    f"Keyframe at {t}ms outside section [{start_ms}, {end_ms}]"
                )


class TestEnergyMapper:
    def test_returns_keyframes_for_available_nozzles(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        sections = minimal_analysis_result["sections"]
        themed = assign_section_themes(sections, small_fountain_config)
        result = generate_vfd_keyframes(minimal_analysis_result, small_fountain_config, themed)
        assert len(result) > 0, "Should generate VFD keyframes for at least one nozzle"

    def test_vfd_values_in_dmx_range(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        sections = minimal_analysis_result["sections"]
        themed = assign_section_themes(sections, small_fountain_config)
        result = generate_vfd_keyframes(minimal_analysis_result, small_fountain_config, themed)
        for nozzle_id, keyframes in result.items():
            for kf in keyframes:
                v = kf["value"]
                assert 0 <= v <= 255, f"VFD value {v} out of range for nozzle {nozzle_id}"


class TestChoreographyEngine:
    def test_generates_valid_timeline(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        from settings import WorkerSettings
        settings = WorkerSettings()  # Uses env defaults or defaults

        timeline = run_choreography_engine(
            analysis_result=minimal_analysis_result,
            fountain_config=small_fountain_config,
            song_name="test_song",
            settings=settings,
        )

        assert timeline["version"] == "1.0"
        assert timeline["generator"] == "FountainFlow"
        assert "metadata" in timeline
        assert "tracks" in timeline
        assert len(timeline["tracks"]) > 0

    def test_all_tracks_have_keyframes(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        from settings import WorkerSettings
        settings = WorkerSettings()

        timeline = run_choreography_engine(
            analysis_result=minimal_analysis_result,
            fountain_config=small_fountain_config,
            song_name="test_song",
            settings=settings,
        )

        for track in timeline["tracks"]:
            assert len(track.get("keyframes", [])) > 0, (
                f"Track {track['actuator_id']} has no keyframes"
            )

    def test_metadata_matches_analysis(
        self,
        minimal_analysis_result: dict[str, Any],
        small_fountain_config: dict[str, Any],
    ) -> None:
        from settings import WorkerSettings
        settings = WorkerSettings()

        timeline = run_choreography_engine(
            analysis_result=minimal_analysis_result,
            fountain_config=small_fountain_config,
            song_name="test_song",
            settings=settings,
        )

        meta = timeline["metadata"]
        assert meta["duration_ms"] == minimal_analysis_result["duration_ms"]
        assert meta["frame_rate"] == 40
        assert meta["song_name"] == "test_song"


class TestSafetyConstraints:
    def test_vfd_values_clamped(
        self,
        small_fountain_config: dict[str, Any],
    ) -> None:
        tracks = [
            {
                "actuator_id": "vfd_test",
                "actuator_type": "vfd",
                "dmx_universe": 1,
                "dmx_channel": 489,
                "keyframes": [
                    {"time_ms": 0, "value": -10, "easing": "linear"},
                    {"time_ms": 1000, "value": 300, "easing": "linear"},
                ],
            }
        ]
        result = enforce_safety_constraints(tracks, small_fountain_config)
        for kf in result[0]["keyframes"]:
            assert 0 <= kf["value"] <= 255

    def test_valve_timing_constraint(
        self,
        small_fountain_config: dict[str, Any],
    ) -> None:
        tracks = [
            {
                "actuator_id": "center_jet",
                "actuator_type": "valve",
                "dmx_universe": 1,
                "dmx_channel": 451,
                "keyframes": [
                    {"time_ms": 0, "value": 0, "easing": "step"},
                    {"time_ms": 50, "value": 255, "easing": "step"},  # Too soon
                    {"time_ms": 300, "value": 0, "easing": "step"},   # OK
                ],
            }
        ]
        result = enforce_safety_constraints(tracks, small_fountain_config)
        times = [kf["time_ms"] for kf in result[0]["keyframes"]]
        for i in range(1, len(times)):
            assert times[i] - times[i - 1] >= 200, (
                f"Valve transition too fast: {times[i - 1]}ms → {times[i]}ms"
            )
