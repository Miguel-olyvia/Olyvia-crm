// 27/11: a parte com ciclo de vida do 3D de um GLB próprio (ModeloProprio.tsx só desenha o resultado): pede o GLB à cache (modelosHtml/glb.ts: suspende enquanto carrega e LANÇA se falhar, para a
// reserva do Visualizador3D pôr o modelo genérico), monta uma instância (montarModeloProprio.ts) que se refaz quando muda a medida, a cor ou a textura do produto, liberta os materiais
// dela ao sair e diz ao ecrã (estadoGlbProprio.ts), fora do canvas, se há um aviso. O desenho do canvas é sob pedido: pede-se um quando o modelo muda.
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { MedidasProduto } from "./modelo3dProprio";
import { limparEstadoGlb, registarEstadoGlb } from "./estadoGlbProprio";
import { montarModeloProprio, type ModeloProprioMontado, type TexturaCarregada } from "./montarModeloProprio";
import { lerGlb, reterGlb, soltarGlb } from "./modelosHtml/glb";

export interface ModeloProprioProps {
  url: string;
  /** as medidas do produto em metros, ou null se o produto não as tem (tamanho nativo) */
  medidas: MedidasProduto | null;
  /** a cor do produto (hex); sem ela os materiais ficam como o ficheiro os trouxe */
  cor?: string | undefined;
  textura?: TexturaCarregada | null | undefined;
}

export function useModeloProprio({ url, medidas, cor, textura }: ModeloProprioProps): ModeloProprioMontado {
  useEffect(() => { reterGlb(url); return () => soltarGlb(url); }, [url]);
  const cena = lerGlb(url);
  const invalidate = useThree((s) => s.invalidate);
  const w = medidas?.larguraM, p = medidas?.profundidadeM, h = medidas?.alturaM;
  const tex = textura?.tex, lado = textura?.ladoCm, tingir = textura?.tingir;
  const m = useMemo(
    () => montarModeloProprio(cena, {
      medidas: w === undefined || p === undefined || h === undefined ? null : { larguraM: w, profundidadeM: p, alturaM: h }, cor,
      textura: tex && lado !== undefined ? { tex, ladoCm: lado, ...(tingir ? { tingir } : {}) } : null,
    }),
    [cena, w, p, h, cor, tex, lado, tingir],
  );
  useEffect(() => () => m.libertar(), [m]);
  useEffect(() => {
    registarEstadoGlb(url, m.aviso ? { tipo: "aviso", texto: m.aviso } : { tipo: "ok" });
    invalidate();
    return () => limparEstadoGlb(url);
  }, [url, m, invalidate]);
  return m;
}
