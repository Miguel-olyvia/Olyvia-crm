// 6/11 (Rúben: «ao passar para o depois tens de te lembrar do posicionamento dos objetos»). O depois nasce do antes e tem de o seguir:
//  - uma peça que fica (ou se troca) está onde está no antes, até ser mudada de sítio no próprio depois (fica marcada: movidasNoDepois);
//  - uma peça nova da mesma família de uma que sai (uma sanita nova quando a antiga sai) vai para o sítio dela, se não for posta à mão;
//  - as portas e as janelas são as do antes (as paredes do depois são as do antes).
// Os projetos gravados antes desta regra (sem a marca) acertam-se ao abrir.
import { PECAS, encaixar, type PecaPlanta, type Planta, type Ponto } from "@/emylia/planta";
import { produto } from "./catalogoFake";
import type { Projeto } from "./necessidadesEstudio";

const centro = (pc: PecaPlanta): Ponto => ({ x: pc.x + pc.w / 2, y: pc.y + pc.h / 2 });
const mesmoSitio = (a: PecaPlanta, b: PecaPlanta) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;

/** A peça do depois no sítio da do antes: com o tamanho do produto escolhido (encostada à mesma parede), ou igual à do antes. */
function noSitioDoAntes(p: Projeto, doAntes: PecaPlanta, doDepois: PecaPlanta, planta: Planta): PecaPlanta {
  const prod = produto(p.escolhas[doDepois.id]);
  if (PECAS[doAntes.tipo].abertura || !prod?.w || !prod.h) return { ...doAntes, id: doDepois.id };
  return encaixar({ ...doAntes, id: doDepois.id }, prod.w, prod.h, planta);
}

/** O sítio livre para uma peça nova deste tipo: o de uma do mesmo tipo que sai do antes (e que ainda não foi ocupado). */
export function sitioDeQuemSai(p: Pick<Projeto, "antes" | "depois">, tipo: PecaPlanta["tipo"]): Ponto | undefined {
  const saem = p.antes.pecas.filter((x) => x.tipo === tipo && !p.depois.pecas.some((y) => y.id === x.id));
  const livre = saem.find((s) => !p.depois.pecas.some((y) => y.tipo === tipo && Math.abs(centro(y).x - centro(s).x) < 10 && Math.abs(centro(y).y - centro(s).y) < 10));
  return livre ? centro(livre) : undefined;
}

/** O antes mudou: o depois segue-o (as peças não mudadas no depois vão com as do antes; as novas do antes entram; as tiradas saem). */
export function seguirOAntes(x: Projeto, antes: Planta): Projeto {
  const movidas = new Set(x.movidasNoDepois ?? []);
  const eramDoAntes = new Map(x.antes.pecas.map((y) => [y.id, y])), saoDoAntes = new Map(antes.pecas.map((y) => [y.id, y]));
  const plantaNova: Planta = { o: { ...antes.o }, paredes: antes.paredes.map((w) => ({ ...w })), pecas: [] };
  const ficam = x.depois.pecas
    .filter((y) => saoDoAntes.has(y.id) || !eramDoAntes.has(y.id))
    .map((y) => {
      const agora = saoDoAntes.get(y.id), era = eramDoAntes.get(y.id);
      if (!agora) return y; // nova do depois
      // a peça mudou no antes e, no depois, ainda não foi mexida à mão: vai com ela
      if (era && !mesmoSitio(era, agora) && !movidas.has(y.id)) return noSitioDoAntes(x, agora, y, plantaNova);
      if (PECAS[agora.tipo].abertura) return { ...agora };
      return y;
    });
  const novas = antes.pecas.filter((y) => !eramDoAntes.has(y.id)).map((y) => ({ ...y }));
  return { ...x, antes, depois: { ...plantaNova, pecas: [...ficam, ...novas] } };
}

/** O depois mudou à mão: as peças que mudaram de sítio ficam marcadas (deixam de seguir o antes). */
export function mudarODepois(x: Projeto, depois: Planta): Projeto {
  const eram = new Map(x.depois.pecas.map((y) => [y.id, y]));
  const movidas = new Set(x.movidasNoDepois ?? []);
  for (const pc of depois.pecas) { const era = eram.get(pc.id); if (era && !mesmoSitio(era, pc)) movidas.add(pc.id); }
  return { ...x, depois, movidasNoDepois: [...movidas].filter((id) => depois.pecas.some((y) => y.id === id)) };
}

/** Os projetos de antes desta regra: as peças que ficam voltam ao sítio do antes e as novas vão para o sítio de quem sai. */
export function acertarPosicoes(p: Projeto): Projeto {
  if (p.movidasNoDepois) return p;
  const doAntes = new Map(p.antes.pecas.map((y) => [y.id, y]));
  let depois: Planta = { ...p.depois, pecas: p.depois.pecas.map((y) => { const a = doAntes.get(y.id); return a ? noSitioDoAntes(p, a, y, p.depois) : y; }) };
  // as novas (não estavam no antes) que tomam o sítio de uma do mesmo tipo que sai
  for (const nova of depois.pecas.filter((y) => !doAntes.has(y.id))) {
    const sitio = sitioDeQuemSai({ antes: p.antes, depois: { ...depois, pecas: depois.pecas.filter((y) => y.id !== nova.id) } }, nova.tipo);
    if (!sitio) continue;
    // a frente e o fundo do produto (encostada à parede da que sai, como ela); sem produto, só o centro
    const prod = produto(p.escolhas[nova.id]), ali = { ...nova, x: Math.round(sitio.x - nova.w / 2), y: Math.round(sitio.y - nova.h / 2) };
    const posta = prod?.w && prod.h ? encaixar(ali, prod.w, prod.h, depois) : ali;
    depois = { ...depois, pecas: depois.pecas.map((y) => (y.id === nova.id ? posta : y)) };
  }
  return { ...p, depois, movidasNoDepois: [] };
}
