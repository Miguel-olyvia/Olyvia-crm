// 25/11: o ambiente COM CONTRASTE dos metais. O ambiente da cena (EstudioAmbiente, Visualizador3D.tsx) é claro e quase uniforme: dá a luz aos não metais, mas um metal só se lê como metal
// quando reflecte zonas claras E escuras (caixas de luz, um fundo escuro, um horizonte); com um cinzento claro por todo o lado um cobre sai creme baço. Por isso os materiais de metal
// levam um segundo mapa (`material.envMap`, só neles) e o ambiente dos não metais fica exactamente como estava. Os dados das caixas estão à parte, em mm como o estúdio do HTML.
import * as THREE from "three";

/** Uma caixa de luz do estúdio: tamanho e posição em mm, e a cor e a intensidade (multiplicador de uma cor que pode passar de 1: o mapa é HDR). */
export interface CaixaAmbiente { w: number; h: number; x: number; y: number; z: number; cor: string; k: number }
/** O fundo do estúdio: escuro, para os reflexos terem de onde contrastar. */
export const FUNDO_AMBIENTE_METAL = "#303236";
/** As caixas de luz: uma grande por cima, duas tiras verticais dos lados, uma tira de recorte atrás, um enchimento fraco à frente, um chão médio e um horizonte claro. */
export const CAIXAS_AMBIENTE_METAL: readonly CaixaAmbiente[] = [
  { w: 520, h: 720, x: 0, y: 820, z: 80, cor: "#ffffff", k: 7 },
  { w: 150, h: 1100, x: -620, y: 360, z: 220, cor: "#fffdf3", k: 6 },
  { w: 260, h: 1100, x: 620, y: 360, z: 160, cor: "#ffffff", k: 5 },
  { w: 900, h: 110, x: 0, y: 420, z: -720, cor: "#ffffff", k: 4 },
  { w: 1100, h: 600, x: 0, y: 200, z: 720, cor: "#c4c4be", k: 2.2 },
  { w: 1600, h: 1600, x: 0, y: -320, z: 0, cor: "#6a6a6a", k: 0.9 },
  { w: 1500, h: 90, x: 0, y: 40, z: -820, cor: "#fff4e0", k: 2.2 },
];
/** A razão entre a caixa mais luminosa e o fundo (mede-se aqui para um teste não deixar o mapa voltar a ficar plano). */
export function contrasteDoAmbienteMetal(): number {
  const lum = (cor: string, k: number): number => { const c = new THREE.Color(cor); return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * k; };
  return Math.max(...CAIXAS_AMBIENTE_METAL.map((c) => lum(c.cor, c.k))) / lum(FUNDO_AMBIENTE_METAL, 1);
}

export interface AmbienteMetal { texture: THREE.Texture; dispose: () => void }

/** Cozinha o estúdio num mapa de reflexos (PMREM), sem descarregar nada. Quem o cria liberta-o com `dispose`. */
export function criarAmbienteMetal(gl: THREE.WebGLRenderer): AmbienteMetal {
  const estudio = new THREE.Scene();
  estudio.background = new THREE.Color(FUNDO_AMBIENTE_METAL);
  for (const c of CAIXAS_AMBIENTE_METAL) {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(c.w * 0.001, c.h * 0.001), new THREE.MeshBasicMaterial({ color: new THREE.Color(c.cor).multiplyScalar(c.k), side: THREE.DoubleSide }));
    o.position.set(c.x * 0.001, c.y * 0.001, c.z * 0.001); o.lookAt(0, 0.18, 0.09); estudio.add(o);
  }
  const pmrem = new THREE.PMREMGenerator(gl), alvo = pmrem.fromScene(estudio, 0.01, 0.0001, 3);
  estudio.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  pmrem.dispose();
  return { texture: alvo.texture, dispose: () => alvo.dispose() };
}
