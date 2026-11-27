// 27/11: o 3D de um GLB PRÓPRIO (o ficheiro que a empresa carrega numa categoria, subcategoria ou Modelo): a evolução do `ModeloGLB` do Visualizador3D. O GLB só dá a FORMA;
// o resto vem do produto (modelo3dProprio.ts, o contrato do dono). A montagem (normalizar, escalar pelas medidas, pintar com a cor e a textura do produto todos os materiais
// menos metal, vidro, espelho, luz e agua, materiais próprios por instância) está em montarModeloProprio.ts e o ciclo de vida em useModeloProprio.ts; aqui só se desenha. Se o ficheiro
// não abrir, o hook lança e quem está por cima (a reserva do Visualizador3D) põe o modelo genérico, com a nota (estadoGlbProprio.ts). Sem medidas nem cor nem textura, o GLB aparece como veio.
import { useModeloProprio, type ModeloProprioProps } from "./useModeloProprio";

export type { ModeloProprioProps };

/** O GLB próprio dentro do canvas (suspende enquanto carrega; lança se falhar). */
export function ModeloProprio(props: ModeloProprioProps) {
  const m = useModeloProprio(props);
  return <primitive object={m.grupo} />;
}
