"""
FountainFlow choreography package.

Transforms AudioAnalysisResult into a ShowTimeline via three layers:
  Layer 1 — section_themes.py  : Section types → active element themes
  Layer 2 — beat_scheduler.py  : Beat events → valve on/off timing
  Layer 3 — energy_mapper.py   : Continuous energy → VFD speed keyframes

Additional modules:
  color_engine.py    — RGB LED color choreography (mood → hue, energy → sat/val)
  aesthetic_rules.py — Post-processing: symmetry, crescendo, silence gaps
  safety.py          — Enforce valve/VFD physics constraints

Templates in choreography/templates/ define per-section element activation.
"""

from choreography.engine import run_choreography_engine

__all__ = ["run_choreography_engine"]
