'use client';

import { WaterParticleSystem } from './WaterParticleSystem';
import type { NozzleType } from '@fountainflow/shared';

interface ParticleJetProps {
  nozzleType: NozzleType;
  /** World-space position of this emitter */
  position: [number, number, number];
  /** 0–1: pump speed multiplier (affects jet height) */
  heightMultiplier: number;
  /** Whether the valve is open */
  active: boolean;
  /** Max height in feet → converted to m/s velocity */
  maxHeightFt?: number;
  /** Current LED color as [r,g,b] 0–1 */
  color?: [number, number, number];
  /** GPU budget: how many particles to allocate */
  particleCount?: number;
}

// Nozzle physics config: spread angle and max velocity
const NOZZLE_PHYSICS: Record<NozzleType, { spreadAngle: number; velocityFactor: number }> = {
  center_jet: { spreadAngle: 3, velocityFactor: 1.0 },
  high_jet: { spreadAngle: 4, velocityFactor: 0.95 },
  ring_fountain: { spreadAngle: 20, velocityFactor: 0.7 },
  peacock_tail: { spreadAngle: 35, velocityFactor: 0.65 },
  rising_sun: { spreadAngle: 25, velocityFactor: 0.7 },
  revolving: { spreadAngle: 10, velocityFactor: 0.75 },
  butterfly: { spreadAngle: 30, velocityFactor: 0.7 },
  moving_head: { spreadAngle: 8, velocityFactor: 0.8 },
  organ_fountain: { spreadAngle: 5, velocityFactor: 0.6 },
  corner_jet: { spreadAngle: 15, velocityFactor: 0.55 },
  mist_line: { spreadAngle: 60, velocityFactor: 0.2 },
  water_screen: { spreadAngle: 80, velocityFactor: 0.4 },
  fan_jet: { spreadAngle: 45, velocityFactor: 0.5 },
};

/**
 * Convert max height in feet to initial vertical velocity (m/s).
 * Using kinematic: v = sqrt(2 * g * h)
 * where g = 9.81 m/s², h = height in meters.
 */
function feetToVelocity(heightFt: number): number {
  const heightM = heightFt * 0.3048;
  return Math.sqrt(2 * 9.81 * heightM);
}

export function ParticleJet({
  nozzleType,
  position,
  heightMultiplier,
  active,
  maxHeightFt = 10,
  color = [0.6, 0.85, 1.0],
  particleCount = 1500,
}: ParticleJetProps) {
  const physics = NOZZLE_PHYSICS[nozzleType] ?? NOZZLE_PHYSICS.center_jet;
  const maxVelocity = feetToVelocity(maxHeightFt) * physics.velocityFactor;

  // For ring fountain: render multiple sub-emitters arranged in a ring
  if (nozzleType === 'ring_fountain') {
    const ringCount = 8;
    const ringRadius = 0.3;
    return (
      <>
        {Array.from({ length: ringCount }, (_, i) => {
          const angle = (i / ringCount) * Math.PI * 2;
          const x = position[0] + Math.cos(angle) * ringRadius;
          const z = position[2] + Math.sin(angle) * ringRadius;
          return (
            <WaterParticleSystem
              key={i}
              position={[x, position[1], z]}
              maxVelocity={maxVelocity}
              heightMultiplier={heightMultiplier}
              active={active}
              particleCount={Math.floor(particleCount / ringCount)}
              spreadAngle={physics.spreadAngle}
              emitterColor={color}
            />
          );
        })}
      </>
    );
  }

  // For peacock tail / rising sun: render multiple fan jets
  if (nozzleType === 'peacock_tail' || nozzleType === 'rising_sun') {
    const fanCount = 5;
    const fanSpread = 0.4;
    return (
      <>
        {Array.from({ length: fanCount }, (_, i) => {
          const offset = (i / (fanCount - 1) - 0.5) * fanSpread;
          return (
            <WaterParticleSystem
              key={i}
              position={[position[0] + offset, position[1], position[2]]}
              maxVelocity={maxVelocity * (0.7 + 0.3 * (1 - Math.abs(offset) / fanSpread))}
              heightMultiplier={heightMultiplier}
              active={active}
              particleCount={Math.floor(particleCount / fanCount)}
              spreadAngle={physics.spreadAngle / fanCount}
              emitterColor={color}
            />
          );
        })}
      </>
    );
  }

  // Default: single emitter
  return (
    <WaterParticleSystem
      position={position}
      maxVelocity={maxVelocity}
      heightMultiplier={heightMultiplier}
      active={active}
      particleCount={particleCount}
      spreadAngle={physics.spreadAngle}
      emitterColor={color}
    />
  );
}
