import { Canvas, useFrame } from '@react-three/fiber'
import { Line, Stars, useTexture } from '@react-three/drei'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Home hero: Earth (NASA Blue Marble texture, NASA SVS) with a violet atmosphere, a relay satellite on an
 * inclined orbit, and data bundles leaving it for deep space: the link that carries astronauts' health home.
 */
const reduce = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const atmosphereShader = {
  vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 p=modelViewMatrix*vec4(position,1.); vP=p.xyz; gl_Position=projectionMatrix*p; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vP; uniform vec3 c; void main(){ float f=pow(1.-abs(dot(normalize(-vP),vN)),3.2); gl_FragColor=vec4(c,1.)*f*0.85; }`,
}

function Earth() {
  const map = useTexture('/media/earth-blue-marble-2048.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8 })
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => { if (ref.current && !reduce()) ref.current.rotation.y += dt * 0.035 })
  const atmo = useMemo(() => new THREE.ShaderMaterial({ ...atmosphereShader, uniforms: { c: { value: new THREE.Color('#b794ff') } }, blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false }), [])
  return (
    <group rotation={[0.18, 0, 0.41]}>
      <mesh ref={ref}>
        <sphereGeometry args={[1, 96, 64]} />
        <meshStandardMaterial map={map} roughness={0.85} metalness={0} emissive="#1a0b33" emissiveIntensity={0.35} />
      </mesh>
      <mesh scale={1.06} material={atmo}><sphereGeometry args={[1, 64, 48]} /></mesh>
    </group>
  )
}

function Satellite() {
  const body = new THREE.MeshStandardMaterial({ color: '#d9d2e9', metalness: 0.8, roughness: 0.3 })
  const panel = new THREE.MeshStandardMaterial({ color: '#3b1f7a', metalness: 0.6, roughness: 0.35, emissive: '#7c3aed', emissiveIntensity: 0.35 })
  const gold = new THREE.MeshStandardMaterial({ color: '#e8c070', metalness: 1, roughness: 0.35 })
  return (
    <group scale={0.11}>
      <mesh material={gold}><boxGeometry args={[0.6, 0.6, 0.9]} /></mesh>
      <mesh material={body} position={[0, 0, 0.6]}><cylinderGeometry args={[0.18, 0.18, 0.3, 16]} /></mesh>
      <mesh material={body} position={[0, 0.55, 0]} rotation={[0, 0, 0]}><coneGeometry args={[0.35, 0.3, 24, 1, true]} /></mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={body} position={[s * 0.55, 0, 0]}><boxGeometry args={[0.5, 0.05, 0.05]} /></mesh>
          <mesh material={panel} position={[s * 1.45, 0, 0]}><boxGeometry args={[1.4, 0.04, 0.7]} /></mesh>
        </group>
      ))}
    </group>
  )
}

const ORBIT_R = 1.6
const TARGET = new THREE.Vector3(5.5, 3.2, -4)

function Orbit() {
  const sat = useRef<THREE.Group>(null)
  const pulses = useRef<THREE.Mesh[]>([])
  const pts = useMemo(() => Array.from({ length: 129 }, (_, i) => { const a = (i / 128) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * ORBIT_R, 0, Math.sin(a) * ORBIT_R) }), [])
  const pos = useRef(new THREE.Vector3())
  useFrame(({ clock }) => {
    const t = reduce() ? 1.2 : clock.elapsedTime
    const a = t * 0.18
    pos.current.set(Math.cos(a) * ORBIT_R, 0, Math.sin(a) * ORBIT_R).applyEuler(new THREE.Euler(0.45, 0, -0.25))
    if (sat.current) { sat.current.position.copy(pos.current); sat.current.lookAt(TARGET) }
    pulses.current.forEach((m, i) => {
      if (!m) return
      const k = ((t * 0.22 + i / pulses.current.length) % 1)
      m.position.lerpVectors(pos.current, TARGET, k)
      const s = 0.035 * (1 - k * 0.6)
      m.scale.setScalar(s)
      ;(m.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.95
    })
  })
  return (
    <group>
      <group rotation={[0.45, 0, -0.25]}><Line points={pts} color="#d8b4fe" lineWidth={1} transparent opacity={0.35} dashed dashSize={0.06} gapSize={0.05} /></group>
      <group ref={sat}><Satellite /></group>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} ref={(m) => { if (m) pulses.current[i] = m }}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color="#f0abfc" transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function Rig() {
  useFrame(({ camera, pointer }) => {
    if (reduce()) return
    camera.position.x += (pointer.x * 0.35 - camera.position.x) * 0.03
    camera.position.y += (0.25 + pointer.y * 0.2 - camera.position.y) * 0.03
    camera.lookAt(0, 0, 0)
  })
  return null
}

export function EarthScene() {
  return (
    <Canvas camera={{ position: [0, 0.25, 4.6], fov: 42 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.12} />
      <directionalLight position={[-4, 2.5, 3]} intensity={3.2} color="#fff6ee" />
      <pointLight position={[4, -2, -3]} intensity={25} color="#7c3aed" />
      <Stars radius={60} depth={40} count={2500} factor={2.6} saturation={0.2} fade speed={reduce() ? 0 : 0.6} />
      <Suspense fallback={null}>
        <group position={[1.75, -0.1, 0]} scale={0.78}>
          <Earth />
          <Orbit />
        </group>
      </Suspense>
      <Rig />
    </Canvas>
  )
}
