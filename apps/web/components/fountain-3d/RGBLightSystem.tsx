'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * RGB LED light visualization.
 *
 * IMPORTANT: Does NOT use THREE.PointLight per LED (too expensive at 150+ LEDs).
 * Instead, renders colored sprite planes that bloom via post-processing,
 * and the light color is passed as uniforms to the particle system emitters.
 *
 * For the bloom glow effect to appear on water, the post-processing
 * UnrealBloomPass (set up in FountainScene) handles light bleed onto nearby surfaces.
 */

interface LEDGroup {
  id: string;
  /** World-space position */
  position: [number, number, number];
  /** Current RGB color (0–1 each) */
  color: [number, number, number];
  /** Brightness 0–1 */
  intensity: number;
}

interface RGBLightSystemProps {
  ledGroups: LEDGroup[];
}

export function RGBLightSystem({ ledGroups }: RGBLightSystemProps) {
  return (
    <>
      {ledGroups.map((group) => (
        <LEDSprite key={group.id} group={group} />
      ))}
    </>
  );
}

function LEDSprite({ group }: { group: LEDGroup }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.color.setRGB(
      group.color[0] * group.intensity,
      group.color[1] * group.intensity,
      group.color[2] * group.intensity,
    );
    // Scale with intensity for a pulsing effect
    const scale = 0.05 + group.intensity * 0.15;
    meshRef.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={meshRef} position={group.position}>
      {/* Small billboard quad — blooms via UnrealBloomPass */}
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color={new THREE.Color(group.color[0], group.color[1], group.color[2])}
        transparent
        opacity={group.intensity * 0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Hook: convert timeline LED keyframe values to LEDGroup[] for a given time.
 *
 * @param ledTracks - LED tracks from show timeline
 * @param currentTimeMs - Current playback time in ms
 * @param fountainConfig - FountainConfig for LED positions
 */
export function useLEDState(
  ledTracks: Array<{ actuator_id: string; keyframes: Array<{ time_ms: number; value_r?: number; value_g?: number; value_b?: number; value: number; easing: string }> }>,
  currentTimeMs: number,
  fountainConfig: Record<string, unknown>,
): LEDGroup[] {
  const leds = (fountainConfig?.leds as { count?: number; groups?: Array<{ id: string }> }) ?? {};
  const groups = leds.groups ?? [{ id: 'all_leds' }];

  return groups.map((group, i) => {
    const track = ledTracks.find((t) => t.actuator_id === `led_${group.id}`);
    if (!track || track.keyframes.length === 0) {
      return {
        id: group.id,
        position: [(-2 + i) as number, 0.1, -2] as [number, number, number],
        color: [0.2, 0.5, 1.0] as [number, number, number],
        intensity: 0.3,
      };
    }

    // Find surrounding keyframes
    let prev = track.keyframes[0];
    let next = track.keyframes[0];
    for (const kf of track.keyframes) {
      if (kf.time_ms <= currentTimeMs) prev = kf;
      if (kf.time_ms >= currentTimeMs) { next = kf; break; }
    }

    const r = ((prev.value_r ?? 0) + (next.value_r ?? 0)) / 2 / 255;
    const g = ((prev.value_g ?? 0) + (next.value_g ?? 0)) / 2 / 255;
    const b = ((prev.value_b ?? 0) + (next.value_b ?? 0)) / 2 / 255;
    const intensity = Math.sqrt(r * r + g * g + b * b) / Math.sqrt(3);

    return {
      id: group.id,
      position: [(-2 + i * 0.5) as number, 0.1, -2] as [number, number, number],
      color: [r, g, b] as [number, number, number],
      intensity,
    };
  });
}
