// Os negócios de todas as pessoas desta página: os da seed (S.deals) e o negócio principal de cada pessoa de exemplo, e as pessoas que deles saem.
// Funções puras: nada aqui escreve no Estado. Os negócios de exemplo são cópias de um negócio base da seed, com um número que não existe no Estado,
// feitas de novo em cada chamada (o Estado muda no sítio, por isso nada fica em cache).
import type { Estado, Evento, Negocio } from "./motor";
import type { Pessoa } from "./leadsDocs";
import { PESSOAS_EXEMPLO, type PessoaExemplo } from "./pessoasExemplo";
import { perdaLembrada } from "./perdaDocs";

/** Campos da ficha que são da pessoa do negócio base e não podem passar para a cópia (o email, o NIF, a morada e o pedido dela). */
const DA_PESSOA: readonly string[] = [
  "email", "nif", "nif_fat", "nome_fiscal", "email_fat", "contacto_local", "campanha", "concelho", "pedido", "morada", "cp", "localidade", "fracao", "recomendou",
];

const semDaPessoa = (f: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(f).filter(([k]) => !DA_PESSOA.includes(k)));

/** "Pedido pelo site", "Pedido por telefone"... conforme a origem do negócio. */
function textoPedido(origem: string): string {
  const o = origem.toLowerCase();
  return o.startsWith("campanha") ? "Pedido pela campanha" : o === "site" ? "Pedido pelo site" : o.startsWith("recomend") ? "Pedido por recomendação" : "Pedido por telefone";
}

/** O histórico de um negócio de exemplo, do mais recente para o mais antigo: só o que o próprio negócio tem. */
function historico(ex: PessoaExemplo, perdida: boolean): Evento[] {
  const o = ex.orc;
  return [
    ...(perdida ? [{ t: "Marcado como perdido", q: "09/10", k: "x" as const }] : []),
    ...(o?.aceite ? [{ t: "Contrato assinado · cliente criado", q: o.aceite, k: "a" as const }] : []),
    ...(o?.enviada ? [{ t: "Proposta enviada ao portal", q: o.enviada, k: "a" as const }] : []),
    { t: textoPedido(ex.origem), q: ex.quando, k: "a" as const },
  ];
}

/** O negócio principal de uma pessoa de exemplo: a cópia do base com a identidade, a fase e o orçamento do exemplo. */
function negocioPrincipal(base: Negocio, ex: PessoaExemplo, perdida: boolean): Negocio {
  return {
    ...base, id: ex.id, nome: ex.nome, tel: ex.tel, servico: ex.servico, local: ex.local, origem: ex.origem, quando: ex.quando, fase: ex.fase,
    perdido: perdida, atraso: false, fresh: false, valida: null,
    f: { ...semDaPessoa(base.f), ...ex.f },
    visita: ex.slot === undefined ? base.visita : { ...base.visita, slot: ex.slot },
    orc: base.orc ? { ...base.orc, ...ex.orc } : null,
    hist: historico(ex, perdida),
  };
}

/** Os negócios principais das pessoas de exemplo. Uma pessoa cujo negócio base já não existe no Estado fica de fora.
 *  Nasce perdida a que o exemplo diz, e a que foi marcada como perdida nesta sessão (perdaDocs.ts): o Estado não se toca. */
export function dealsExemplo(S: Estado): Negocio[] {
  return PESSOAS_EXEMPLO.flatMap((ex) => {
    const base = S.deals.find((d) => d.id === ex.base);
    return base ? [negocioPrincipal(base, ex, ex.perdida !== undefined || perdaLembrada(ex.nome))] : [];
  });
}

/** Todos os negócios desta página: primeiro os da seed (os perdidos incluídos), depois os das pessoas de exemplo. */
export const dealsTodos = (S: Estado): Negocio[] => [...S.deals, ...dealsExemplo(S)];

/** Uma pessoa antes de ser lead ou cliente. `perdida`: todos os negócios dela estão perdidos (e então `negocios` são esses). */
export interface PessoaBase extends Pessoa { perdida: boolean }

/** As pessoas, agrupadas por nome pela ordem em que aparecem. `negocios` são os abertos; só se a pessoa não tem nenhum aberto é que ficam os perdidos. */
export function agruparPessoas(S: Estado): PessoaBase[] {
  const m = new Map<string, Negocio[]>();
  for (const d of dealsTodos(S)) m.set(d.nome, [...(m.get(d.nome) ?? []), d]);
  return [...m.entries()].map(([nome, todos]) => {
    const abertos = todos.filter((d) => !d.perdido), negocios = abertos.length ? abertos : todos;
    return { nome, tel: negocios[0].tel, negocios, perdida: abertos.length === 0, principal: negocios.reduce((a, d) => (d.fase > a.fase ? d : a), negocios[0]) };
  });
}
