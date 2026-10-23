import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { fibonacciSphere, latLngToVec3 } from './geo.js';

const RADIUS = 1.6;
const FOCUS = { lat: 23, lng: 80 }; // centre of India faces the camera

const GLOW_VERTEX = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const GLOW_FRAGMENT = `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    gl_FragColor = vec4(0.96, 0.58, 0.23, 1.0) * intensity;
  }`;

function DottedGlobe() {
  const positions = useMemo(() => fibonacciSphere(5000, RADIUS), []);
  const colors = useMemo(() => {
    const c = new Float32Array(positions.length);
    const gold = new THREE.Color('#ffcf73');
    const rose = new THREE.Color('#ff7a59');
    for (let i = 0; i < positions.length; i += 3) {
      const mix = (positions[i + 1] / RADIUS + 1) / 2; // vertical gradient
      const col = rose.clone().lerp(gold, mix);
      c.set([col.r, col.g, col.b], i);
    }
    return c;
  }, [positions]);

  return (
    <group>
      {/* dark core hides the dots on the far side */}
      <mesh>
        <sphereGeometry args={[RADIUS * 0.985, 64, 64]} />
        <meshBasicMaterial color="#0d0b22" />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.018} vertexColors transparent opacity={0.85} sizeAttenuation />
      </points>
      {/* soft glowing atmosphere (fresnel) */}
      <mesh scale={1.18}>
        <sphereGeometry args={[RADIUS, 48, 48]} />
        <shaderMaterial
          vertexShader={GLOW_VERTEX}
          fragmentShader={GLOW_FRAGMENT}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Marker({ destination, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const ring = useRef();
  const position = useMemo(
    () => latLngToVec3(destination.latitude, destination.longitude, RADIUS * 1.01),
    [destination],
  );
  const outward = useMemo(() => position.clone().multiplyScalar(2), [position]);

  useFrame(({ clock }) => {
    const s = 1 + ((clock.elapsedTime * 0.8 + position.x) % 1) * 1.2;
    ring.current.scale.setScalar(s);
    ring.current.material.opacity = 0.8 - (s - 1) * 0.65;
  });

  return (
    <group position={position}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = '';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(destination);
        }}
      >
        <sphereGeometry args={[hovered ? 0.04 : 0.022, 16, 16]} />
        <meshBasicMaterial color={hovered ? '#ffffff' : '#ffd27a'} />
      </mesh>
      <mesh ref={ring} onUpdate={(m) => m.lookAt(outward)}>
        <ringGeometry args={[0.03, 0.038, 32]} />
        <meshBasicMaterial color="#ffb347" transparent side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {hovered && (
        <Html distanceFactor={6} center style={{ pointerEvents: 'none' }}>
          <div className="globe-label">
            <strong>{destination.name}</strong>
            <span>{destination.packageCount} journeys</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function Halo() {
  const a = useRef();
  const b = useRef();
  useFrame((_, dt) => {
    a.current.rotation.z += dt * 0.08;
    b.current.rotation.z -= dt * 0.05;
  });
  return (
    <group rotation={[Math.PI / 2.3, 0, 0]}>
      <mesh ref={a}>
        <torusGeometry args={[RADIUS * 1.45, 0.004, 8, 160]} />
        <meshBasicMaterial color="#ffd27a" transparent opacity={0.55} />
      </mesh>
      <mesh ref={b} rotation={[0.25, 0.1, 0]}>
        <torusGeometry args={[RADIUS * 1.7, 0.003, 8, 160]} />
        <meshBasicMaterial color="#ff8a5b" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function Globe({ destinations, onSelect }) {
  const group = useRef();
  const base = useMemo(() => {
    const v = latLngToVec3(FOCUS.lat, FOCUS.lng, 1);
    return { y: -Math.atan2(v.x, v.z), x: THREE.MathUtils.degToRad(FOCUS.lat) };
  }, []);

  useFrame(({ clock }) => {
    // gentle sway that keeps India in view
    group.current.rotation.y = base.y + Math.sin(clock.elapsedTime * 0.12) * 0.45;
    group.current.rotation.x = base.x;
  });

  return (
    <group ref={group}>
      <DottedGlobe />
      {destinations.map((d) => (
        <Marker key={d.id} destination={d} onSelect={onSelect} />
      ))}
    </group>
  );
}

export default function HeroScene({ destinations = [], onSelect }) {
  return (
    <Canvas camera={{ position: [0, 0, 5.2], fov: 45 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
      <Stars radius={60} depth={40} count={2500} factor={3} saturation={0} fade speed={0.6} />
      <Sparkles count={70} scale={[7, 5, 4]} size={2.2} speed={0.3} color="#ffd27a" opacity={0.7} />
      <Globe destinations={destinations} onSelect={onSelect} />
      <Halo />
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.5} minPolarAngle={Math.PI / 3} maxPolarAngle={(2 * Math.PI) / 3} />
    </Canvas>
  );
}
