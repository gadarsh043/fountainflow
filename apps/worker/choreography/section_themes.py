"""
Section themes — Layer 1 of choreography generation.

Maps each detected section type to a ChoreographyTheme that specifies:
  - Which nozzle groups are ACTIVE (everything else is off/idle)
  - Suggested base VFD speed range for this theme
  - LED color mood (hue, saturation)
  - Valve trigger pattern

One theme object is created per section; it is consumed by layers 2 and 3
to constrain which effects are activated.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Nozzle groups (matches fountain-config.ts NozzleType values)
# ---------------------------------------------------------------------------

ALL_NOZZLE_GROUPS: list[str] = [
    "water_screen",
    "center_jet",
    "high_jets",
    "ring_fountains",
    "peacock_tail",
    "rising_sun",
    "revolving",
    "organ_fountains",
    "corner_jets",
    "mist_lines",
    "butterfly",
    "moving_head",
]


# ---------------------------------------------------------------------------
# Theme dataclass
# ---------------------------------------------------------------------------


@dataclass
class ChoreographyTheme:
    """Describes the active fountain elements for a section.

    Attributes:
        section_type: Section type string.
        active_nozzles: Nozzle group IDs that are active in this section.
        base_vfd_min: Minimum base VFD speed (0–255) for this section.
        base_vfd_max: Maximum base VFD speed (0–255) for this section.
        led_hue: LED color hue (0.0–1.0) for this section.
        led_saturation: LED color saturation (0.0–1.0).
        valve_pattern: Valve pattern name for beat_scheduler.
        intermission: True if this is a silence/intermission section.
    """

    section_type: str
    active_nozzles: list[str] = field(default_factory=list)
    base_vfd_min: int = 30
    base_vfd_max: int = 200
    led_hue: float = 0.6  # Default: blue
    led_saturation: float = 0.8
    valve_pattern: str = "rhythmic"
    intermission: bool = False


# ---------------------------------------------------------------------------
# Theme library
# ---------------------------------------------------------------------------

_THEME_LIBRARY: dict[str, ChoreographyTheme] = {
    "intro": ChoreographyTheme(
        section_type="intro",
        active_nozzles=["center_jet", "ring_fountains", "corner_jets"],
        base_vfd_min=20,
        base_vfd_max=120,
        led_hue=0.62,       # Cool blue/teal
        led_saturation=0.5,
        valve_pattern="gentle",
    ),
    "verse": ChoreographyTheme(
        section_type="verse",
        active_nozzles=["center_jet", "ring_fountains", "organ_fountains", "corner_jets"],
        base_vfd_min=40,
        base_vfd_max=160,
        led_hue=0.55,       # Cyan/blue
        led_saturation=0.7,
        valve_pattern="rhythmic",
    ),
    "pre_chorus": ChoreographyTheme(
        section_type="pre_chorus",
        active_nozzles=["center_jet", "high_jets", "ring_fountains", "peacock_tail", "corner_jets"],
        base_vfd_min=80,
        base_vfd_max=200,
        led_hue=0.45,       # Green/cyan
        led_saturation=0.85,
        valve_pattern="building",
    ),
    "chorus": ChoreographyTheme(
        section_type="chorus",
        active_nozzles=ALL_NOZZLE_GROUPS,  # Everything on in chorus
        base_vfd_min=150,
        base_vfd_max=255,
        led_hue=0.0,        # Red/orange — high energy
        led_saturation=1.0,
        valve_pattern="spectacle",
    ),
    "bridge": ChoreographyTheme(
        section_type="bridge",
        active_nozzles=["water_screen", "mist_lines", "revolving", "moving_head"],
        base_vfd_min=30,
        base_vfd_max=140,
        led_hue=0.75,       # Purple/violet — unique feel
        led_saturation=0.9,
        valve_pattern="sweeping",
    ),
    "breakdown": ChoreographyTheme(
        section_type="breakdown",
        active_nozzles=["center_jet", "mist_lines"],
        base_vfd_min=10,
        base_vfd_max=80,
        led_hue=0.67,       # Blue/indigo — minimal
        led_saturation=0.4,
        valve_pattern="minimal",
    ),
    "build": ChoreographyTheme(
        section_type="build",
        active_nozzles=["center_jet", "high_jets", "ring_fountains", "peacock_tail",
                        "organ_fountains", "corner_jets"],
        base_vfd_min=60,
        base_vfd_max=220,
        led_hue=0.12,       # Orange — rising energy
        led_saturation=0.9,
        valve_pattern="building",
    ),
    "outro": ChoreographyTheme(
        section_type="outro",
        active_nozzles=["center_jet", "ring_fountains", "mist_lines"],
        base_vfd_min=10,
        base_vfd_max=100,
        led_hue=0.6,        # Blue — fading out
        led_saturation=0.4,
        valve_pattern="gentle",
    ),
    "instrumental": ChoreographyTheme(
        section_type="instrumental",
        active_nozzles=["center_jet", "high_jets", "peacock_tail", "rising_sun", "revolving"],
        base_vfd_min=60,
        base_vfd_max=180,
        led_hue=0.3,        # Green — melodic
        led_saturation=0.7,
        valve_pattern="rhythmic",
    ),
    "silence": ChoreographyTheme(
        section_type="silence",
        active_nozzles=["center_jet"],
        base_vfd_min=10,
        base_vfd_max=30,
        led_hue=0.6,        # Cool blue
        led_saturation=0.3,
        valve_pattern="minimal",
        intermission=True,
    ),
}

# Fallback theme for unknown section types
_DEFAULT_THEME = ChoreographyTheme(
    section_type="verse",
    active_nozzles=["center_jet", "ring_fountains"],
    base_vfd_min=40,
    base_vfd_max=160,
    led_hue=0.55,
    led_saturation=0.7,
    valve_pattern="rhythmic",
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def assign_section_themes(
    sections: list[dict[str, Any]],
    fountain_config: dict[str, Any],
) -> list[tuple[dict[str, Any], ChoreographyTheme]]:
    """Assign a ChoreographyTheme to every section.

    Filters the theme's active_nozzles to only include nozzle IDs that exist
    in the fountain config, preventing references to hardware not present.

    Args:
        sections: List of SectionInfo dicts from AudioAnalysisResult.
        fountain_config: FountainConfig dict from the user.

    Returns:
        List of (section, theme) tuples in the same order as input sections.
    """
    # Build set of available nozzle IDs from config
    available_nozzles: set[str] = {
        n["id"] for n in fountain_config.get("nozzles", [])
    }

    results: list[tuple[dict[str, Any], ChoreographyTheme]] = []
    for section in sections:
        section_type = section.get("section_type", "verse")
        theme = _THEME_LIBRARY.get(section_type, _DEFAULT_THEME)

        # Filter active nozzles to those present in the fountain config
        available_active = [
            n for n in theme.active_nozzles if n in available_nozzles
        ]
        # If nothing matches (e.g., a very small fountain), keep center_jet as minimum
        if not available_active and available_nozzles:
            available_active = list(available_nozzles)[:1]

        # Create a copy with filtered nozzles (avoid mutating shared library objects)
        from dataclasses import replace
        filtered_theme = replace(theme, active_nozzles=available_active)

        logger.debug(
            "Section [%s] at %dms → theme=%s, nozzles=%s",
            section_type,
            section.get("start_ms", 0),
            section_type,
            available_active,
        )
        results.append((section, filtered_theme))

    logger.info("Assigned themes to %d sections", len(results))
    return results


def get_theme_for_section_type(section_type: str) -> ChoreographyTheme:
    """Get the default theme for a section type.

    Args:
        section_type: Section type string.

    Returns:
        ChoreographyTheme for that type, or the default verse theme.
    """
    return _THEME_LIBRARY.get(section_type, _DEFAULT_THEME)
