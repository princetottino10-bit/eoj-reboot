// Light in the rain haze: soft additive cones under the table lamp, a few
// lanterns and the nearest neon signs. A cone is brightest at its apex and
// along the lines of sight that cross most of it, fading at the base and with
// distance — a cheap stand-in for volumetric light.
import * as THREE from "./vendor/three/three.module.js";
import type { Obj, Vec3 } from "./world-kit.ts";

const VERT = /* glsl */ `
uniform float uHeight;
varying vec3 vN;
varying vec3 vView;
varying float vT;
void main(){
  vT = clamp(0.5 - position.y / uHeight, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uFlicker;
varying vec3 vN;
varying vec3 vView;
varying float vT;
void main(){
  float facing = abs(dot(normalize(vN), normalize(-vView)));
  float core = pow(facing, 2.0);
  float along = pow(1.0 - vT, 1.4) * smoothstep(0.0, 0.06, vT);
  float dist = 1.0 - smoothstep(12.0, 40.0, length(vView));
  gl_FragColor = vec4(uColor * core * along * dist * uStrength * uFlicker, 1.0);
}`;

export type Beam = { mat: Obj; base: number };

/** A cone of light from `apex` toward `to`, `radius` wide at the far end. */
export const lightCone = (apex: Vec3, to: Vec3, radius: number, color: string, strength: number): { mesh: Obj; beam: Beam } => {
  const a = new THREE.Vector3(apex[0], apex[1], apex[2]);
  const b = new THREE.Vector3(to[0], to[1], to[2]);
  const height = a.distanceTo(b);
  const geo = new THREE.ConeGeometry(radius, height, 28, 1, true);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uFlicker: { value: 1 },
      uHeight: { value: height },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // the cone's apex is +y: point it from a to b
  mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
  mesh.raycast = () => undefined;
  mesh.renderOrder = 5;
  return { mesh, beam: { mat, base: strength } };
};
