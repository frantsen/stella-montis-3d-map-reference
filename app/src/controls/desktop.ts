import * as THREE from 'three'
import { nearestExit, nearestNode } from '../navigation/navGraph'
import { aStar, buildPathLine } from '../navigation/pathfinding'

const keys: Record<string, boolean> = {}
export const moveSpeed = 0.045
export const sprintMultiplier = 1.8

let currentPathLine: THREE.Line | null = null

const mouseLook = {
  lastX: 0,
  lastY: 0,
}

function getMouseLookSign(): number {
  const invertMouse = localStorage.getItem('stella-montis-invert-mouse') === 'true'
  return invertMouse ? 1 : -1
}

export function setupDesktopControls(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  cameraRotation: { yaw: number; pitch: number },
  mouse: THREE.Vector2,
  scene: THREE.Scene
) {
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase()

    if (key === 'e') {
      // Calculate nav-node path to nearest exit (not direct camera->exit line)
      const graph = (window as any).navGraph
      const exits = (window as any).exits
      if (graph && exits) {
        const nearestExitMarker = nearestExit(exits, camera.position)
        if (nearestExitMarker) {
          console.log('Nearest exit:', nearestExitMarker.label, 'at', nearestExitMarker.position)
          const startNode = nearestNode(graph, camera.position)
          const exitNodeId = nearestExitMarker.nearestNodeId
          const route = aStar(graph, startNode.id, exitNodeId)
          if (route) {
            console.log('Nav node route found with', route.length, 'nodes')
            const pathPoints = route.map((node) => node.position.clone())
            // Remove previous path line
            if (currentPathLine) {
              scene.remove(currentPathLine)
              currentPathLine.geometry.dispose()
              ;(currentPathLine.material as THREE.Material).dispose()
            }
            // Add new path line with green color for visibility
            currentPathLine = buildPathLine(pathPoints, 0x00ff00)
            scene.add(currentPathLine)
            console.log('Nav path line added to scene')
          } else {
            console.log('No nav path found to exit')
          }
        } else {
          console.log('No nearest exit found')
        }
      } else {
        console.log('Nav graph or exits not available')
      }
      return // Don't set in keys for movement
    }

    keys[key] = true
  })

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false
  })

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
  })

  renderer.domElement.addEventListener('click', (event) => {
    if (event.shiftKey && document.pointerLockElement !== renderer.domElement) {
      // perform raycast only when cursor is visible (pointer lock not active)
      const rect = renderer.domElement.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      const mouse = new THREE.Vector2(x, y)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const meshes = (window as any).mapMeshes as THREE.Mesh[]
      if (meshes && meshes.length > 0) {
        const intersects = raycaster.intersectObjects(meshes)
        if (intersects.length > 0) {
          const point = intersects[0].point
          const groundY = 0
          const eyeHeight = 1.1
          camera.position.set(point.x, groundY + eyeHeight, point.z)
          cameraRotation.pitch = 0 // reset pitch to flat
          // keep yaw
          const euler = new THREE.Euler(cameraRotation.pitch, cameraRotation.yaw, 0, 'YXZ')
          camera.quaternion.setFromEuler(euler)
        }
      }
    } else if (!event.shiftKey) {
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock()
      } else {
        renderer.domElement.requestPointerLock()
      }
    }
  })

  document.addEventListener('mousemove', (event) => {
    const isPointerLocked = document.pointerLockElement === renderer.domElement

    if (isPointerLocked) {
      const sensitivity = 0.002
      const pitchSign = getMouseLookSign() // invert applies only to up/down
      cameraRotation.yaw += event.movementX * sensitivity * -1
      cameraRotation.pitch += event.movementY * sensitivity * pitchSign
      cameraRotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraRotation.pitch))
      const euler = new THREE.Euler(cameraRotation.pitch, cameraRotation.yaw, 0, 'YXZ')
      camera.quaternion.setFromEuler(euler)
    } else {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
      mouseLook.lastX = event.clientX
      mouseLook.lastY = event.clientY
    }
  })
}

export function updateDesktopMovement(camera: THREE.Camera) {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  const up = new THREE.Vector3(0, 1, 0)

  const currentSpeed = keys['shift'] ? moveSpeed * sprintMultiplier : moveSpeed

  if (keys['w']) camera.position.addScaledVector(forward, currentSpeed)
  if (keys['s']) camera.position.addScaledVector(forward, -currentSpeed)
  if (keys['a']) camera.position.addScaledVector(right, -currentSpeed)
  if (keys['d']) camera.position.addScaledVector(right, currentSpeed)
  if (keys[' ']) camera.position.addScaledVector(up, currentSpeed)
  if (keys['c']) camera.position.addScaledVector(up, -currentSpeed)
}
