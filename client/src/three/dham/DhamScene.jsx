// The 3D hero: five dhams on an arc. The parent (Home.jsx) owns which dham is focused
// and whether we are "entering"; this file turns that state into camera movement.
//
//  overview  -> camera sees all temples (desktop)
//  focused   -> camera glides to the temple's door, doors open
//  entering  -> camera flies through the door (parent fades the screen and navigates)
//
// On narrow screens (phones) one temple is always focused and the camera frames it fully.
import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import Temple, { doorOf } from './Temple.jsx';
import Environment from './Environment.jsx';
import { DHAMS } from './dhams.js';

const RADIUS = 11; // temples stand on a circle around CENTER, facing it
const CENTER = [0, 0, 11];
const SPREAD = 0.72; // radians from the middle temple to the outer ones
const damp = THREE.MathUtils.damp;

function layout() {
  return DHAMS.map((dham, i) => {
    const a = -SPREAD + (2 * SPREAD * i) / (DHAMS.length - 1);
    const position = new THREE.Vector3(CENTER[0] + Math.sin(a) * RADIUS, 0, CENTER[2] - Math.cos(a) * RADIUS);
    const rotationY = -a;
    const facing = new THREE.Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
    const d = doorOf(dham);
    const door = position.clone().add(facing.clone().multiplyScalar(d.z)).setY(d.y + d.h / 2);
    return { dham, position, rotationY, facing, door };
  });
}

function CameraRig({ slots, focused, entering, compact }) {
  const { camera, size, pointer } = useThree();
  const look = useRef(new THREE.Vector3(0, 3, 0));
  const pos = useMemo(() => new THREE.Vector3(), []);
  const tgt = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, dt) => {
    const aspect = size.width / size.height;
    const slot = slots.find((s) => s.dham.slug === (entering || focused));

    if (entering && slot) {
      // through the doorway
      pos.copy(slot.door).addScaledVector(slot.facing, -1.6);
      tgt.copy(slot.door).addScaledVector(slot.facing, -8);
    } else if (slot && compact) {
      // phone: frame the whole temple, placed low so the headline sits in the sky
      pos.copy(slot.door).addScaledVector(slot.facing, 19).add(new THREE.Vector3(0, 2.2, 0));
      tgt.copy(slot.door).add(new THREE.Vector3(0, 3.2, 0));
    } else if (slot) {
      // desktop hover: walk up to the door
      pos.copy(slot.door).addScaledVector(slot.facing, 4.8).add(new THREE.Vector3(0, 0.9, 0));
      tgt.copy(slot.door).add(new THREE.Vector3(0, 0.8, 0));
    } else {
      // overview, pulled back far enough for every temple to fit the screen
      const dist = Math.max(17, 2.4 + 13 / (Math.tan(THREE.MathUtils.degToRad(22.5)) * aspect));
      pos.set(pointer.x * 0.8 + Math.sin(clock.elapsedTime * 0.15) * 0.4, 2.4 + pointer.y * 0.3, dist);
      tgt.set(0, 5.6, 0);
    }

    const speed = entering ? 2.2 : 2.6;
    camera.position.set(damp(camera.position.x, pos.x, speed, dt), damp(camera.position.y, pos.y, speed, dt), damp(camera.position.z, pos.z, speed, dt));
    look.current.set(damp(look.current.x, tgt.x, speed, dt), damp(look.current.y, tgt.y, speed, dt), damp(look.current.z, tgt.z, speed, dt));
    camera.lookAt(look.current);
  });
  return null;
}

export default function DhamScene({ focused, entering, compact, onFocus, onBlur, onEnter }) {
  const slots = useMemo(layout, []);
  const leaveTimer = useRef();

  const over = (slug) => {
    clearTimeout(leaveTimer.current);
    if (!compact && !entering) onFocus(slug);
  };
  // small delay so moving between parts of a temple, or the camera moving, doesn't flicker
  const out = () => {
    if (compact) return;
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(onBlur, 450);
  };
  const select = (slug) => {
    if (compact && focused !== slug) onFocus(slug);
    else onEnter(slug);
  };

  return (
    <Canvas
      camera={{ position: [0, 3.4, 22], fov: 45, near: 0.1, far: 700 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      onPointerLeave={() => !compact && onBlur()}
    >
      <Environment center={CENTER} radius={RADIUS} />
      {slots.map(({ dham, position, rotationY }) => (
        <group key={dham.slug} position={position} rotation={[0, rotationY, 0]}>
          <Temple
            dham={dham}
            focused={(entering || focused) === dham.slug}
            dimmed={!!(entering || focused) && (entering || focused) !== dham.slug}
            onOver={() => over(dham.slug)}
            onOut={out}
            onSelect={() => select(dham.slug)}
          />
        </group>
      ))}
      <CameraRig slots={slots} focused={focused} entering={entering} compact={compact} />
    </Canvas>
  );
}
