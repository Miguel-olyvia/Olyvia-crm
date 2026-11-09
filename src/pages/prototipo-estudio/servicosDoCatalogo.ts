// 9/11 (Rúben: «ligar ao Estúdio o catálogo de serviços, com os materiais, os consumíveis e os técnicos»; «o Estúdio é o passo final da
// visita: quando fecha, a visita já tem toda a informação sobre os serviços, e o plano de obra e o orçamento já estão gerados»).
// O que o Estúdio decidiu (as linhas das duas plantas) ligado ao Catálogo verdadeiro da organização, já no Estúdio: cada trabalho com o
// serviço do Catálogo (o preço, a receita: o ofício, as horas, os materiais e consumíveis), cada peça com o produto (e a instalação que
// o produto traz). O comercial troca o serviço, tira-o ou junta outro do Catálogo; isso fica no projeto (Projeto.catalogo) e é o que
// entra no negócio ao fechar a visita. Só regras; os ecrãs estão em PlanoDoEstudio.tsx.
import { ligarAoCatalogo, type LinhaLevada, type ProdutoReal } from "@/emylia/ligarEstudio";
import type { Estado, SvcId } from "@/emylia/motor";
import type { ServicoEscolhido } from "@/emylia/planoDaVisita";
import { linhasParaLevar } from "./levarParaNegocio";
import type { Projeto } from "./necessidadesEstudio";

/** O que o comercial mudou na ligação ao Catálogo: trocas (linha → serviço; null = tirar), serviços juntados à mão, o dia de início. */
export interface EscolhasCatalogo {
  trocas?: Record<string, SvcId | null>;
  extras?: ServicoEscolhido[];
  /** O dia de início da obra (aaaa-mm-dd) escolhido no plano. */
  inicio?: string;
}

/** Um serviço do Catálogo no projeto. `chave`: a linha do Estúdio de onde vem (para a troca), ou «extra:<id>» se foi juntado à mão. */
export interface ServicoDoProjeto {
  chave: string; sid: SvcId; n: string; q: number; un: string; preco: number;
  /** As linhas do Estúdio que o pediram (em palavras). */
  de: string[];
  /** Juntado à mão (não sai das plantas) ou trazido por um produto (a instalação). */
  origem: "planta" | "extra" | "produto";
  /** A unidade do Catálogo não é a do Estúdio: confirmar a quantidade. */
  unDiferente?: string;
  trocado?: boolean;
}
export interface ProdutoDoProjeto { chave: string; id: string; n: string; q: number; de: string[] }

export interface ProjetoNoCatalogo {
  servicos: ServicoDoProjeto[];
  produtos: ProdutoDoProjeto[];
  /** As linhas sem par no Catálogo (em palavras): juntar à mão. */
  semPar: string[];
  /** As linhas tiradas pelo comercial (a chave e o nome). */
  tirados: { chave: string; n: string }[];
}

type ProdutoCat = ProdutoReal & { servico?: SvcId; fatorServico?: number; un?: string };

/** O projeto ligado ao Catálogo verdadeiro (S.svc e os produtos da organização), com as escolhas do comercial. */
export function projetoNoCatalogo(p: Projeto, S: Pick<Estado, "svc">, produtos: readonly ProdutoCat[]): ProjetoNoCatalogo {
  const E = p.catalogo ?? {};
  const linhas: LinhaLevada[] = linhasParaLevar(p);
  const lig = ligarAoCatalogo(linhas, S.svc, produtos);
  const servicos: ServicoDoProjeto[] = [], prods: ProdutoDoProjeto[] = [], semPar: string[] = [], tirados: ProjetoNoCatalogo["tirados"] = [];
  const juntarServico = (x: ServicoDoProjeto) => {
    const ja = servicos.find((y) => y.sid === x.sid && y.origem !== "extra");
    if (ja && x.origem !== "extra") { ja.q = Math.round((ja.q + x.q) * 100) / 100; ja.de.push(...x.de.filter((n) => !ja.de.includes(n))); return; }
    servicos.push(x);
  };
  for (const g of lig) {
    const chave = g.linhas[0].id, de = g.linhas.map((l) => l.n);
    if (!g.alvo) { semPar.push(...de); continue; }
    if (g.alvo.tipo === "produto") {
      if (E.trocas?.[chave] === null) { tirados.push({ chave, n: g.alvo.n }); continue; }
      const pr = produtos.find((x) => x.id === g.alvo!.id);
      prods.push({ chave, id: g.alvo.id, n: g.alvo.n, q: g.q, de });
      // a instalação que o produto traz entra como serviço (é o que o orçamento faz: trazidosParaOrc)
      const sid = pr?.servico;
      if (sid && S.svc[sid]) juntarServico({ chave: `prod:${g.alvo.id}`, sid, n: S.svc[sid].n, q: g.q * (pr?.fatorServico ?? 1), un: S.svc[sid].un, preco: S.svc[sid].preco, de: [g.alvo.n], origem: "produto" });
      continue;
    }
    if (g.vemComProduto) continue;
    const troca = E.trocas?.[chave];
    if (troca === null) { tirados.push({ chave, n: S.svc[g.alvo.id]?.n ?? g.alvo.n }); continue; }
    const sid = troca && S.svc[troca] ? troca : g.alvo.id;
    const s = S.svc[sid];
    if (!s) { semPar.push(...de); continue; }
    juntarServico({ chave, sid, n: s.n, q: g.q, un: s.un, preco: s.preco, de, origem: "planta", ...(g.unDiferente && sid === g.alvo.id ? { unDiferente: g.unDiferente } : {}), ...(troca ? { trocado: true } : {}) });
  }
  for (const x of E.extras ?? []) {
    const s = S.svc[x.sid];
    if (s && x.q > 0) servicos.push({ chave: `extra:${x.sid}`, sid: x.sid, n: s.n, q: x.q, un: s.un, preco: s.preco, de: ["Juntado no Estúdio"], origem: "extra" });
  }
  return { servicos, produtos: prods, semPar, tirados };
}

/** Os serviços para o plano e para o orçamento (somados pelo serviço). */
export function servicosParaPlano(L: ProjetoNoCatalogo): ServicoEscolhido[] {
  const m = new Map<SvcId, number>();
  for (const s of L.servicos) m.set(s.sid, (m.get(s.sid) ?? 0) + s.q);
  return [...m].map(([sid, q]) => ({ sid, q: Math.round(q * 100) / 100 }));
}

/* ------------------------------------------------------------------ as mudanças do comercial */
const comCatalogo = (p: Projeto, fn: (e: EscolhasCatalogo) => EscolhasCatalogo): Projeto => ({ ...p, catalogo: fn({ ...(p.catalogo ?? {}) }) });
/** Trocar o serviço de uma linha por outro do Catálogo (o mesmo de origem desfaz a troca). */
export const trocarServico = (p: Projeto, chave: string, sid: SvcId | null): Projeto =>
  comCatalogo(p, (e) => ({ ...e, trocas: { ...(e.trocas ?? {}), [chave]: sid } }));
/** Voltar a pôr uma linha tirada (ou desfazer a troca). */
export const reporServico = (p: Projeto, chave: string): Projeto =>
  comCatalogo(p, (e) => { const t = { ...(e.trocas ?? {}) }; delete t[chave]; return { ...e, trocas: t }; });
/** Juntar um serviço do Catálogo à mão (a quantidade de partida: 1). */
export const juntarExtra = (p: Projeto, sid: SvcId, q = 1): Projeto =>
  comCatalogo(p, (e) => ({ ...e, extras: [...(e.extras ?? []).filter((x) => x.sid !== sid), { sid, q }] }));
export const mudarExtra = (p: Projeto, sid: SvcId, q: number): Projeto =>
  comCatalogo(p, (e) => ({ ...e, extras: q > 0 ? (e.extras ?? []).map((x) => (x.sid === sid ? { ...x, q } : x)) : (e.extras ?? []).filter((x) => x.sid !== sid) }));
export const mudarInicio = (p: Projeto, inicio: string): Projeto => comCatalogo(p, (e) => ({ ...e, inicio }));
