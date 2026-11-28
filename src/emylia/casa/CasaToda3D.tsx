// 28/11 (Rúben, Schroeder: «uma planta 3d muito mais completa, em que conseguimos ter a casa toda»). O 3D da casa toda: o chão, as
// paredes e as peças de cada área, no lugar dela na casa (casaLayout.ts). Leve de propósito (caixas): o 3D com os modelos dos produtos
// é o de cada área, isolada. Carrega-se só quando se pede (lazy), como o visualizador.
// 28/11 (Rúben: «mas está tudo cinza»): com cores e materiais. O chão pelo tipo da área (madeira nos quartos, na sala e no hall;
// pedra clara nas casas de banho e na cozinha) ou pelo pavimento escolhido no Estúdio; as paredes brancas; cada peça na cor do produto
// ou, sem ele, na do tipo (louça branca, bancada, armários, eletrodomésticos); as janelas em vidro e as portas em madeira. As paredes
// de duas áreas encostadas ficam lado a lado (cada uma recua meia espessura para dentro da sua), sem se sobreporem.
import { useMemo } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PECAS } from "../planta";
import { corDaPeca, corDoChao, limitesCasa, type AreaNaCasa } from "./casaLayout";

export interface Area3D extends AreaNaCasa {
  peDireito: number;
  /** A cor do produto da peça (o Estúdio), se houver. */
  cor: (pecaId: string) => string | undefined;
  /** A cor do pavimento escolhido no Estúdio, se houver. */
  pavimento?: string;
}

const ALTURA: Partial<Record<string, number>> = {
  sanita: 0.42, bide: 0.42, base: 0.06, banheira: 0.56, movel: 0.5, coluna: 1.6, espelho: 0.8, toalheiro: 0.9, lava: 0.9,
  bancada: 0.9, armario: 2.1, placa: 0.92, maquina: 0.85, frigorifico: 1.85, forno: 0.9, exaustor: 0.5,
};
/** A que altura do chão começa a peça (m): as de parede e os móveis suspensos. */
const BASE: Partial<Record<string, number>> = { movel: 0.4, espelho: 1.1, toalheiro: 0.6, exaustor: 1.55 };
const PAREDE = "#f1ece4", PAREDE_M = 0.08;

/** A cor do tema (a variável CSS «--primary», «221 83% 53%») para o three.js. */
function corDoTema(nome: string, omissao: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    const m = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(v);
    return m ? `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)` : omissao;
  } catch { return omissao; }
}

/** Se um ponto está dentro do polígono (para saber para que lado é o interior de cada parede). */
function dentro(p: { x: number; z: number }, pts: readonly { x: number; z: number }[]): boolean {
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) d = !d;
  }
  return d;
}

function Area({ a, destaque, apagada, escolher, maquete }: { a: Area3D; destaque: boolean; apagada: boolean; escolher: (k: string) => void; maquete: boolean }) {
  // na casa toda as paredes ficam baixas (como uma maquete), para se ver o que está dentro; isolada, à altura verdadeira
  const altura = maquete ? Math.min(a.peDireito, 1.1) : a.peDireito;
  const ox = a.lugar.x / 100, oz = a.lugar.y / 100, pts = a.forma.pts.map((q) => ({ x: q.x / 100 + ox, z: q.y / 100 + oz }));
  const chao = useMemo(() => (a.forma.fecha ? new THREE.ShapeGeometry(new THREE.Shape(pts.map((q) => new THREE.Vector2(q.x, -q.z)))) : null), [a.forma, ox, oz]); // eslint-disable-line react-hooks/exhaustive-deps
  const primaria = useMemo(() => corDoTema("--primary", "#6d28d9"), []);
  const op = apagada ? 0.28 : 1, transp = apagada;
  const segs = pts.map((q, i) => [q, pts[(i + 1) % pts.length]] as const).slice(0, a.forma.fecha ? pts.length : pts.length - 1);
  const clique = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); escolher(a.chave); };
  const cx = ox + a.forma.w / 200, cz = oz + a.forma.h / 200;
  const corChao = a.pavimento ?? corDoChao(a.nome);
  return (
    <group onClick={clique}>
      {chao && (
        <mesh geometry={chao} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
          <meshStandardMaterial color={corChao} roughness={0.85} transparent={transp} opacity={op} emissive={destaque ? primaria : "#000000"} emissiveIntensity={destaque ? 0.18 : 0} />
        </mesh>
      )}
      {segs.map(([p, q], i) => {
        const L = Math.hypot(q.x - p.x, q.z - p.z);
        if (L < 0.01) return null;
        // a parede recua meia espessura para dentro da área: duas áreas encostadas ficam com as paredes lado a lado
        const nx = -(q.z - p.z) / L, nz = (q.x - p.x) / L, mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
        const s = a.forma.fecha && dentro({ x: mx + nx * 0.05, z: mz + nz * 0.05 }, pts) ? 1 : -1;
        const d = a.forma.fecha ? (PAREDE_M / 2) * s : 0;
        return (
          <mesh key={i} position={[mx + nx * d, altura / 2, mz + nz * d]} rotation={[0, -Math.atan2(q.z - p.z, q.x - p.x), 0]} castShadow receiveShadow>
            <boxGeometry args={[L, altura, PAREDE_M]} />
            <meshStandardMaterial color={destaque ? primaria : PAREDE} roughness={0.9} transparent={transp} opacity={op} />
          </mesh>
        );
      })}
      {a.forma.pecas.map((pc) => {
        const ang = (((pc.rot ?? 0) + (a.lugar.r ?? 0)) * Math.PI) / 180;
        const x = ox + pc.cx / 100, z = oz + pc.cy / 100;
        const abertura = PECAS[pc.tipo]?.abertura;
        if (abertura && pc.tipo === "janela") {
          // a janela: vidro na parede, do peitoril ao alto da maquete
          const z0 = Math.min(0.9, altura - 0.15), h = Math.max(0.15, Math.min(altura, 2.1) - z0);
          return (
            <mesh key={pc.id} position={[x, z0 + h / 2, z]} rotation={[0, -ang, 0]}>
              <boxGeometry args={[Math.max(0.03, pc.w / 100), h, Math.max(0.03, pc.h / 100)]} />
              <meshStandardMaterial color="#9fd0ea" transparent opacity={0.55 * op} roughness={0.1} metalness={0.1} />
            </mesh>
          );
        }
        if (abertura) {
          // a porta (ou a passagem): o vão marcado no chão, em madeira
          return (
            <mesh key={pc.id} position={[x, 0.012, z]} rotation={[0, -ang, 0]} receiveShadow>
              <boxGeometry args={[Math.max(0.03, pc.w / 100), 0.02, Math.max(0.12, pc.h / 100)]} />
              <meshStandardMaterial color="#a8774c" transparent={transp} opacity={op} />
            </mesh>
          );
        }
        const h = pc.dh ? pc.dh / 100 : ALTURA[pc.tipo] ?? 0.8;
        const z0 = pc.alt ? pc.alt / 100 : BASE[pc.tipo] ?? 0;
        const cor = a.cor(pc.id) ?? corDaPeca(pc.tipo, pc.nome);
        const vidro = pc.tipo === "espelho";
        return (
          <mesh key={pc.id} position={[x, Math.min(z0, Math.max(0, altura - h)) + h / 2, z]} rotation={[0, -ang, 0]} castShadow receiveShadow>
            <boxGeometry args={[Math.max(0.02, pc.w / 100), Math.max(0.02, h), Math.max(0.02, pc.h / 100)]} />
            <meshStandardMaterial color={cor} roughness={vidro ? 0.05 : 0.55} metalness={vidro ? 0.6 : 0.05} transparent={transp} opacity={op} />
          </mesh>
        );
      })}
      {!apagada && (
        <Html position={[cx, altura + 0.3, cz]} center distanceFactor={14} zIndexRange={[10, 0]}>
          <button type="button" onClick={() => escolher(a.chave)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold shadow ${destaque ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>
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
    <Canvas shadows camera={{ position: [cx + tam * 0.15, tam * 0.62 + 1.5, cz + tam * 0.58 + 1.2], fov: 45 }} aria-label={descricao} role="img"
      onPointerMissed={() => escolhida && !isolar && escolher("")}>
      <color attach="background" args={["#f4f2ee"]} />
      <hemisphereLight args={["#ffffff", "#d9cfc2", 0.85]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[cx + 5, 10, cz + 6]} intensity={1.25} />
      {vis.map((a) => <Area key={a.chave} a={a} destaque={a.chave === escolhida} apagada={!!escolhida && !isolar && a.chave !== escolhida} escolher={escolher} maquete={!isolar} />)}
      <ContactShadows position={[cx, -0.001, cz]} scale={tam * 1.6 + 2} opacity={0.35} blur={2.4} far={3} />
      <OrbitControls target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.05} makeDefault />
    </Canvas>
  );
}
