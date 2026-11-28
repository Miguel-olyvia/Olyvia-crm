// 28/11 (Rúben, Schroeder: «uma planta 3d muito mais completa, em que conseguimos ter a casa toda»). O 3D da casa toda: o chão, as
// paredes e as peças de cada área, no lugar dela na casa (casaLayout.ts). Leve de propósito (caixas com a cor do produto): o 3D com os
// modelos dos produtos é o de cada área, isolada. Carrega-se só quando se pede (lazy), como o visualizador.
import { useMemo } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PECAS } from "../planta";
import { limitesCasa, type AreaNaCasa } from "./casaLayout";

export interface Area3D extends AreaNaCasa { peDireito: number; cor: (pecaId: string) => string | undefined }

const ALTURA: Partial<Record<string, number>> = {
  sanita: 0.42, bide: 0.42, base: 0.06, banheira: 0.56, movel: 0.85, coluna: 1.8, espelho: 0.02, toalheiro: 0.02, lava: 0.88,
  bancada: 0.9, armario: 2.1, placa: 0.9, maquina: 0.85, frigorifico: 1.85, cama: 0.5, sofa: 0.8, mesa: 0.75, roupeiro: 2.2,
};
const PAREDE_M = 0.08;

/** A cor do tema (a variável CSS «--primary», «221 83% 53%») para o three.js. */
function corDoTema(nome: string, omissao: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    const m = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(v);
    return m ? `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)` : omissao;
  } catch { return omissao; }
}

function Area({ a, destaque, apagada, escolher }: { a: Area3D; destaque: boolean; apagada: boolean; escolher: (k: string) => void }) {
  const ox = a.lugar.x / 100, oz = a.lugar.y / 100, pts = a.forma.pts.map((q) => ({ x: q.x / 100 + ox, z: q.y / 100 + oz }));
  const chao = useMemo(() => (a.forma.fecha ? new THREE.ShapeGeometry(new THREE.Shape(pts.map((q) => new THREE.Vector2(q.x, -q.z)))) : null), [a.forma, ox, oz]); // eslint-disable-line react-hooks/exhaustive-deps
  const primaria = useMemo(() => corDoTema("--primary", "#2563eb"), []);
  const op = apagada ? 0.25 : 1;
  const segs = pts.map((q, i) => [q, pts[(i + 1) % pts.length]] as const).slice(0, a.forma.fecha ? pts.length : pts.length - 1);
  const clique = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); escolher(a.chave); };
  const cx = ox + a.forma.w / 200, cz = oz + a.forma.h / 200;
  return (
    <group onClick={clique}>
      {chao && (
        <mesh geometry={chao} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color={destaque ? primaria : "#e9e4dc"} transparent opacity={destaque ? 0.55 * op + 0.2 : op} />
        </mesh>
      )}
      {segs.map(([p, q], i) => {
        const L = Math.hypot(q.x - p.x, q.z - p.z);
        if (L < 0.01) return null;
        return (
          <mesh key={i} position={[(p.x + q.x) / 2, a.peDireito / 2, (p.z + q.z) / 2]} rotation={[0, -Math.atan2(q.z - p.z, q.x - p.x), 0]} castShadow>
            <boxGeometry args={[L + PAREDE_M, a.peDireito, PAREDE_M]} />
            <meshStandardMaterial color={destaque ? "#f8fafc" : "#d6d3d1"} transparent opacity={0.85 * op} />
          </mesh>
        );
      })}
      {a.forma.pecas.filter((pc) => !PECAS[pc.tipo]?.abertura).map((pc) => {
        const h = pc.dh ? pc.dh / 100 : ALTURA[pc.tipo] ?? 0.8;
        const z0 = pc.mont === "parede" || pc.alt ? (pc.alt ?? 120) / 100 : 0;
        const ang = (((pc.rot ?? 0) + (a.lugar.r ?? 0)) * Math.PI) / 180;
        return (
          <mesh key={pc.id} position={[ox + pc.cx / 100, z0 + h / 2, oz + pc.cy / 100]} rotation={[0, -ang, 0]} castShadow>
            <boxGeometry args={[Math.max(0.02, pc.w / 100), Math.max(0.02, h), Math.max(0.02, pc.h / 100)]} />
            <meshStandardMaterial color={a.cor(pc.id) ?? "#a8a29e"} transparent opacity={op} />
          </mesh>
        );
      })}
      {!apagada && (
        <Html position={[cx, a.peDireito + 0.25, cz]} center distanceFactor={9} zIndexRange={[10, 0]}>
          <button type="button" onClick={() => escolher(a.chave)}
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold shadow ${destaque ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>
            {a.nome}{a.m2 !== null ? ` · ${a.m2.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} m²` : ""}
          </button>
        </Html>
      )}
    </group>
  );
}

export default function CasaToda3D({ areas, escolhida, isolar, escolher, descricao }: {
  areas: Area3D[]; escolhida: string | null; isolar: boolean; escolher: (k: string) => void; descricao: string;
}) {
  const vis = isolar && escolhida ? areas.filter((a) => a.chave === escolhida) : areas;
  const b = limitesCasa(vis);
  const cx = (b.x + b.w / 2) / 100, cz = (b.y + b.h / 2) / 100, tam = Math.max(b.w, b.h) / 100;
  return (
    <Canvas shadows camera={{ position: [cx + tam * 0.35, tam * 1.05 + 2, cz + tam * 0.95 + 1.5], fov: 45 }} aria-label={descricao} role="img"
      onPointerMissed={() => escolhida && !isolar && escolher("")}>
      <color attach="background" args={["#f5f5f4"]} />
      <hemisphereLight args={["#ffffff", "#d6d3d1", 0.9]} />
      <directionalLight position={[cx + 6, 12, cz + 4]} intensity={1.1} castShadow />
      {vis.map((a) => <Area key={a.chave} a={a} destaque={a.chave === escolhida} apagada={!!escolhida && !isolar && a.chave !== escolhida} escolher={escolher} />)}
      <OrbitControls target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.05} makeDefault />
    </Canvas>
  );
}
