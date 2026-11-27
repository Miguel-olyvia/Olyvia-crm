// 27/11: o 3D de um GLB PRÓPRIO (o ficheiro que a empresa carrega numa categoria, subcategoria ou Modelo): a evolução do `ModeloGLB` do Visualizador3D. O GLB só dá a FORMA;
// o resto vem do produto (modelo3dProprio.ts, o contrato do dono). A montagem (normalizar, escalar pelas medidas, pintar com a cor e a textura do produto todos os materiais
// menos metal, vidro, espelho, luz e agua, materiais próprios por instância) está em montarModeloProprio.ts; aqui só o que é do React e do canvas: pedir o GLB à cache de
// modelosHtml/glb.ts (o mesmo carregador e descodificador meshopt), montar, libertar e dizer ao ecrã (estadoGlbProprio.ts) se há um aviso. Se o ficheiro não abrir, `lerGlb`
// lança e quem está por cima (a reserva do Visualizador3D) põe o modelo genérico, com a nota. Sem medidas nem cor nem textura, o GLB aparece como veio.
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { MedidasProduto } from "./modelo3dProprio";
import { limparEstadoGlb, registarEstadoGlb } from "./estadoGlbProprio";
import { montarModeloProprio, type TexturaCarregada } from "./montarModeloProprio";
import { lerGlb, reterGlb, soltarGlb } from "./modelosHtml/glb";

export interface ModeloProprioProps {
  url: string;
  /** as medidas do produto em metros, ou null se o produto não as tem (tamanho nativo) */
  medidas: MedidasProduto | null;
  /** a cor do produto (hex); sem ela os materiais ficam como o ficheiro os trouxe */
  cor?: string | undefined;
  textura?: TexturaCarregada | null | undefined;
}

/** O GLB próprio dentro do canvas (suspende enquanto carrega; lança se falhar, para a reserva do Visualizador3D pôr o genérico). */
export function ModeloProprio({ url, medidas, cor, textura }: ModeloProprioProps) {
  useEffect(() => { reterGlb(url); return () => soltarGlb(url); }, [url]);
  const cena = lerGlb(url);
  const invalidate = useThree((s) => s.invalidate);
  const w = medidas?.larguraM, p = medidas?.profundidadeM, h = medidas?.alturaM;
  const tex = textura?.tex, lado = textura?.ladoCm, tingir = textura?.tingir;
  const m = useMemo(
    () => montarModeloProprio(cena, { medidas: w === undefined || p === undefined || h === undefined ? null : { larguraM: w, profundidadeM: p, alturaM: h }, cor, textura: tex && lado !== undefined ? { tex, ladoCm: lado, ...(tingir ? { tingir } : {}) } : null }),
    [cena, w, p, h, cor, tex, lado, tingir],
  );
  useEffect(() => () => m.libertar(), [m]);
  // a nota fica fora do canvas (estadoGlbProprio.ts): um aviso ou «ok»; o desenho é sob pedido, por isso pede-se um quando o modelo muda
  useEffect(() => {
    registarEstadoGlb(url, m.aviso ? { tipo: "aviso", texto: m.aviso } : { tipo: "ok" });
    invalidate();
    return () => limparEstadoGlb(url);
  }, [url, m, invalidate]);
  return <primitive object={m.grupo} />;
}
