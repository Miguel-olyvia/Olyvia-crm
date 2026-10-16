// A etapa de uma pessoa, o "atrasada" e o próximo passo. Funções puras: o dia de hoje chega por parâmetro.
// Os 5 passos do percurso (Lead, Contacto, Visita, Negócio, Cliente) mantêm as chaves de `EtapaPessoa`; uma perdida
// é um estado à parte, por cima do passo em que estava.
import { faseDoNegocio, type FaseNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { emAtraso } from "@/components/negocio-metas/saudeNegocio";
import { ehHistorico, type EtapaPessoa, type ResumoPessoa } from "./pessoasTipos";

export const ETAPAS: readonly EtapaPessoa[] = ["nova", "emContacto", "visitaMarcada", "qualificada", "cliente"];

/** A posição no percurso, de 0 (Lead) a 4 (Cliente). */
export const indiceEtapa = (etapa: EtapaPessoa): number => ETAPAS.indexOf(etapa);

/** O que a etapa e o "atrasada" precisam de saber de uma pessoa. */
export type EntradaEtapa = Pick<ResumoPessoa, "pessoa" | "papel" | "abertos">;

const ORDEM_FASE: readonly FaseNegocio[] = ["orcamento", "proposta", "contrato", "ganho"];
const ETAPAS_DE_LEAD: readonly EtapaPessoa[] = ["nova", "emContacto", "visitaMarcada"];

/** O negócio aberto mais avançado (em empate, o primeiro); `null` sem negócios abertos. */
export function negocioEmFoco(abertos: readonly NegocioMes[]): NegocioMes | null {
  return abertos.reduce<NegocioMes | null>(
    (melhor, n) => (melhor === null || ORDEM_FASE.indexOf(faseDoNegocio(n)) > ORDEM_FASE.indexOf(faseDoNegocio(melhor)) ? n : melhor),
    null,
  );
}

/**
 * Cliente se tem negócio ganho; senão "Negócio" se tem um aberto; senão a etapa de exemplo, limitada a
 * Lead, Contacto e Visita. Uma lead "nova" que já tem uma chamada registada passa a Contacto.
 */
export function etapaEfetiva({ pessoa, papel, abertos }: EntradaEtapa): EtapaPessoa {
  if (papel === "cliente") return "cliente";
  if (abertos.length > 0) return "qualificada";
  if (!ETAPAS_DE_LEAD.includes(pessoa.etapa)) return "emContacto";
  return pessoa.etapa === "nova" && pessoa.resultadoContacto !== undefined ? "emContacto" : pessoa.etapa;
}

/**
 * Lead: o próximo contacto é anterior a hoje. Cliente: só com um negócio em curso (aberto) com o prazo anterior a
 * hoje. Uma perdida nunca está atrasada.
 */
export function estaAtrasada({ pessoa, papel, abertos }: EntradaEtapa, hoje: string): boolean {
  if (pessoa.perdida) return false;
  if (papel === "cliente") return abertos.some((n) => emAtraso(n, hoje));
  return !!pessoa.proximoContacto && pessoa.proximoContacto < hoje;
}

/**
 * Os passos da coluna "Próximo passo". Um id tem sempre o mesmo texto ("Fazer o levantamento"), mas "fazerLevantamento" quer dizer
 * duas coisas, e a divergência mantém-se de propósito (os ids do "A fazer", em `processo/tiposProcesso.ts`, são outros):
 * - num negócio sem orçamentos é, no "A fazer", "criarOrcamento" (o negócio já existe);
 * - num pedido com a visita já feita (ver `marcarVisitaFeita`) a coluna não tem "Criar o negócio": diz "fazerLevantamento" e o
 *   "A fazer" distingue "fazerLevantamento" (sem linhas guardadas) de "criarNegocio" (com pelo menos uma).
 * `passosProcesso.test.ts` ("coerência com a coluna") fixa estes casos com exatidão.
 */
export type IdPasso =
  | "registarChamada" | "marcarVisita" | "fecharLevantamento" | "fazerLevantamento" | "escolherOrcamento"
  | "criarProposta" | "enviarProposta" | "esperarCliente" | "recolherAssinatura" | "nenhum";

export interface ProximoPasso {
  id: IdPasso;
  /** AAAA-MM-DD; `null` sem prazo. */
  prazo: string | null;
}

/** O passo de um negócio aberto. Uma proposta aceite sem contrato (não existe nos dados) conta como "à espera". */
export function passoDoNegocio(n: NegocioMes): IdPasso {
  const fase = faseDoNegocio(n);
  if (fase === "contrato") return "recolherAssinatura";
  if (fase === "proposta") return n.proposta?.estado === "rascunho" ? "enviarProposta" : "esperarCliente";
  if (n.orcamentos.length === 0) return "fazerLevantamento";
  return n.orcamentos.some((o) => o.escolhido) ? "criarProposta" : "escolherOrcamento";
}

const PASSO_DA_ETAPA: Partial<Record<EtapaPessoa, IdPasso>> = {
  nova: "registarChamada", emContacto: "marcarVisita", visitaMarcada: "fecharLevantamento",
};

/**
 * O próximo passo para a coluna da lista e para o Resumo. Uma perdida, ou um cliente sem negócio aberto, não tem
 * nenhum ("—"). Com negócio aberto manda o mais avançado e o prazo é o dele; antes disso, o próximo contacto.
 */
export function proximoPasso(r: Pick<ResumoPessoa, "pessoa" | "papel" | "abertos" | "etapa">): ProximoPasso {
  if (r.pessoa.perdida) return { id: "nenhum", prazo: null };
  const foco = negocioEmFoco(r.abertos);
  if (foco) return { id: passoDoNegocio(foco), prazo: foco.proximoPrazo };
  // Com a visita já feita (ver `marcarVisitaFeita`) o que falta é o levantamento; a coluna não tem "Criar o negócio".
  const id = r.etapa === "visitaMarcada" && r.pessoa.visita?.feita ? "fazerLevantamento" : PASSO_DA_ETAPA[r.etapa];
  return id ? { id, prazo: r.pessoa.proximoContacto ?? null } : { id: "nenhum", prazo: null };
}

/** O índice (0 a 3) do passo em que uma lead está (o passo em que se perderia agora). */
export const passoAtual = (r: Pick<ResumoPessoa, "etapa">): number => Math.min(indiceEtapa(r.etapa), 3);

/** O índice (0 a 3) do passo em que a pessoa foi perdida; nas perdidas antigas, sem passo, o da etapa. */
export const passoDaPerdida = (r: Pick<ResumoPessoa, "pessoa" | "etapa">): number => r.pessoa.perdida?.passo ?? passoAtual(r);

/** Uma lead em curso cujos negócios estão todos perdidos: a ficha avisa e oferece "Marcar como perdida". */
export function todosNegociosPerdidos(r: Pick<ResumoPessoa, "pessoa" | "papel" | "negocios">): boolean {
  return r.papel === "lead" && !r.pessoa.perdida && r.negocios.length > 0 && r.negocios.every((n) => ehHistorico(n) && n.resultado === "perdido");
}
