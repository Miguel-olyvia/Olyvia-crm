// 25/11: escolher a zona NO 3D. Que zona está debaixo do ponteiro: a da malha mais próxima e visível (criarMateriaisDeZona marca em cada malha a zona da sua parte, em `userData.zona`),
// e se o gesto foi um clique ou o arrastar da câmara (o OrbitControls ouve o mesmo ponteiro). Sem React nem three: só a estrutura que o three dá (visible, userData, parent).
import { ZONAS, type ZonaGlb } from "./zonasGlb";

/** Quanto o ponteiro se pode mexer (píxeis) entre premir e largar para ainda contar como clique; acima disto é o arrastar da câmara (rodar a peça) e não se escolhe nada. */
export const LIMITE_ARRASTO_PX = 5;
export const foiClique = (deltaPx: number): boolean => deltaPx <= LIMITE_ARRASTO_PX;

/** O que se lê de um objecto do three (uma malha e os seus pais). */
export interface ObjetoDoCanvas { visible: boolean; userData: Record<string, unknown>; parent: ObjetoDoCanvas | null }

/** A zona de uma malha, ou null se não tem zona, se a zona não existe, ou se ela (ou um pai) está escondida (uma parte que as opções tiraram: o raio do three atravessa-a, mas não se vê). */
export function zonaDoObjeto(o: ObjetoDoCanvas): ZonaGlb | null {
  for (let p: ObjetoDoCanvas | null = o; p; p = p.parent) if (!p.visible) return null;
  const z = o.userData.zona;
  return (ZONAS as readonly unknown[]).includes(z) ? (z as ZonaGlb) : null;
}

/**
 * A zona debaixo do ponteiro: a da primeira intersecção VISÍVEL, pela ordem do raio (a mais próxima). Se essa malha não tem zona (o chão, o interior, a água) não há zona: não se atravessa.
 * `validas`: só as zonas que o modelo tem e se pintam; outra (o metal dos puxadores, que só se pinta ligado à mão) não se escolhe.
 */
export function zonaDaPrimeiraIntersecao(intersecoes: ReadonlyArray<{ object: ObjetoDoCanvas }>, validas?: ReadonlySet<ZonaGlb>): ZonaGlb | null {
  for (const i of intersecoes) {
    let escondida = false;
    for (let p: ObjetoDoCanvas | null = i.object; p; p = p.parent) if (!p.visible) { escondida = true; break; }
    if (escondida) continue;
    const z = zonaDoObjeto(i.object);
    return z && (!validas || validas.has(z)) ? z : null;
  }
  return null;
}
