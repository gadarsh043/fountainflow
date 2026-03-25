'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * GPU-driven water particle system.
 *
 * Physics computed entirely in vertex shader:
 *   p(t) = p0 + v0*t + 0.5*g*t^2   (kinematic equation)
 *   g = -9.81 m/s² (downward gravity)
 *
 * CPU sends only:
 *   - uTime: current time (seconds)
 *   - uHeightMultiplier: pump speed factor (0–1)
 *   - uActive: whether this emitter is open
 */

const VERTEX_SHADER = `
attribute vec3 aInitialPosition;
attribute vec3 aVelocity;
attribute float aLifetime;
attribute float aBirthTime;
attribute float aSize;
attribute vec3 aColor;

uniform float uTime;
uniform float uHeightMultiplier;
uniform float uActive;
uniform vec3 uEmitterColor;

varying vec3 vColor;
varying float vAlpha;

void main() {
  float age = mod(uTime - aBirthTime, aLifetime);
  float normalizedAge = age / aLifetime;

  // Kinematic: p = p0 + v0*t + 0.5*a*t^2 (gravity = -9.81 m/s^2)
  vec3 velocity = aVelocity * uHeightMultiplier;
  vec3 pos = aInitialPosition
    + velocity * age
    + vec3(0.0, -4.905, 0.0) * age * age;

  // Fade out towards end of lifetime
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, normalizedAge);
  vAlpha = uActive > 0.5 ? fadeOut * 0.85 : 0.0;

  // Mix base water color with emitter-specific color
  vColor = mix(aColor, uEmitterColor, 0.3);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Size attenuates with distance
  gl_PointSize = aSize * (280.0 / -mvPosition.z);
}
`;

const FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vAlpha;

void main() {
  // Circular particle shape with soft edges
  vec2 coord = gl_PointCoord - vec2(0.5);
  float r = dot(coord, coord);
  if (r > 0.25) discard;

  // Soft circular falloff
  float alpha = vAlpha * (1.0 - r * 3.5);
  gl_FragColor = vec4(vColor, alpha);
}
`;

interface WaterParticleSystemProps {
  /** Emitter position in world space */
  position: [number, number, number];
  /** Initial upward velocity of particles (m/s at full height) */
  maxVelocity: number;
  /** Current pump speed (0–1), affects jet height */
  heightMultiplier: number;
  /** Whether the valve is open */
  active: boolean;
  /** Particle count (scales with GPU capability) */
  particleCount?: number;
  /** Spread angle in degrees (0 = straight up) */
  spreadAngle?: number;
  /** Base water color */
  waterColor?: [number, number, number];
  /** Override color (from RGB LEDs nearby) */
  emitterColor?: [number, number, number];
}

export function WaterParticleSystem({
  position,
  maxVelocity,
  heightMultiplier,
  active,
  particleCount = 2000,
  spreadAngle = 5,
  waterColor = [0.6, 0.85, 1.0],
  emitterColor = [0.6, 0.85, 1.0],
}: WaterParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const spreadRad = (spreadAngle * Math.PI) / 180;

  const { geometry } = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    const initialPositions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const lifetimes = new Float32Array(particleCount);
    const birthTimes = new Float32Array(particleCount);
    const sizes = new Float32Array(particleCount);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      // Emit from a small area around the nozzle position
      initialPositions[i * 3] = (Math.random() - 0.5) * 0.05;
      initialPositions[i * 3 + 1] = 0;
      initialPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.05;

      // Spread angle for fan/peacock nozzles
      const angle = (Math.random() - 0.5) * spreadRad;
      const side = (Math.random() - 0.5) * spreadRad;
      velocities[i * 3] = Math.sin(side) * maxVelocity;
      velocities[i * 3 + 1] = Math.cos(angle) * maxVelocity * (0.85 + Math.random() * 0.3);
      velocities[i * 3 + 2] = Math.sin(angle) * maxVelocity * 0.15;

      // Stagger birth times so particles don't all reset simultaneously
      lifetimes[i] = 1.5 + Math.random() * 1.0;
      birthTimes[i] = Math.random() * lifetimes[i];

      sizes[i] = 0.8 + Math.random() * 1.2;

      // Slight color variation
      colors[i * 3] = waterColor[0] * (0.9 + Math.random() * 0.2);
      colors[i * 3 + 1] = waterColor[1] * (0.9 + Math.random() * 0.2);
      colors[i * 3 + 2] = waterColor[2] * (0.85 + Math.random() * 0.15);
    }

    geo.setAttribute('aInitialPosition', new THREE.BufferAttribute(initialPositions, 3));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geo.setAttribute('aLifetime', new THREE.BufferAttribute(lifetimes, 1));
    geo.setAttribute('aBirthTime', new THREE.BufferAttribute(birthTimes, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    return { geometry: geo };
  }, [particleCount, maxVelocity, spreadAngle, waterColor.join(',')]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uTime: { value: 0 },
          uHeightMultiplier: { value: heightMultiplier },
          uActive: { value: active ? 1.0 : 0.0 },
          uEmitterColor: { value: new THREE.Color(...emitterColor) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );

  // Update uniforms each frame — only a float per frame goes to GPU
  useFrame(({ clock }) => {
    if (!material) return;
    material.uniforms.uTime.value = clock.elapsedTime;
    material.uniforms.uHeightMultiplier.value = heightMultiplier;
    material.uniforms.uActive.value = active ? 1.0 : 0.0;
    material.uniforms.uEmitterColor.value.set(emitterColor[0], emitterColor[1], emitterColor[2]);
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return (
    <points ref={pointsRef} position={position} geometry={geometry} material={material} />
  );
}
