'use client';

import { Suspense, useState, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

import { ParticleJet } from './ParticleJet';
import { RGBLightSystem, useLEDState } from './RGBLightSystem';
import { AudioSyncPlayer, type PlaybackState } from './AudioSyncPlayer';
import type { NozzleType } from '@fountainflow/shared';

interface NozzleConfig {
  id: string;
  type: NozzleType;
  position_x: number;
  position_y: number;
  max_height_ft?: number;
}

interface FountainSceneProps {
  fountainConfig: Record<string, unknown>;
  simulationData: unknown;
  audioUrl: string | null;
}

interface NozzleTrack {
  actuator_id: string;
  keyframes: Array<{ time_ms: number; value: number; easing: string }>;
}

interface LEDTrack {
  actuator_id: string;
  keyframes: Array<{
    time_ms: number;
    value_r?: number;
    value_g?: number;
    value_b?: number;
    value: number;
    easing: string;
  }>;
}

/**
 * Linear interpolation between two keyframes at the given time.
 * Returns 0 if no keyframes are present.
 */
function interpolateTrack(
  keyframes: Array<{ time_ms: number; value: number; easing: string }>,
  timeMs: number,
): number {
  if (!keyframes || keyframes.length === 0) return 0;

  let prev = keyframes[0];
  let next = keyframes[0];
  for (const kf of keyframes) {
    if (kf.time_ms <= timeMs) prev = kf;
    if (kf.time_ms >= timeMs) {
      next = kf;
      break;
    }
  }

  if (prev === next || next.time_ms === prev.time_ms) return prev.value;
  const t = (timeMs - prev.time_ms) / (next.time_ms - prev.time_ms);
  return prev.value + (next.value - prev.value) * t;
}

/**
 * Maps a nozzle's 2D fountain-plan position to 3D world space.
 * Fountain plan: x is east-west, y is north-south (both in feet).
 * 3D scene: x → x, y → 0 (ground), z → -y (depth).
 */
function nozzleTo3D(nx: number, ny: number): [number, number, number] {
  const scale = 0.05; // feet → world units (20ft ≈ 1 unit)
  return [nx * scale, 0, -ny * scale];
}

function FountainStage({
  fountainConfig,
  simulationData,
  currentTimeMs,
}: {
  fountainConfig: Record<string, unknown>;
  simulationData: unknown;
  currentTimeMs: number;
}) {
  const nozzles = (fountainConfig?.nozzles as NozzleConfig[] | undefined) ?? [];
  const timeline = simulationData as { tracks?: (NozzleTrack | LEDTrack)[] } | null;
  const tracks = timeline?.tracks ?? [];

  const nozzleTracks = tracks.filter((t) =>
    t.actuator_id.startsWith('valve_') || t.actuator_id.startsWith('vfd_'),
  ) as NozzleTrack[];

  const ledTracks = tracks.filter((t) =>
    t.actuator_id.startsWith('led_'),
  ) as LEDTrack[];

  const ledGroups = useLEDState(ledTracks, currentTimeMs, fountainConfig);

  return (
    <>
      {/* Ground pool surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial
          color={new THREE.Color(0.05, 0.15, 0.3)}
          metalness={0.3}
          roughness={0.1}
        />
      </mesh>

      {/* Pool rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[3.8, 4.2, 64]} />
        <meshStandardMaterial color={new THREE.Color(0.4, 0.4, 0.45)} roughness={0.6} />
      </mesh>

      {/* Nozzle particle jets */}
      {nozzles.map((nozzle) => {
        const valveTrack = nozzleTracks.find((t) => t.actuator_id === `valve_${nozzle.id}`);
        const vfdTrack = nozzleTracks.find((t) => t.actuator_id === `vfd_${nozzle.id}`);

        const valveValue = valveTrack
          ? interpolateTrack(valveTrack.keyframes, currentTimeMs)
          : simulationData ? 0 : 0.8; // default on in preview mode
        const vfdValue = vfdTrack
          ? interpolateTrack(vfdTrack.keyframes, currentTimeMs)
          : simulationData ? 0 : 0.7;

        const active = valveValue > 0.5;
        // DMX 0-255 → height multiplier 0-1
        const heightMultiplier = vfdValue / 255;

        const pos3d = nozzleTo3D(nozzle.position_x ?? 0, nozzle.position_y ?? 0);

        // Find nearest LED group color for this nozzle
        const nearestLED = ledGroups[0];
        const color: [number, number, number] = nearestLED
          ? nearestLED.color
          : [0.6, 0.85, 1.0];

        return (
          <ParticleJet
            key={nozzle.id}
            nozzleType={nozzle.type}
            position={pos3d}
            heightMultiplier={active ? Math.max(0.3, heightMultiplier) : 0}
            active={active}
            maxHeightFt={nozzle.max_height_ft ?? 10}
            color={color}
            particleCount={800}
          />
        );
      })}

      {/* Default center jet when no config provided */}
      {nozzles.length === 0 && (
        <ParticleJet
          nozzleType="center_jet"
          position={[0, 0, 0]}
          heightMultiplier={0.75}
          active
          maxHeightFt={12}
          color={[0.5, 0.8, 1.0]}
          particleCount={1200}
        />
      )}

      {/* RGB LED system */}
      <RGBLightSystem ledGroups={ledGroups} />

      {/* Ambient + directional lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />

      {/* Bloom post-processing for LED glow + water shimmer */}
      <EffectComposer>
        <Bloom
          intensity={1.2}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.3}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

export function FountainScene({ fountainConfig, simulationData, audioUrl }: FountainSceneProps) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  const handleTimeUpdate = useCallback((state: PlaybackState) => {
    setCurrentTimeMs(state.currentTimeMs);
  }, []);

  return (
    <div className="relative w-full h-full">
      <Canvas
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        style={{ background: '#050d1a' }}
      >
        <PerspectiveCamera makeDefault position={[0, 4, 8]} fov={50} near={0.1} far={200} />
        <OrbitControls
          target={[0, 1, 0]}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={3}
          maxDistance={20}
          enablePan={false}
        />

        <Suspense fallback={null}>
          <FountainStage
            fountainConfig={fountainConfig}
            simulationData={simulationData}
            currentTimeMs={currentTimeMs}
          />
        </Suspense>

        {/* Grid helper for spatial reference */}
        <Grid
          args={[8, 8]}
          cellSize={0.5}
          cellThickness={0.3}
          cellColor="#1a3a5c"
          sectionSize={2}
          sectionThickness={0.5}
          sectionColor="#0d2a44"
          fadeDistance={20}
          position={[0, -0.005, 0]}
        />
      </Canvas>

      {/* Audio player overlay — outside Canvas (DOM element) */}
      <div className="absolute bottom-4 left-4 right-4">
        <AudioSyncPlayer audioUrl={audioUrl} onTimeUpdate={handleTimeUpdate} />
      </div>
    </div>
  );
}
