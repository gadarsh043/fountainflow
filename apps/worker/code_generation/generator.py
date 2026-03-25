"""
Code generation dispatcher — routes to the correct generator based on target platform.
"""

from __future__ import annotations

import logging
from typing import Any

from settings import WorkerSettings

logger = logging.getLogger(__name__)

SUPPORTED_PLATFORMS = {
    "arduino_mega",
    "esp32",
    "dmx_artnet",
    "json_timeline",
    "csv",
    "modbus",
}


def run_code_generation(
    show_timeline: dict[str, Any],
    fountain_config: dict[str, Any],
    target_platforms: list[str],
    settings: WorkerSettings,
) -> list[dict[str, Any]]:
    """Generate code for all requested target platforms.

    Args:
        show_timeline: ShowTimeline dict from the choreography engine.
        fountain_config: FountainConfig dict.
        target_platforms: List of platform strings to generate for.
        settings: WorkerSettings.

    Returns:
        List of GenerationResult dicts (one per platform).
    """
    results: list[dict[str, Any]] = []

    for platform in target_platforms:
        if platform not in SUPPORTED_PLATFORMS:
            logger.warning("Unsupported platform '%s' — skipping", platform)
            continue

        logger.info("Generating code for platform: %s", platform)
        try:
            result = _dispatch(platform, show_timeline, fountain_config)
            results.append(result)
            logger.info(
                "Code generation complete for %s: %d files, %d bytes",
                platform,
                len(result.get("files", [])),
                result.get("storage_required_bytes", 0),
            )
        except Exception as exc:
            logger.exception("Code generation failed for platform %s: %s", platform, exc)
            raise RuntimeError(f"Code generation failed for {platform}: {exc}") from exc

    if not results:
        logger.warning("No valid target platforms specified — generating JSON timeline as fallback")
        results.append(_dispatch("json_timeline", show_timeline, fountain_config))

    return results


def _dispatch(
    platform: str,
    show_timeline: dict[str, Any],
    fountain_config: dict[str, Any],
) -> dict[str, Any]:
    """Dispatch to the appropriate generator function.

    Args:
        platform: Target platform string.
        show_timeline: ShowTimeline dict.
        fountain_config: FountainConfig dict.

    Returns:
        GenerationResult dict.

    Raises:
        ValueError: If platform is not supported.
    """
    if platform == "arduino_mega":
        from code_generation.arduino_mega import generate_arduino_mega
        return generate_arduino_mega(show_timeline, fountain_config)

    elif platform == "esp32":
        from code_generation.esp32 import generate_esp32
        return generate_esp32(show_timeline, fountain_config)

    elif platform == "dmx_artnet":
        from code_generation.dmx_artnet import generate_dmx_artnet
        return generate_dmx_artnet(show_timeline, fountain_config)

    elif platform == "json_timeline":
        from code_generation.json_timeline import generate_json_timeline
        return generate_json_timeline(show_timeline, fountain_config)

    elif platform == "csv":
        from code_generation.csv_export import generate_csv
        return generate_csv(show_timeline, fountain_config)

    elif platform == "modbus":
        from code_generation.modbus_sequence import generate_modbus_sequence
        return generate_modbus_sequence(show_timeline, fountain_config)

    else:
        raise ValueError(f"Unsupported platform: {platform}")
