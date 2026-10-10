import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { PMREMGenerator, type Texture, type WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { LIGHTS, RENDER } from '../animation/config'

// One prefiltered room per renderer, shared by every scene it draws (the Home
// canvas has one scene per card view).
const envCache = new WeakMap<WebGLRenderer, { texture: Texture; users: number }>()

function acquireEnv(gl: WebGLRenderer): Texture {
  let entry = envCache.get(gl)
  if (!entry) {
    const pmrem = new PMREMGenerator(gl)
    entry = { texture: pmrem.fromScene(new RoomEnvironment(), RENDER.envBlur).texture, users: 0 }
    pmrem.dispose()
    envCache.set(gl, entry)
  }
  entry.users++
  return entry.texture
}

function releaseEnv(gl: WebGLRenderer) {
  const entry = envCache.get(gl)
  if (!entry || --entry.users > 0) return
  entry.texture.dispose()
  envCache.delete(gl)
}

// Soft reflections from a generated room, as tutor-3d.js does (no HDR download).
function RoomEnv() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    scene.environment = acquireEnv(gl)
    scene.environmentIntensity = RENDER.envIntensity
    return () => {
      scene.environment = null
      releaseEnv(gl)
    }
  }, [gl, scene])

  return null
}

interface Props {
  shadows?: boolean // the key light's soft shadow; off for the small Home views
}

// Lighting rig from tutor-3d.js: hemisphere, warm shadowed key, cool fill, rim.
export function Lights({ shadows = true }: Props) {
  const { hemi, key, fill, rim } = LIGHTS
  return (
    <>
      <RoomEnv />
      <hemisphereLight color={hemi.sky} groundColor={hemi.ground} intensity={hemi.intensity} />
      <directionalLight
        color={key.color}
        intensity={key.intensity}
        position={key.position}
        castShadow={shadows}
        shadow-mapSize={[RENDER.shadowMapSize, RENDER.shadowMapSize]}
        shadow-radius={key.shadow.radius}
        shadow-bias={key.shadow.bias}
        shadow-normalBias={key.shadow.normalBias}
        shadow-camera-left={key.shadow.left}
        shadow-camera-right={key.shadow.right}
        shadow-camera-top={key.shadow.top}
        shadow-camera-bottom={key.shadow.bottom}
        shadow-camera-near={key.shadow.near}
        shadow-camera-far={key.shadow.far}
      />
      <directionalLight color={fill.color} intensity={fill.intensity} position={fill.position} />
      <directionalLight color={rim.color} intensity={rim.intensity} position={rim.position} />
    </>
  )
}
