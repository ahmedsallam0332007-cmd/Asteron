import { useEffect, useRef } from 'react'

/**
 * Hero sky: a real space image (Webb “Cosmic Cliffs”, NASA, ESA, CSA, STScI) colour-graded to the Asteron
 * palette in WebGL, with slow drifting gas, twinkling stars and gentle mouse parallax.
 * Respects prefers-reduced-motion (one still frame). Falls back to the plain image without WebGL.
 */
const IMG = '/media/nebula-cosmic-cliffs.webp'
const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}'
const FS = `precision highp float;varying vec2 v;
uniform sampler2D img;uniform vec2 r;uniform vec2 isz;uniform float t;uniform vec2 m;
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
float stars(vec2 uv,float s,float th){vec2 gq=uv*s;vec2 id=floor(gq);vec2 f=fract(gq)-.5;float r0=h(id);if(r0<th)return 0.;
 vec2 o=vec2(h(id+1.3),h(id+7.1))-.5;float d=length(f-o*.7);return smoothstep(.07,0.,d)*(.6+.4*sin(t*1.7+r0*50.))*(r0-th)/(1.-th)*3.;}
vec3 ramp(float l){
 vec3 c0=vec3(.031,.020,.047),c1=vec3(.16,.05,.30),c2=vec3(.486,.227,.929),c3=vec3(.94,.67,.99),c4=vec3(.98,.95,1.);
 if(l<.25)return mix(c0,c1,l/.25); if(l<.55)return mix(c1,c2,(l-.25)/.3); if(l<.8)return mix(c2,c3,(l-.55)/.25); return mix(c3,c4,(l-.8)/.2);}
void main(){
 float ar=r.x/r.y, iar=isz.x/isz.y; vec2 uv=v-.5;
 if(ar>iar) uv.y*=iar/ar; else uv.x*=ar/iar;
 float z=1.08+.04*sin(t*.05); uv/=z; uv+=vec2(.018*sin(t*.03),.012*cos(t*.025))+m*.012;
 vec2 w=vec2(fbm(uv*3.+t*.02),fbm(uv*3.+7.-t*.02))-.5;
 vec3 src=texture2D(img,uv+.5+w*.004).rgb;
 float l=dot(src,vec3(.299,.587,.114)); l=smoothstep(.02,.95,l);
 vec3 col=ramp(l)+src*.08;
 col+=vec3(.95,.93,1.)*(stars(v*vec2(ar,1.)+m*.02,110.,.94)+stars(v*vec2(ar,1.)+m*.04,45.,.975)*1.3)*.8;
 float vig=smoothstep(1.25,.3,length((v-.5)*vec2(ar*.8,1.)*1.6));col*=mix(.45,1.,vig);
 gl_FragColor=vec4(col,1.);}`

export function NebulaSky({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const gl = cv?.getContext('webgl', { antialias: false, premultipliedAlpha: false })
    if (!cv || !gl) return
    const motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const pr = gl.createProgram()!
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr)
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return
    gl.useProgram(pr)
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const U = Object.fromEntries(['img', 'r', 'isz', 't', 'm'].map((k) => [k, gl.getUniformLocation(pr, k)]))
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    for (const [k, val] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, val)
    let isz: [number, number] = [1, 1]; let ready = false; let raf = 0; let alive = true
    let time = 20, last = performance.now(), mx = 0, my = 0, tx = 0, ty = 0
    const size = () => { const s = Math.min(1.5, devicePixelRatio || 1); cv.width = Math.round(cv.clientWidth * s); cv.height = Math.round(cv.clientHeight * s); gl.viewport(0, 0, cv.width, cv.height) }
    const move = (e: PointerEvent) => { tx = e.clientX / innerWidth - 0.5; ty = 0.5 - e.clientY / innerHeight }
    const draw = () => {
      gl.uniform1i(U.img, 0); gl.uniform2f(U.r, cv.width, cv.height); gl.uniform2f(U.isz, isz[0], isz[1]); gl.uniform1f(U.t, time); gl.uniform2f(U.m, mx, my)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const frame = (now: number) => {
      if (!alive) return
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      time += dt; mx += (tx - mx) * 0.04; my += (ty - my) * 0.04
      if (ready) draw()
      raf = requestAnimationFrame(frame)
    }
    const im = new Image()
    im.onload = () => {
      if (!alive) return
      isz = [im.naturalWidth, im.naturalHeight]; gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im); ready = true
      size(); draw(); cv.style.opacity = '1'
    }
    im.src = IMG
    addEventListener('resize', size); size()
    if (motion) { addEventListener('pointermove', move, { passive: true }); raf = requestAnimationFrame(frame) }
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointermove', move) }
  }, [])
  return <canvas ref={ref} aria-hidden className={`block w-full h-full opacity-0 transition-opacity duration-700 ${className}`} />
}
