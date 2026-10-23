import * as THREE from 'three';

// Latitude/longitude (degrees) to a point on a sphere of radius r.
export function latLngToVec3(lat, lng, r = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

// Evenly spread points on a sphere (Fibonacci lattice).
export function fibonacciSphere(count, r = 1) {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const t = golden * i;
    positions.set([Math.cos(t) * radius * r, y * r, Math.sin(t) * radius * r], i * 3);
  }
  return positions;
}
