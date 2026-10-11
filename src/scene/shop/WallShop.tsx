import { RoundedBox, useCursor } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import { useShop } from '../../state/shop'
import { WALL_SHOP } from './shopCamera'

type V3 = [number, number, number]

function woodTexture(sign = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = sign ? 256 : 512
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = sign ? '#75452b' : '#c48a50'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < 100; i++) {
    ctx.strokeStyle = i % 3 ? 'rgba(65, 29, 12, .09)' : 'rgba(255, 218, 151, .19)'
    ctx.lineWidth = i % 4 + 1
    ctx.beginPath()
    for (let x = 0; x <= 1024; x += 16) {
      const y = i * canvas.height / 100 + Math.sin(x * 0.012 + i * 2.3) * 3 + Math.sin(x * 0.005 + i) * 5
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  if (sign) {
    ctx.strokeStyle = '#d7ad71'
    ctx.lineWidth = 3
    ctx.strokeRect(18, 18, 988, 220)
    ctx.fillStyle = '#fff0c8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 118px Georgia, serif'
    ctx.fillText('THE LITTLE SHOP', 512, 111, 940)
    ctx.font = '500 28px sans-serif'
    ctx.fillStyle = '#f0cf94'
    ctx.fillText('PLAY  •  COLLECT  •  MAKE IT YOURS', 512, 195)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function Timber({ position, size, map, color = '#ffffff' }: { position: V3; size: V3; map: Texture; color?: string }) {
  return (
    <RoundedBox args={size} position={position} radius={0.035} smoothness={2} castShadow receiveShadow>
      <meshStandardMaterial map={map} color={color} roughness={0.82} />
    </RoundedBox>
  )
}

function Ball({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <mesh castShadow><sphereGeometry args={[0.29, 24, 16]} /><meshStandardMaterial color="#ed9650" roughness={0.7} /></mesh>
      {[0, Math.PI / 2].map((angle) => (
        <mesh key={angle} rotation={[0, angle, 0]}><torusGeometry args={[0.291, 0.009, 6, 40]} /><meshStandardMaterial color="#613825" /></mesh>
      ))}
      <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.291, 0.009, 6, 40]} /><meshStandardMaterial color="#613825" /></mesh>
    </group>
  )
}

function Gift({ position, color }: { position: V3; color: string }) {
  return (
    <group position={position}>
      <RoundedBox args={[0.54, 0.48, 0.48]} radius={0.04} smoothness={2} castShadow><meshStandardMaterial color={color} roughness={0.65} /></RoundedBox>
      <mesh position={[0, 0, 0.245]}><boxGeometry args={[0.09, 0.49, 0.012]} /><meshStandardMaterial color="#ffe7ad" /></mesh>
      <mesh position={[0, 0.245, 0]}><boxGeometry args={[0.55, 0.025, 0.1]} /><meshStandardMaterial color="#ffe7ad" /></mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.09, 0.3, 0]} scale={[1, 0.65, 1]} rotation={[0, 0, side * 0.35]}><torusGeometry args={[0.1, 0.025, 8, 20]} /><meshStandardMaterial color="#ffe7ad" /></mesh>
      ))}
    </group>
  )
}

function Trophy({ position }: { position: V3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]} castShadow><boxGeometry args={[0.44, 0.08, 0.34]} /><meshStandardMaterial color="#61412f" /></mesh>
      <mesh position={[0, 0.18, 0]}><cylinderGeometry args={[0.06, 0.1, 0.25, 16]} /><meshStandardMaterial color="#e1ac46" metalness={0.45} roughness={0.3} /></mesh>
      <mesh position={[0, 0.42, 0]} castShadow><cylinderGeometry args={[0.24, 0.09, 0.28, 24]} /><meshStandardMaterial color="#eec665" metalness={0.45} roughness={0.3} /></mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.24, 0.44, 0]}><torusGeometry args={[0.12, 0.028, 8, 20]} /><meshStandardMaterial color="#e1ac46" metalness={0.45} roughness={0.3} /></mesh>
      ))}
    </group>
  )
}

export function WallShop() {
  const [hovered, setHovered] = useState(false)
  const active = useShop((s) => s.phase !== 'closed')
  const textures = useMemo(() => ({ wood: woodTexture(), sign: woodTexture(true) }), [])
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures])
  useCursor(hovered && !active)
  const open = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    setHovered(false)
    useShop.getState().enter()
  }
  const w = WALL_SHOP.width

  return (
    <group name="wall-shop" position={WALL_SHOP.position} rotation={[0, Math.PI / 2, 0]} onClick={open}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }} onPointerOut={() => setHovered(false)}>
      {/* A slatted cabinet back, two deep shelves, and a carved timber sign. */}
      <Timber position={[0, 1.2, 0]} size={[w, 2.65, 0.14]} map={textures.wood} color="#976542" />
      {Array.from({ length: 8 }, (_, i) => (
        <Timber key={i} position={[-w / 2 + 0.35 + i * 0.67, 1.2, 0.09]} size={[0.65, 2.54, 0.08]} map={textures.wood} color={i % 2 ? '#e2bf92' : '#f0cea3'} />
      ))}
      {[-1, 1].map((side) => <Timber key={side} position={[side * (w / 2 + 0.02), 1.2, 0.19]} size={[0.18, 2.82, 0.36]} map={textures.wood} />)}
      {[0.26, 1.46].map((y) => (
        <group key={y}>
          <Timber position={[0, y, 0.34]} size={[w + 0.28, 0.17, 0.85]} map={textures.wood} />
          <Timber position={[0, y - 0.09, 0.73]} size={[w + 0.32, 0.16, 0.12]} map={textures.wood} color="#ba8150" />
          {[-1.95, 1.95].map((x) => <Timber key={x} position={[x, y - 0.27, 0.22]} size={[0.16, 0.45, 0.38]} map={textures.wood} color="#a9794f" />)}
        </group>
      ))}
      <Timber position={[0, 2.77, 0.17]} size={[4.85, 0.82, 0.25]} map={textures.wood} color="#a16d42" />
      <mesh position={[0, 2.77, 0.301]}><planeGeometry args={[4.64, 0.69]} /><meshBasicMaterial map={textures.sign} toneMapped={false} /></mesh>
      {[-2.19, 2.19].map((x) => (
        <mesh key={x} position={[x, 2.77, 0.32]}><sphereGeometry args={[0.038, 10, 8]} /><meshStandardMaterial color="#d6ab61" metalness={0.7} roughness={0.35} /></mesh>
      ))}
      <Ball position={[-1.97, 1.84, 0.38]} />
      <Trophy position={[-0.64, 1.55, 0.37]} />
      <Gift position={[0.67, 1.79, 0.37]} color="#7fb9af" />
      <Gift position={[1.73, 1.79, 0.37]} color="#d7988a" />
      <Gift position={[-1.93, 0.59, 0.37]} color="#aba4cf" />
      <group position={[-0.62, 0.35, 0.36]}>
        {['#d6a354', '#72aaa1', '#d0806c'].map((color, i) => (
          <mesh key={color} position={[(i - 1) * 0.21, 0.29, 0]} rotation={[0, 0, i === 2 ? -0.12 : 0]} castShadow>
            <boxGeometry args={[0.17, 0.59 - i * 0.04, 0.34]} /><meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
        ))}
      </group>
      <group position={[0.78, 0.35, 0.4]}>
        <mesh position={[0, 0.18, 0]} castShadow><sphereGeometry args={[0.28, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#6fa6b5" roughness={0.85} /></mesh>
        <mesh position={[0, 0.18, 0.18]} scale={[1, 0.14, 1]} castShadow><sphereGeometry args={[0.31, 20, 12]} /><meshStandardMaterial color="#518896" roughness={0.85} /></mesh>
      </group>
      <Ball position={[1.94, 0.63, 0.37]} />
      {/* A warm shelf glow that strengthens on hover, with no extra shadow map. */}
      <pointLight position={[0, 2.4, 1]} color="#ffdc9b" intensity={hovered ? 5 : 2.2} distance={5} decay={2} />
      <mesh position={[0, 1.38, 0.79]}>
        <planeGeometry args={[w + 0.35, 3.25]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
