// Procedural 3D temples. Each style builds its own body and returns where its door is,
// so the camera can fly to the door and through it.
// Units: roughly 1 unit = 4 metres. Every temple faces +Z in its own space.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const damp = THREE.MathUtils.damp;

function useMaterials(colors) {
  return useMemo(() => {
    const stone = new THREE.MeshStandardMaterial({ color: colors.stone, roughness: 0.85, flatShading: true });
    const spire = new THREE.MeshStandardMaterial({
      color: colors.spire,
      roughness: colors.metal ? 0.32 : 0.8,
      metalness: colors.metal ? 0.85 : 0.05,
      flatShading: true,
    });
    const trim = new THREE.MeshStandardMaterial({ color: colors.trim, roughness: 0.7, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: '#e7b84f', roughness: 0.3, metalness: 0.9 });
    const wood = new THREE.MeshStandardMaterial({ color: '#4a2b1a', roughness: 0.7 });
    const saffron = new THREE.MeshStandardMaterial({ color: '#ff8a1f', roughness: 0.6, side: THREE.DoubleSide, emissive: '#7a2c00', emissiveIntensity: 0.3 });
    const water = new THREE.MeshStandardMaterial({ color: '#3d74ad', roughness: 0.18, metalness: 0.15, emissive: '#10243f', emissiveIntensity: 0.6 });
    // remember original colours so the temple can dim and brighten smoothly
    for (const mat of [stone, spire, trim]) mat.userData.base = mat.color.clone();
    return { stone, spire, trim, gold, wood, saffron, water };
  }, [colors]);
}

// Stone platform with three steps leading up to the door.
function Plinth({ w, d, z = 0, m }) {
  return (
    <group>
      <mesh position={[0, 0.25, z]} material={m.trim}>
        <boxGeometry args={[w, 0.5, d]} />
      </mesh>
      {[0, 1, 2].map((k) => {
        const h = (0.5 * (k + 1)) / 3; // lowest step is furthest out
        return (
          <mesh key={k} position={[0, h / 2, z + d / 2 + 0.14 + (2 - k) * 0.28]} material={m.stone}>
            <boxGeometry args={[1.3, h, 0.28]} />
          </mesh>
        );
      })}
    </group>
  );
}

// Door frame, two swinging leaves and warm light behind them.
// `open` is a ref (0 = closed, 1 = fully open) updated by the parent.
function Door({ position, w = 0.7, h = 1.1, open, m }) {
  const left = useRef();
  const right = useRef();
  const glow = useRef();
  const light = useRef();
  useFrame(() => {
    const o = open.current;
    left.current.rotation.y = -o * 1.75;
    right.current.rotation.y = o * 1.75;
    glow.current.material.emissiveIntensity = 0.6 + o * 3.4;
    light.current.intensity = 0.4 + o * 9;
  });
  return (
    <group position={position}>
      {/* frame */}
      <mesh position={[0, h / 2, -0.02]} material={m.gold}>
        <boxGeometry args={[w + 0.16, h + 0.12, 0.06]} />
      </mesh>
      {/* inner light */}
      <mesh ref={glow} position={[0, h / 2, 0.015]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color="#ffd27a" emissive="#ffb347" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, h * 0.55, 0.6]} color="#ffb860" distance={5} decay={2} />
      {/* leaves, hinged at the outer edges */}
      <group ref={left} position={[-w / 2, 0, 0.05]}>
        <mesh position={[w / 4, h / 2, 0]} material={m.wood}>
          <boxGeometry args={[w / 2, h, 0.04]} />
        </mesh>
      </group>
      <group ref={right} position={[w / 2, 0, 0.05]}>
        <mesh position={[-w / 4, h / 2, 0]} material={m.wood}>
          <boxGeometry args={[w / 2, h, 0.04]} />
        </mesh>
      </group>
    </group>
  );
}

function Kalash({ y, m, scale = 1 }) {
  return (
    <group position={[0, y, 0]} scale={scale}>
      <mesh position={[0, 0.1, 0]} material={m.gold}>
        <sphereGeometry args={[0.13, 16, 12]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} material={m.gold}>
        <coneGeometry args={[0.07, 0.26, 12]} />
      </mesh>
    </group>
  );
}

// Saffron dhwaja (flag) that waves.
function Flag({ y, m }) {
  const cloth = useRef();
  const base = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.7, 0.36, 10, 1);
    g.translate(0.35, 0, 0);
    return { geo: g, pos: g.attributes.position.array.slice() };
  }, []);
  useFrame(({ clock }) => {
    const p = base.geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = base.pos[i * 3];
      const yy = base.pos[i * 3 + 1];
      p.setZ(i, Math.sin(x * 7 - clock.elapsedTime * 5) * 0.06 * x);
      p.setY(i, yy * (1 - x * 0.75)); // tapers into a pennant
    }
    p.needsUpdate = true;
  });
  return (
    <group position={[0, y, 0]}>
      <mesh material={m.wood} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 1, 6]} />
      </mesh>
      <mesh ref={cloth} geometry={base.geo} material={m.saffron} position={[0, 0.82, 0]} />
    </group>
  );
}

// North Indian curved spire (shikhara) made by spinning a profile curve.
function Shikhara({ y, height, radius, m }) {
  const geo = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector2(radius * (1 - Math.pow(t, 2.1) * 0.74), t * height));
    }
    const g = new THREE.LatheGeometry(pts, 8);
    g.rotateY(Math.PI / 8);
    return g;
  }, [height, radius]);
  const rings = [0.18, 0.36, 0.54, 0.72];
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={geo} material={m.spire} />
      {rings.map((t) => (
        <mesh key={t} position={[0, t * height, 0]} rotation={[Math.PI / 2, 0, Math.PI / 8]} material={m.trim}>
          <torusGeometry args={[radius * (1 - Math.pow(t, 2.1) * 0.74) * 1.03, 0.035, 4, 8]} />
        </mesh>
      ))}
      {/* amalaka: the ribbed stone disc at the top */}
      <mesh position={[0, height + 0.06, 0]} material={m.stone}>
        <cylinderGeometry args={[radius * 0.4, radius * 0.4, 0.2, 18]} />
      </mesh>
    </group>
  );
}

function buildNagara({ dham, m, open }) {
  const tall = dham.tall ? 1.3 : 1;
  const spireH = 2.8 * tall;
  const top = 2.1 + spireH + 0.18;
  return {
    height: top + 1.2,
    body: (
      <>
        <Plinth w={3.4} d={4.2} z={0.3} m={m} />
        {/* sanctum */}
        <mesh position={[0, 1.3, -0.6]} material={m.stone}>
          <boxGeometry args={[1.8, 1.6, 1.8]} />
        </mesh>
        {/* spire, crown and flag sit above the sanctum */}
        <group position={[0, 0, -0.6]}>
          <Shikhara y={2.1} height={spireH} radius={1.15} m={m} />
          <Kalash y={top - 0.02} m={m} scale={1.3} />
          {dham.chakra ? (
            <mesh position={[0, top + 0.75, 0]}>
              <torusGeometry args={[0.26, 0.045, 8, 24]} />
              <meshStandardMaterial color="#2f6fd6" metalness={0.6} roughness={0.35} />
            </mesh>
          ) : null}
          <Flag y={top + (dham.chakra ? 1.0 : 0.35)} m={m} />
        </group>
        {/* mandapa (porch) with a pyramid roof */}
        <mesh position={[0, 1.15, 0.95]} material={m.stone}>
          <boxGeometry args={[1.6, 1.3, 1.4]} />
        </mesh>
        <mesh position={[0, 2.25, 0.95]} rotation={[0, Math.PI / 4, 0]} material={m.spire}>
          <coneGeometry args={[1.22, 0.9, 4]} />
        </mesh>
        <Kalash y={2.66} m={m} scale={0.7} />
        <Door position={[0, 0.5, 1.66]} open={open} m={m} />
      </>
    ),
  };
}

function buildGopuram({ m, open }) {
  const tiers = [];
  let w = 2.8;
  let d = 1.4;
  let y = 1.9;
  for (let i = 0; i < 6; i++) {
    tiers.push({ w, d, y, i, niches: Math.max(1, Math.floor(w / 0.45)) });
    y += 0.44;
    w -= 0.34;
    d -= 0.1;
  }
  const topW = w + 0.34;
  return {
    height: y + 1.2,
    body: (
      <>
        <Plinth w={3.6} d={3.0} m={m} />
        <mesh position={[0, 1.2, 0]} material={m.stone}>
          <boxGeometry args={[3.0, 1.4, 1.6]} />
        </mesh>
        {tiers.map((t) => (
          <group key={t.i}>
            <mesh position={[0, t.y + 0.18, 0]} material={t.i % 2 ? m.trim : m.spire}>
              <boxGeometry args={[t.w, 0.36, t.d]} />
            </mesh>
            {/* cornice ledge */}
            <mesh position={[0, t.y + 0.38, 0]} material={m.stone}>
              <boxGeometry args={[t.w + 0.1, 0.06, t.d + 0.1]} />
            </mesh>
            {/* sculpted niches on the front face */}
            {Array.from({ length: t.niches }, (_, k) => (
              <mesh key={k} position={[(k - (t.niches - 1) / 2) * 0.42, t.y + 0.18, t.d / 2 + 0.02]} material={m.stone}>
                <boxGeometry args={[0.16, 0.24, 0.04]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* barrel-vault crown with a row of kalashas */}
        <mesh position={[0, y + 0.22, 0]} rotation={[0, 0, Math.PI / 2]} material={m.spire}>
          <cylinderGeometry args={[0.3, 0.3, topW, 12, 1, false, 0, Math.PI]} />
        </mesh>
        {[-2, -1, 0, 1, 2].map((k) => (
          <group key={k} position={[k * (topW / 5.2), 0, 0]}>
            <Kalash y={y + 0.48} m={m} scale={0.8} />
          </group>
        ))}
        <Door position={[0, 0.5, 0.81]} w={0.8} h={1.2} open={open} m={m} />
      </>
    ),
  };
}

function buildGolden({ m, open }) {
  return {
    height: 4.2,
    body: (
      <>
        {/* marble parikrama around the sacred pool */}
        <mesh position={[0, 0.15, 0.4]} material={m.stone}>
          <boxGeometry args={[4.6, 0.3, 5.2]} />
        </mesh>
        <mesh position={[0, 0.31, 0.4]} rotation={[-Math.PI / 2, 0, 0]} material={m.water}>
          <planeGeometry args={[4.0, 4.6]} />
        </mesh>
        {/* causeway */}
        <mesh position={[0, 0.38, 1.8]} material={m.stone}>
          <boxGeometry args={[0.7, 0.14, 2.0]} />
        </mesh>
        <mesh position={[0, 0.48, 0]} material={m.stone}>
          <boxGeometry args={[1.95, 0.36, 1.95]} />
        </mesh>
        <mesh position={[0, 1.36, 0]} material={m.spire}>
          <boxGeometry args={[1.6, 1.4, 1.6]} />
        </mesh>
        <mesh position={[0, 2.12, 0]} material={m.trim}>
          <boxGeometry args={[1.75, 0.12, 1.75]} />
        </mesh>
        <mesh position={[0, 2.45, 0]} material={m.spire}>
          <boxGeometry args={[1.15, 0.6, 1.15]} />
        </mesh>
        {/* main dome, ribbed like a lotus */}
        <mesh position={[0, 2.75, 0]} scale={[1, 1.25, 1]} material={m.spire}>
          <sphereGeometry args={[0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <Kalash y={3.45} m={m} scale={1.1} />
        {/* corner chhatris */}
        {[
          [-0.72, -0.72],
          [0.72, -0.72],
          [-0.72, 0.72],
          [0.72, 0.72],
        ].map(([x, z]) => (
          <group key={`${x}${z}`} position={[x, 2.18, z]}>
            <mesh position={[0, 0.18, 0]} material={m.spire}>
              <cylinderGeometry args={[0.12, 0.12, 0.36, 8]} />
            </mesh>
            <mesh position={[0, 0.38, 0]} material={m.spire}>
              <sphereGeometry args={[0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            </mesh>
          </group>
        ))}
        <Door position={[0, 0.66, 0.81]} w={0.6} h={0.95} open={open} m={m} />
      </>
    ),
  };
}

const BUILDERS = { nagara: buildNagara, gopuram: buildGopuram, golden: buildGolden };

// Door position for each style in the temple's own space (used by the camera).
export function doorOf(dham) {
  if (dham.style === 'gopuram') return { z: 0.81, y: 0.5, h: 1.2 };
  if (dham.style === 'golden') return { z: 0.81, y: 0.66, h: 0.95 };
  return { z: 1.66, y: 0.5, h: 1.1 };
}

export default function Temple({ dham, focused, dimmed, onOver, onOut, onSelect, ...props }) {
  const m = useMaterials(dham.colors);
  const open = useRef(0);
  const group = useRef();
  const built = BUILDERS[dham.style]({ dham, m, open });

  useFrame((_, dt) => {
    open.current = damp(open.current, focused ? 1 : 0, 3, dt);
    const s = damp(group.current.scale.x, focused ? 1.04 : 1, 4, dt);
    group.current.scale.setScalar(s);
    const k = dimmed ? 0.5 : 1;
    for (const mat of [m.stone, m.spire, m.trim]) {
      const b = mat.userData.base;
      mat.color.setRGB(damp(mat.color.r, b.r * k, 4, dt), damp(mat.color.g, b.g * k, 4, dt), damp(mat.color.b, b.b * k, 4, dt));
    }
  });

  return (
    <group
      ref={group}
      {...props}
      onPointerOver={(e) => {
        e.stopPropagation();
        onOver?.();
      }}
      onPointerOut={() => onOut?.()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {built.body}
    </group>
  );
}
