// 26/11: o «Porquê» de cada zona do painel «Aspeto 3D»: de onde vem a cor e a superfície que a zona leva. Puro: sem React nem three.
// NÃO tem regras próprias: pergunta ao 3D (aparenciaDaZona e superficieDaZona, com as ligações de ligacoesDaConfig) quem vence, e só depois classifica o vencedor pelas regras (explícita,
// «Todas as zonas», automático) e procura quem perdeu. Assim o painel nunca diz uma coisa e o 3D mostra outra, e se a regra do 3D mudar o painel acompanha-a.
import { ligacoesDaConfig, type Ligacao } from "./config3dDados";
import { ehAtributoDeTextura } from "./planta3d/acabamentoCor3d";
import { chaveDeExclusao, ehAtributoDeSuperficie, superficieDaZona } from "./planta3d/aspetoZonas";
import { aparenciaDaZona, type ZonaGlb } from "./planta3d/zonasGlb";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

/** Como uma regra chega à zona: «zona» (ligação directa a esta zona), «tudo» («Todas as zonas»), «automatico» (sem regras: pelo nome do atributo, ou actua em todas as zonas). */
export type ViaDaRegra = "zona" | "tudo" | "automatico";
export interface Participante { id: string; nome: string; via: ViaDaRegra }

/**
 * De onde vem o resultado de uma camada (cor ou superfície) numa zona:
 *   - `explicita`: uma regra desta zona; `regra-tudo`: a regra «Todas as zonas»; `automatico`: sem regras (o nome do atributo, ou todas as zonas);
 *   - `da-cor`: só a superfície: vem da opção de cor escolhida (o atributo de cor é `atributo`);
 *   - `conflito`: duas ou mais regras pintam a mesma zona; ganha `vencedor` (o que o 3D mostra), `perdedor` é o primeiro dos que ficam sem efeito e `perdedores` são todos;
 *   - `nenhuma`: nada pinta esta camada nesta zona.
 */
export type OrigemCamada =
  | { tipo: "nenhuma" }
  | { tipo: "automatico" | "regra-tudo" | "explicita" | "da-cor"; atributo: string; atributoId: string }
  | { tipo: "conflito"; vencedor: Participante; perdedor: Participante; perdedores: Participante[] };
/** Um atributo desta camada que NÃO pinta esta zona por uma regra «não pinta»; `daRegraTudo`: a regra «Todas as zonas» dele cobre as outras zonas (é uma excepção). */
export interface Excecao { id: string; nome: string; daRegraTudo: boolean }
export interface PorqueCamada { origem: OrigemCamada; excecoes: Excecao[] }
export interface PorqueDaZona { cor: PorqueCamada; superficie: PorqueCamada }

export interface EntradaPorque {
  zona: ZonaGlb;
  regras: readonly Ligacao[];
  attrs: readonly AtributoProduto[] | undefined;
  defs: readonly AtributoDef[] | undefined;
}

// 27/11: a Textura (com hex e foto na base) não é um atributo de cor: nunca pinta uma zona
const daCor = (d: AtributoDef): boolean => (d.temHex === true || d.temFoto === true) && !ehAtributoDeTextura(d);

export function porqueDaZona({ zona, regras, attrs, defs }: EntradaPorque): PorqueDaZona {
  const todas = defs ?? [];
  const { ligacoes, excluidos } = ligacoesDaConfig(regras);
  const opcaoDe = (d: AtributoDef) => { const a = attrs?.find((x) => x.atributoId === d.id && x.opcaoId); return a ? d.opcoes.find((o) => o.id === a.opcaoId) : undefined; };
  const viaDe = (id: string): ViaDaRegra => (regras.some((l) => l.atributo === id && l.zona === zona && l.aplicar) ? "zona" : ligacoes[id]?.includes(zona) ? "tudo" : "automatico");
  const participante = (d: AtributoDef): Participante => ({ id: d.id, nome: d.nome, via: viaDe(d.id) });
  const excecoesDe = (ds: readonly AtributoDef[]): Excecao[] => ds
    .filter((d) => opcaoDe(d) && regras.some((l) => l.atributo === d.id && l.zona === zona && !l.aplicar))
    .map((d) => ({ id: d.id, nome: d.nome, daRegraTudo: regras.some((l) => l.atributo === d.id && l.zona === "tudo" && l.aplicar) }));
  /** A origem de um vencedor, e o conflito se outros actuam nesta zona (e pelo menos um deles — ou o vencedor — por uma regra). */
  const origemDe = (vencedor: AtributoDef, concorrentes: readonly AtributoDef[]): OrigemCamada => {
    const perdedores = concorrentes.filter((d) => d.id !== vencedor.id).map(participante);
    const v = participante(vencedor);
    if (perdedores.length && (v.via !== "automatico" || perdedores.some((p) => p.via !== "automatico"))) return { tipo: "conflito", vencedor: v, perdedor: perdedores[0], perdedores };
    return { tipo: v.via === "zona" ? "explicita" : v.via === "tudo" ? "regra-tudo" : "automatico", atributo: vencedor.nome, atributoId: vencedor.id };
  };

  // a cor: o vencedor é o que o 3D pinta; só concorrem os atributos de cor ligados a esta zona por uma regra (os que pintam só pelo nome não concorrem com uma regra)
  const defsCor = todas.filter(daCor);
  const cor3d = aparenciaDaZona(zona, attrs, defs, ligacoes, excluidos);
  const doNome = cor3d ? defsCor.filter((d) => d.nome === cor3d.atributo) : [];
  const vencedorCor = doNome.find((d) => ligacoes[d.id]?.includes(zona)) ?? doNome[0];
  const concorrentesCor = defsCor.filter((d) => ligacoes[d.id]?.includes(zona) && opcaoDe(d));
  const cor: PorqueCamada = {
    origem: !cor3d ? { tipo: "nenhuma" } : vencedorCor ? origemDe(vencedorCor, concorrentesCor) : { tipo: "automatico", atributo: cor3d.atributo, atributoId: "" },
    excecoes: excecoesDe(defsCor),
  };

  // a superfície: o vencedor é o que superficieDaZona devolve; concorrem os atributos de superfície que actuam nesta zona (sem regras actuam em todas) e têm superfície na opção escolhida
  const defsSup = todas.filter(ehAtributoDeSuperficie);
  const asp = superficieDaZona({ zona, attrs, defs, ligacoes, excluidos, daOpcaoDaCor: cor3d ? { metal: cor3d.metal === true, superficie: cor3d.superficie ?? null } : null });
  const actuam = defsSup.filter((d) => !excluidos.has(chaveDeExclusao(d.id, zona)) && (ligacoes[d.id]?.length ? ligacoes[d.id].includes(zona) : true) && !!opcaoDe(d)?.superficie);
  const vencedorSup = asp.atributo ? actuam.find((d) => d.nome === asp.atributo) ?? defsSup.find((d) => d.nome === asp.atributo) : undefined;
  const superficie: PorqueCamada = {
    origem: vencedorSup ? origemDe(vencedorSup, actuam)
      : asp.superficie && cor3d ? { tipo: "da-cor", atributo: cor3d.atributo, atributoId: vencedorCor?.id ?? "" } : { tipo: "nenhuma" },
    excecoes: excecoesDe(defsSup),
  };
  return { cor, superficie };
}

export interface EntradaSemEfeito {
  /** A regra que se quer saber onde não chega a pintar. */
  regra: Ligacao;
  regras: readonly Ligacao[];
  attrs: readonly AtributoProduto[] | undefined;
  defs: readonly AtributoDef[] | undefined;
  /** As zonas que o modelo tem. */
  zonas: readonly ZonaGlb[];
}

/**
 * As zonas em que uma regra «pinta» (aplicar: sim) não chega a pintar: onde uma regra «não pinta» do mesmo atributo a tira (a excepção), ou onde outro atributo da mesma camada ganha. A regra
 * «Todas as zonas» responde por todas as zonas do modelo; uma regra de uma zona só por essa. Uma regra «não pinta» é ela própria a excepção: nunca é «sem efeito».
 */
export function zonasSemEfeito({ regra, regras, attrs, defs, zonas }: EntradaSemEfeito): ZonaGlb[] {
  if (!regra.aplicar) return [];
  const alvo = regra.zona === "tudo" ? zonas : zonas.filter((z) => z === regra.zona);
  return alvo.filter((zona) => {
    const propria = regras.find((l) => l.atributo === regra.atributo && l.zona === zona);
    if (regra.zona === "tudo" && propria) return !propria.aplicar; // a excepção tira-a desta zona; uma regra explícita «pinta» tem a sua própria linha
    const p = porqueDaZona({ zona, regras, attrs, defs });
    const perde = (c: PorqueCamada): boolean => c.origem.tipo === "conflito" && c.origem.perdedores.some((x) => x.id === regra.atributo);
    const ganha = (c: PorqueCamada): boolean => (c.origem.tipo === "conflito" ? c.origem.vencedor.id === regra.atributo : c.origem.tipo !== "nenhuma" && c.origem.atributoId === regra.atributo);
    return (perde(p.cor) || perde(p.superficie)) && !ganha(p.cor) && !ganha(p.superficie);
  });
}
