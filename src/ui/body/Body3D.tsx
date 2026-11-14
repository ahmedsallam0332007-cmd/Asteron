import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Status, SystemId } from '../../engine/types'
import { SYSTEM_LABEL } from '../../lib/systems'

/**
 * Holographic human body (procedural, no third-party model). Each organ group belongs to one engine system
 * and glows in that system's status colour. Readings sit on glass cards around the body (outside the 3D scene),
 * and every card carries an icon and a word, so status is never colour-only.
 */
const STATUS_COLOR: Record<Status, string> = { normal: '#eae2ff', watch: '#f5b700', concern: '#f97316', urgent: '#ef4444', unknown: '#94a3b8' }
const STATUS_ICON: Record<Status, string> = { normal: '●', watch: '◆', concern: '▲', urgent: '✖', unknown: '?' }
const STATUS_WORD: Record<Status, string> = { normal: 'Normal', watch: 'Watch', concern: 'Concern', urgent: 'Urgent', unknown: 'Unknown' }
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const holo = {
  vertexShader: `varying vec3 vN; varying vec3 vP; varying float vY; void main(){ vN=normalize(normalMatrix*normal); vec4 p=modelViewMatrix*vec4(position,1.); vP=p.xyz; vY=(modelMatrix*vec4(position,1.)).y; gl_Position=projectionMatrix*p; }`,
  fragmentShader: `uniform vec3 c; uniform float t; varying vec3 vN; varying vec3 vP; varying float vY;
    void main(){ float f=pow(1.-abs(dot(normalize(-vP),vN)),2.2); float lines=.5+.5*sin(vY*90.-t*2.); float scan=smoothstep(.06,0.,abs(fract(vY*.35-t*.12)-.5)-.44);
      gl_FragColor=vec4(c*(f*1.15+.06+lines*.04)+vec3(.9,.85,1.)*scan*.35, f*.85+.08); }`,
}

/** One shared hologram material for every body on the page (module scope: animated outside React state). */
const HOLO_UNIFORMS = { c: { value: new THREE.Color('#b9a6ff') }, t: { value: 0 } }
const HOLO_MAT = new THREE.ShaderMaterial({ ...holo, uniforms: HOLO_UNIFORMS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })

function Shell() {
  const mat = HOLO_MAT
  useFrame(({ clock }) => { if (!reduceMotion()) HOLO_UNIFORMS.t.value = clock.elapsedTime })
  const parts = useMemo(() => [
    { p: [0, 1.63, 0], g: new THREE.SphereGeometry(0.155, 40, 28), s: [1, 1.12, 1.05] },
    { p: [0, 1.43, 0], g: new THREE.CylinderGeometry(0.055, 0.065, 0.13, 20) },
    { p: [0, 1.1, 0], g: new THREE.CapsuleGeometry(0.2, 0.34, 10, 28), s: [1.12, 1, 0.66] },
    { p: [0, 0.74, 0], g: new THREE.CapsuleGeometry(0.17, 0.12, 10, 28), s: [1.05, 1, 0.7] },
    { p: [-0.3, 1.11, 0], r: [0, 0, 0.16], g: new THREE.CapsuleGeometry(0.05, 0.3, 8, 16) },
    { p: [0.3, 1.11, 0], r: [0, 0, -0.16], g: new THREE.CapsuleGeometry(0.05, 0.3, 8, 16) },
    { p: [-0.37, 0.77, 0.02], r: [0, 0, 0.06], g: new THREE.CapsuleGeometry(0.04, 0.3, 8, 16) },
    { p: [0.37, 0.77, 0.02], r: [0, 0, -0.06], g: new THREE.CapsuleGeometry(0.04, 0.3, 8, 16) },
    { p: [-0.39, 0.53, 0.03], g: new THREE.SphereGeometry(0.045, 16, 12), s: [0.8, 1.3, 0.5] },
    { p: [0.39, 0.53, 0.03], g: new THREE.SphereGeometry(0.045, 16, 12), s: [0.8, 1.3, 0.5] },
    { p: [-0.1, 0.33, 0], g: new THREE.CapsuleGeometry(0.075, 0.38, 8, 16) },
    { p: [0.1, 0.33, 0], g: new THREE.CapsuleGeometry(0.075, 0.38, 8, 16) },
    { p: [-0.1, -0.15, 0], g: new THREE.CapsuleGeometry(0.055, 0.38, 8, 16) },
    { p: [0.1, -0.15, 0], g: new THREE.CapsuleGeometry(0.055, 0.38, 8, 16) },
    { p: [-0.1, -0.42, 0.05], g: new THREE.SphereGeometry(0.05, 16, 10), s: [0.8, 0.5, 1.6] },
    { p: [0.1, -0.42, 0.05], g: new THREE.SphereGeometry(0.05, 16, 10), s: [0.8, 0.5, 1.6] },
  ] as { p: [number, number, number]; r?: [number, number, number]; s?: [number, number, number]; g: THREE.BufferGeometry }[], [])
  return <group>{parts.map((x, i) => <mesh key={i} position={x.p} rotation={x.r ?? [0, 0, 0]} scale={x.s ?? [1, 1, 1]} geometry={x.g} material={mat} />)}</group>
}

interface OrganDef { system: SystemId; pieces: { p: [number, number, number]; s: [number, number, number] }[] }
const ORGANS: OrganDef[] = [
  { system: 'brain', pieces: [{ p: [0, 1.66, 0.0], s: [0.11, 0.095, 0.115] }] },
  { system: 'cardio', pieces: [{ p: [0.045, 1.09, 0.06], s: [0.06, 0.07, 0.055] }] },
  { system: 'resp', pieces: [{ p: [-0.085, 1.15, 0.0], s: [0.07, 0.13, 0.065] }, { p: [0.1, 1.16, -0.01], s: [0.065, 0.125, 0.06] }] },
  { system: 'metabolic', pieces: [{ p: [0.05, 0.9, 0.04], s: [0.1, 0.055, 0.06] }, { p: [-0.05, 0.82, 0.05], s: [0.06, 0.045, 0.045] }, { p: [0, 0.74, 0.04], s: [0.09, 0.05, 0.05] }] },
  { system: 'msk', pieces: [
    { p: [0, 1.05, -0.1], s: [0.018, 0.34, 0.018] }, { p: [-0.1, 0.33, 0], s: [0.022, 0.22, 0.022] }, { p: [0.1, 0.33, 0], s: [0.022, 0.22, 0.022] },
    { p: [-0.1, -0.15, 0], s: [0.018, 0.21, 0.018] }, { p: [0.1, -0.15, 0], s: [0.018, 0.21, 0.018] }, { p: [0, 0.66, -0.02], s: [0.12, 0.04, 0.05] }] },
  { system: 'immune', pieces: [
    { p: [-0.05, 1.41, 0.04], s: [0.018, 0.018, 0.018] }, { p: [0.05, 1.41, 0.04], s: [0.018, 0.018, 0.018] },
    { p: [-0.2, 1.24, 0.02], s: [0.02, 0.02, 0.02] }, { p: [0.2, 1.24, 0.02], s: [0.02, 0.02, 0.02] },
    { p: [-0.11, 0.6, 0.07], s: [0.02, 0.02, 0.02] }, { p: [0.11, 0.6, 0.07], s: [0.02, 0.02, 0.02] }, { p: [-0.12, 0.92, -0.02], s: [0.04, 0.028, 0.028] }] },
]

function Organ({ def, status, onPick }: { def: OrganDef; status: Status; onPick?: (s: SystemId) => void }) {
  const ref = useRef<THREE.Group>(null)
  const color = STATUS_COLOR[status]
  const alert = status === 'concern' || status === 'urgent'
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: status === 'normal' ? 0.55 : status === 'unknown' ? 0.35 : 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), [color, status])
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: status === 'normal' || status === 'unknown' ? 0.08 : 0.28, blending: THREE.AdditiveBlending, depthWrite: false }), [color, status])
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 28, 18), [])
  useFrame(({ clock }) => {
    if (!ref.current || reduceMotion()) return
    ref.current.scale.setScalar(alert ? 1 + 0.09 * Math.sin(clock.elapsedTime * (status === 'urgent' ? 6 : 3.4)) : 1)
  })
  return (
    <group ref={ref}>
      {def.pieces.map((x, i) => (
        <group key={i} position={x.p}>
          <mesh scale={x.s} geometry={sphere} material={mat} onClick={(e) => { e.stopPropagation(); onPick?.(def.system) }}
            onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }} />
          <mesh scale={x.s.map((v) => v * 1.9) as [number, number, number]} geometry={sphere} material={glow} />
        </group>
      ))}
    </group>
  )
}

function Platform() {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (ref.current && !reduceMotion()) ref.current.rotation.z += dt * 0.15 })
  return (
    <group position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={ref}>
        {[0.35, 0.55, 0.78, 1.0].map((r, i) => (
          <mesh key={r}><ringGeometry args={[r, r + (i === 1 ? 0.012 : 0.005), 96, 1, 0, i === 2 ? Math.PI * 1.6 : Math.PI * 2]} /><meshBasicMaterial color="#c4b5fd" transparent opacity={0.5 - i * 0.09} side={THREE.DoubleSide} /></mesh>
        ))}
      </group>
      <mesh><circleGeometry args={[0.32, 64]} /><meshBasicMaterial color="#7c3aed" transparent opacity={0.22} /></mesh>
    </group>
  )
}

export interface BodyCard { system: SystemId; lines: string[] }
const SIDE: Record<SystemId, 'left' | 'right'> = { brain: 'left', resp: 'left', msk: 'left', cardio: 'right', metabolic: 'right', immune: 'right' }
const ICON: Record<SystemId, string> = { brain: '☾', resp: '◌', msk: '⟂', cardio: '♥', metabolic: '⚡', immune: '✚' }

function Card({ system, status, lines, onPick }: { system: SystemId; status: Status; lines: string[]; onPick?: (s: SystemId) => void }) {
  const c = STATUS_COLOR[status]
  return (
    <button type="button" onClick={() => onPick?.(system)} data-organ={system} data-status={status}
      className="w-full text-left rounded-2xl px-3 py-2.5 border backdrop-blur-xl transition hover:-translate-y-0.5"
      style={{ background: 'rgba(16,10,28,.62)', borderColor: status === 'normal' ? 'rgba(216,180,254,.22)' : `${c}88`, boxShadow: status === 'normal' ? 'inset 0 1px 0 rgba(255,255,255,.06)' : `0 0 24px -8px ${c}` }}>
      <div className="flex items-center gap-2">
        <span className="grid place-items-center size-7 rounded-lg text-sm" style={{ background: 'rgba(124,58,237,.35)', color: '#f5e8ff' }} aria-hidden>{ICON[system]}</span>
        <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-dust">{SYSTEM_LABEL[system]}</span>
      </div>
      {lines.slice(0, 2).map((l) => <p key={l} className="mt-1 font-display text-[15px] font-bold leading-tight text-star">{l}</p>)}
      <p className="mt-1 text-[11px] font-semibold" style={{ color: c }}>{STATUS_ICON[status]} {STATUS_WORD[status]}</p>
    </button>
  )
}

export function Body3D({ systems, cards = [], onPick, height = 460 }: { systems: Record<SystemId, Status>; cards?: BodyCard[]; onPick?: (s: SystemId) => void; height?: number }) {
  const [ok] = useState(() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false } })
  const ids: SystemId[] = ['brain', 'resp', 'msk', 'cardio', 'metabolic', 'immune']
  const lines = (id: SystemId) => cards.find((c) => c.system === id)?.lines ?? []
  const column = (side: 'left' | 'right') => (
    <div className="flex flex-col gap-2.5 justify-center">
      {ids.filter((id) => SIDE[id] === side).map((id) => <Card key={id} system={id} status={systems[id] ?? 'unknown'} lines={lines(id)} onPick={onPick} />)}
    </div>
  )
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] gap-2 items-center" role="group" aria-label={`Body map: ${ids.map((k) => `${SYSTEM_LABEL[k]} ${systems[k] ?? 'unknown'}`).join(', ')}`}>
      {column('left')}
      <div style={{ height }} className="relative">
        {ok ? (
          <Canvas camera={{ position: [0, 0.62, 3.25], fov: 42 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: true }}>
            <group position={[0, -0.02, 0]}>
              <Shell />
              {ORGANS.map((o) => <Organ key={o.system} def={o} status={systems[o.system] ?? 'unknown'} onPick={onPick} />)}
              <Platform />
            </group>
            <OrbitControls target={[0, 0.62, 0]} enablePan={false} enableZoom={false} autoRotate={!reduceMotion()} autoRotateSpeed={0.5} minPolarAngle={Math.PI / 2.6} maxPolarAngle={Math.PI / 1.8} />
          </Canvas>
        ) : <p className="text-sm text-dust p-4">3D view needs WebGL. The cards show the same statuses.</p>}
      </div>
      {column('right')}
    </div>
  )
}
