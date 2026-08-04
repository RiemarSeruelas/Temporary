import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Billboard, Edges, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const DEFAULT_MODEL_SETTINGS = {
  scale: 2.35,
  position: [0, -0.55, 0],
  rotation: [0, 0, 0],
  cameraPosition: [2.7, 1.45, 2.75],
  cameraFov: 28,
  controlsTarget: [0, 0.2, 0],
};

export default function Machine3DView({ machine, zones, selectedPoint, onZoneClick, theme }) {
  const modelSettings = machine.modelSettings || DEFAULT_MODEL_SETTINGS;
  const zoneMapById = new Map((machine.modelZones || []).map((zone) => [zone.id, zone]));
  const zoneOverlays = zones
    .map((zone) => ({ ...zone, map3d: zoneMapById.get(zone.id) }))
    .filter((zone) => zone.map3d);

  return (
    <div className="machine-3d-view embedded-3d-map real-glb-view">
      <Canvas
        className="machine-3d-canvas"
        camera={{ position: modelSettings.cameraPosition, fov: modelSettings.cameraFov }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={theme === "dark" ? 1.25 : 1.7} />
        <directionalLight position={[4, 6, 5]} intensity={theme === "dark" ? 2.2 : 2.8} />
        <directionalLight position={[-3, 2, -4]} intensity={1.2} />

        <Suspense fallback={null}>
          <MachineModel
            url={machine.modelUrl || "/models/mespack.glb"}
            scale={modelSettings.scale}
            position={modelSettings.position}
            rotation={modelSettings.rotation}
          />
          <group scale={modelSettings.scale} position={modelSettings.position} rotation={modelSettings.rotation}>
            {zoneOverlays.map((zone) => (
              <Machine3DZone
                key={zone.id}
                zone={zone}
                map3d={zone.map3d}
                isActive={selectedPoint?.type === "zone" && selectedPoint.id === zone.id}
                onZoneClick={onZoneClick}
              />
            ))}
          </group>
        </Suspense>

        <OrbitControls
          target={modelSettings.controlsTarget}
          enablePan={false}
          minDistance={1.8}
          maxDistance={6.5}
          minPolarAngle={Math.PI * 0.22}
          maxPolarAngle={Math.PI * 0.68}
          makeDefault
        />
      </Canvas>
      <div className="machine-3d-hint">Drag to rotate · Scroll to zoom</div>
    </div>
  );
}

function Machine3DZone({ zone, map3d, isActive, onZoneClick }) {
  const colors = get3DStatusColor(zone.state.className);
  const labelOffset = map3d.labelOffset || [0, map3d.size[1] / 2 + 0.18, 0];

  return (
    <group position={map3d.position} rotation={map3d.rotation || [0, 0, 0]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onZoneClick(zone);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <boxGeometry args={map3d.size} />
        <meshStandardMaterial
          color={colors.fill}
          transparent
          opacity={isActive ? map3d.activeOpacity ?? .27 : map3d.opacity ?? .45}
          roughness={.6}
          metalness={.05}
          depthWrite={false}
        />
        <Edges color={colors.edge} scale={1.001} threshold={15} />
      </mesh>

      <Billboard position={labelOffset} follow>
        <mesh
          onClick={(event) => {
            event.stopPropagation();
            onZoneClick(zone);
          }}
        >
          <planeGeometry args={[map3d.labelWidth || 1.1, map3d.labelHeight || .24]} />
          <CanvasTextLabel
            text={zone.name}
            width={map3d.labelWidth || 1.1}
            height={map3d.labelHeight || .24}
            background={colors.label}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

function CanvasTextLabel({ text, width, height, background }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ratio = 4;
    canvas.width = Math.max(256, Math.round(width * 260 * ratio));
    canvas.height = Math.max(80, Math.round(height * 260 * ratio));
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    const logicalWidth = canvas.width / ratio;
    const logicalHeight = canvas.height / ratio;
    context.fillStyle = background;
    context.beginPath();
    context.roundRect(0, 0, logicalWidth, logicalHeight, logicalHeight / 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `700 ${Math.max(16, logicalHeight * .38)}px Inter, Segoe UI, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, logicalWidth / 2, logicalHeight / 2, logicalWidth - 18);
    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    canvasTexture.needsUpdate = true;
    return canvasTexture;
  }, [text, width, height, background]);

  return <meshBasicMaterial map={texture} transparent toneMapped={false} />;
}

function MachineModel({ url, scale, position, rotation }) {
  const { scene } = useGLTF(url);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clonedScene} scale={scale} position={position} rotation={rotation} dispose={null} />;
}

function get3DStatusColor(className) {
  if (className === "danger") return { fill: "#ef4444", edge: "#ff8f8f", label: "#b91c1c" };
  if (className === "warning") return { fill: "#f59e0b", edge: "#ffd27a", label: "#9a5b07" };
  return { fill: "#22c55e", edge: "#86efac", label: "#15753a" };
}

useGLTF.preload("/models/mespack.glb");
