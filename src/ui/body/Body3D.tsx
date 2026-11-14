import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Component, Suspense, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import type { Status, SystemId } from '../../engine/types'
import { SYSTEM_LABEL } from '../../lib/systems'

/**
 * Holographic human body: a real human body model (public/media/body.glb, credited on the Data & Sources page)
 * rendered as a hologram. Each engine system glows softly inside the body where its organs are, in that
 * system's status colour. Readings sit on glass cards around the body (outside the 3D scene), and every card
 * carries an icon and a word, so status is never colour-only.
 */
export const BODY_MODEL_URL = '/media/body.glb'
const STATUS_COLOR: Record<Status, string> = { normal: '#eae2ff', watch: '#f5b700', concern: '#f97316', urgent: '#ef4444', unknown: '#94a3b8' }
const STATUS_ICON: Record<Status, string> = { normal: '●', watch: '◆', concern: '▲', urgent: '✖', unknown: '?' }
const STATUS_WORD: Record<Status, string> = { normal: 'Normal', watch: 'Watch', concern: 'Concern', urgent: 'Urgent', unknown: 'Unknown' }
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Body placement in the scene: feet on the platform, fixed height. */
const FLOOR = -0.47
const H = 2.25

const holo = {
  vertexShader: `varying vec3 vN; varying vec3 vP; varying float vY; void main(){ vN=normalize(normalMatrix*normal); vec4 p=modelViewMatrix*vec4(position,1.); vP=p.xyz; vY=(modelMatrix*vec4(position,1.)).y; gl_Position=projectionMatrix*p; }`,
  fragmentShader: `uniform vec3 c; uniform float t; varying vec3 vN; varying vec3 vP; varying float vY;
    void main(){ float f=pow(1.-abs(dot(normalize(-vP),vN)),2.0); float scan=smoothstep(.06,0.,abs(fract(vY*.35-t*.12)-.5)-.44);
      gl_FragColor=vec4(c*(f*1.25+.035)+vec3(.9,.85,1.)*scan*.28, f*.8+.05); }`,
}

/** One shared hologram material for every body on the page (module scope: animated outside React state). */
const HOLO_UNIFORMS = { c: { value: new THREE.Color('#b9a6ff') }, t: { value: 0 } }
const HOLO_MAT = new THREE.ShaderMaterial({ ...holo, uniforms: HOLO_UNIFORMS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide })

/** If the model file cannot load, keep the organ glows and the cards instead of breaking the page. */
class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

function BodyModel() {
  const { scene } = useGLTF(BODY_MODEL_URL, false, false) // no Draco or Meshopt decoders: they need WebAssembly, which the CSP forbids
  useFrame(({ clock }) => { if (!reduceMotion()) HOLO_UNIFORMS.t.value = clock.elapsedTime })
  const body = useMemo(() => {
    // Bake every mesh (skinned or not) into one static group in its rest pose, then fit it on the platform.
    scene.updateMatrixWorld(true)
    const root = new THREE.Group()
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld)
      for (const a of ['skinIndex', 'skinWeight', 'uv', 'uv1', 'uv2', 'color', 'tangent']) g.deleteAttribute(a)
      if (!g.attributes.normal) g.computeVertexNormals()
      const mesh = new THREE.Mesh(g, HOLO_MAT); mesh.raycast = () => {}; root.add(mesh)
    })
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3()); const k = H / size.y
    const centre = box.getCenter(new THREE.Vector3())
    root.position.set(-centre.x, -box.min.y, -centre.z)
    const g = new THREE.Group(); g.add(root); g.scale.setScalar(k); g.position.y = FLOOR
    return g
  }, [scene])
  return <primitive object={body} />
}

/** Soft round glow texture, drawn once (canvas, no image file). */
let glowTex: THREE.Texture | null = null
function glowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')!; const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(0.6, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r; g.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c); return glowTex
}

/** Organ glow positions as fractions of body height (x: the person's left is +x; z: front is +z). */
interface OrganDef { system: SystemId; spots: { n: string; f: number; x?: number; z?: number; r: number }[] }
const ORGANS: OrganDef[] = [
  { system: 'brain', spots: [{ n: 'Brain', f: 0.935, z: 0.005, r: 0.07 }] },
  { system: 'cardio', spots: [{ n: 'Heart', f: 0.725, x: 0.018, z: 0.025, r: 0.045 }] },
  { system: 'resp', spots: [{ n: 'Right lung', f: 0.735, x: -0.05, z: 0.005, r: 0.055 }, { n: 'Left lung', f: 0.735, x: 0.055, z: 0.005, r: 0.05 }] },
  { system: 'metabolic', spots: [{ n: 'Liver', f: 0.645, x: -0.04, z: 0.02, r: 0.05 }, { n: 'Stomach', f: 0.65, x: 0.04, z: 0.025, r: 0.04 }, { n: 'Intestines', f: 0.575, z: 0.03, r: 0.06 }] },
  { system: 'msk', spots: [{ n: 'Upper spine', f: 0.79, z: -0.035, r: 0.03 }, { n: 'Mid spine', f: 0.68, z: -0.04, r: 0.03 }, { n: 'Lower spine', f: 0.57, z: -0.035, r: 0.03 }, { n: 'Pelvis', f: 0.5, r: 0.06 }, { n: 'Right knee', f: 0.285, x: -0.045, z: 0.01, r: 0.035 }, { n: 'Left knee', f: 0.285, x: 0.045, z: 0.01, r: 0.035 }] },
  { system: 'immune', spots: [{ n: 'Lymph nodes, neck', f: 0.835, x: -0.025, z: 0.01, r: 0.022 }, { n: 'Lymph nodes, neck', f: 0.835, x: 0.025, z: 0.01, r: 0.022 }, { n: 'Lymph nodes, right armpit', f: 0.745, x: -0.1, r: 0.025 }, { n: 'Lymph nodes, left armpit', f: 0.745, x: 0.1, r: 0.025 }, { n: 'Spleen', f: 0.625, x: 0.07, z: -0.01, r: 0.03 }, { n: 'Lymph nodes, right groin', f: 0.475, x: -0.06, z: 0.02, r: 0.022 }, { n: 'Lymph nodes, left groin', f: 0.475, x: 0.06, z: 0.02, r: 0.022 }] },
]

function Organ({ def, status, onPick, onHover }: { def: OrganDef; status: Status; onPick?: (s: SystemId, organ: string) => void; onHover?: (organ: string | null, s: SystemId) => void }) {
  const ref = useRef<THREE.Group>(null)
  const color = STATUS_COLOR[status]
  const alert = status === 'concern' || status === 'urgent'
  const strength = status === 'normal' ? 0.16 : status === 'unknown' ? 0.1 : status === 'watch' ? 0.8 : 1
  const halo = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: strength * 0.55, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }), [color, strength])
  const core = useMemo(() => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }), [color, strength])
  const hit = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), [])
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 12, 8), [])
  useFrame(({ clock }) => {
    if (!ref.current || reduceMotion()) return
    const k = alert ? 1 + 0.16 * Math.sin(clock.elapsedTime * (status === 'urgent' ? 6 : 3.4)) : 1
    ref.current.children.forEach((c) => { if (c.userData.halo) c.scale.setScalar(c.userData.base * k) })
  })
  return (
    <group ref={ref}>
      {def.spots.map((s, i) => {
        const p: [number, number, number] = [(s.x ?? 0) * H, FLOOR + s.f * H, (s.z ?? 0) * H]
        const r = s.r * H
        return [
          <sprite key={`h${i}`} position={p} scale={r * 4.2} material={halo} userData={{ halo: true, base: r * 4.2 }} renderOrder={2} />,
          <sprite key={`c${i}`} position={p} scale={r * 1.9} material={core} renderOrder={3} />,
          <mesh key={`m${i}`} position={p} scale={Math.max(r * 2, 0.07)} geometry={sphere} material={hit} onClick={(e) => { e.stopPropagation(); onPick?.(def.system, s.n) }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover?.(s.n, def.system) }} onPointerOut={() => { document.body.style.cursor = ''; onHover?.(null, def.system) }} />,
        ]
      })}
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
  const [picked, setPicked] = useState<{ organ: string; system: SystemId } | null>(null)
  const [hover, setHover] = useState<{ organ: string; system: SystemId } | null>(null)
  const shown = hover ?? picked
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
        {shown && (
          <div id="organ-label" role="status" className="absolute left-1/2 -translate-x-1/2 top-2 z-10 rounded-xl border px-3 py-1.5 text-center backdrop-blur-xl pointer-events-none"
            style={{ background: 'rgba(16,10,28,.8)', borderColor: `${STATUS_COLOR[systems[shown.system] ?? 'unknown']}88` }}>
            <p className="font-display text-sm font-bold text-star">{shown.organ}</p>
            <p className="text-[11px] text-dust">{SYSTEM_LABEL[shown.system]} · <span style={{ color: STATUS_COLOR[systems[shown.system] ?? 'unknown'] }}>{STATUS_ICON[systems[shown.system] ?? 'unknown']} {STATUS_WORD[systems[shown.system] ?? 'unknown']}</span></p>
          </div>
        )}
        {ok ? (
          <Canvas camera={{ position: [0, 0.62, 3.25], fov: 42 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: true }}>
            <group position={[0, -0.02, 0]}>
              <ModelBoundary><Suspense fallback={null}><BodyModel /></Suspense></ModelBoundary>
              {ORGANS.map((o) => <Organ key={o.system} def={o} status={systems[o.system] ?? 'unknown'} onPick={(sys, organ) => { setPicked({ organ, system: sys }); onPick?.(sys) }} onHover={(organ, sys) => setHover(organ ? { organ, system: sys } : null)} />)}
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
