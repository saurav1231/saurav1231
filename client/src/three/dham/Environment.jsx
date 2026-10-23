// Dusk setting around the temples: gradient sky with a setting sun, snow peaks,
// a stone courtyard and a ring of flickering diyas.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';

const SUN_DIR = new THREE.Vector3(0.25, 0.08, -1).normalize();

const SKY_VERTEX = `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAGMENT = `
  uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
    col = mix(col, top, smoothstep(0.18, 0.6, h));
    float sun = max(dot(normalize(vDir), sunDir), 0.0);
    col += vec3(1.0, 0.55, 0.2) * pow(sun, 18.0) * 0.9;   // warm haze around the sun
    col += vec3(1.0, 0.85, 0.6) * smoothstep(0.9985, 0.9993, sun); // sun disc
    gl_FragColor = vec4(col, 1.0);
  }`;

function Sky() {
  const uniforms = useMemo(
    () => ({
      top: { value: new THREE.Color('#0f0b2b') },
      mid: { value: new THREE.Color('#5a2a5c') },
      horizon: { value: new THREE.Color('#f08d4f') },
      sunDir: { value: SUN_DIR },
    }),
    [],
  );
  return (
    <mesh scale={300}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial uniforms={uniforms} vertexShader={SKY_VERTEX} fragmentShader={SKY_FRAGMENT} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
  );
}

// Seeded random so the mountain range looks the same on every visit.
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function Mountains() {
  const peaks = useMemo(() => {
    const rnd = seeded(7);
    return Array.from({ length: 16 }, (_, i) => {
      const h = 9 + rnd() * 14;
      return { x: -78 + i * 10.5 + rnd() * 4, z: -52 - rnd() * 22, h, r: h * (0.75 + rnd() * 0.3), rot: rnd() * Math.PI };
    });
  }, []);
  return (
    <group>
      {peaks.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rot, 0]}>
          <mesh position={[0, p.h / 2, 0]}>
            <coneGeometry args={[p.r, p.h, 5]} />
            <meshStandardMaterial color="#2b2342" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, p.h * 0.86, 0]}>
            <coneGeometry args={[p.r * 0.29, p.h * 0.28, 5]} />
            <meshStandardMaterial color="#efe6f2" roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Small clay lamps along an arc. All flames flicker from one animation loop.
function Diyas({ center, radius, from, to, count }) {
  const flames = useRef([]);
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = from + ((to - from) * i) / (count - 1);
        return [center[0] + Math.sin(a) * radius, 0, center[2] - Math.cos(a) * radius];
      }),
    [center, radius, from, to, count],
  );
  useFrame(({ clock }) => {
    flames.current.forEach((f, i) => {
      if (!f) return;
      const t = clock.elapsedTime * 9 + i * 1.7;
      f.scale.set(1, 0.85 + Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.06, 1);
    });
  });
  return (
    <group>
      {items.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.11, 0.07, 0.12, 10]} />
            <meshStandardMaterial color="#8a4a26" roughness={0.9} />
          </mesh>
          <mesh ref={(el) => (flames.current[i] = el)} position={[0, 0.2, 0]}>
            <coneGeometry args={[0.045, 0.16, 8]} />
            <meshBasicMaterial color="#ffc46b" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function Environment({ center, radius }) {
  return (
    <>
      <color attach="background" args={['#0f0b2b']} />
      <fog attach="fog" args={['#b0566a', 30, 120]} />
      <Sky />
      <Stars radius={150} depth={40} count={1800} factor={4} saturation={0} fade speed={0.4} />
      <hemisphereLight args={['#ffcf9a', '#2a1830', 0.75]} />
      <ambientLight intensity={0.25} color="#b9a6d9" />
      <directionalLight position={[10, 14, 22]} intensity={1.5} color="#ffd8b0" />
      <directionalLight position={[-6, 5, -30]} intensity={1.1} color="#ff8a5b" />

      {/* ground and courtyard */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[160, 48]} />
        <meshStandardMaterial color="#21152a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0, center[2]]}>
        <ringGeometry args={[radius - 4.2, radius + 3.2, 64, 1]} />
        <meshStandardMaterial color="#3b2a35" roughness={0.95} />
      </mesh>

      <Mountains />
      <Diyas center={center} radius={radius - 3.4} from={-0.85} to={0.85} count={26} />
      <Sparkles count={60} scale={[26, 8, 14]} position={[0, 4, 2]} size={2.4} speed={0.25} color="#ffc46b" opacity={0.8} />
    </>
  );
}
