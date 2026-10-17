// A etapa de uma pessoa, o "atrasada" e o próximo passo. Funções puras: o dia de hoje chega por parâmetro.
// Os 5 passos do percurso (Lead, Contacto, Visita, Negócio, Cliente) mantêm as chaves de `EtapaPessoa`; uma perdida
// é um estado à parte, por cima do passo em que estava.
import { faseDoNegocio, type FaseNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { emAtraso } from "@/components/negocio-metas/saudeNegocio";
import { faseDoPedido, proximoContactoDaPessoa } from "./pedidoNegocio";
import { ehHistorico, type EtapaPessoa, type FasePedido, type PedidoNegocio, type ResumoPessoa } from "./pessoasTipos";

export const ETAPAS: readonly EtapaPessoa[] = ["nova", "emContacto", "visitaMarcada", "qualificada", "cliente"];

/** A posição no percurso, de 0 (Lead) a 4 (Cliente). */
export const indiceEtapa = (etapa: EtapaPessoa): number => ETAPAS.indexOf(etapa);

/** O que a etapa e o "atrasada" precisam de saber de uma pessoa: os pedidos são os dela. */
export type EntradaEtapa = Pick<ResumoPessoa, "pessoa" | "papel" | "abertos" | "pedidos">;

const ORDEM_FASE: readonly FaseNegocio[] = ["orcamento", "proposta", "contrato", "ganho"];
const ORDEM_FASE_PEDIDO: readonly FasePedido[] = ["porContactar", "contactado", "visita"];
const ETAPA_DO_PEDIDO: Record<FasePedido, EtapaPessoa> = { porContactar: "nova", contactado: "emContacto", visita: "visitaMarcada" };

const temVisitaFeita = (pedido: PedidoNegocio): boolean => pedido.visitas.some((v) => v.estado === "feita");

/** Quão à frente está um pedido: a fase e, na fase Visita, se já há uma visita feita (falta só criar o negócio). */
const avanco = (pedido: PedidoNegocio): number => ORDEM_FASE_PEDIDO.indexOf(faseDoPedido(pedido)) * 2 + (temVisitaFeita(pedido) ? 1 : 0);

/** O pedido mais à frente (em empate, o primeiro); `null` sem pedidos. */
export function pedidoMaisAvancado(pedidos: readonly PedidoNegocio[]): PedidoNegocio | null {
  return pedidos.reduce<PedidoNegocio | null>((melhor, p) => (melhor === null || avanco(p) > avanco(melhor) ? p : melhor), null);
}

/** O negócio aberto mais avançado (em empate, o primeiro); `null` sem negócios abertos. */
export function negocioEmFoco(abertos: readonly NegocioMes[]): NegocioMes | null {
  return abertos.reduce<NegocioMes | null>(
    (melhor, n) => (melhor === null || ORDEM_FASE.indexOf(faseDoNegocio(n)) > ORDEM_FASE.indexOf(faseDoNegocio(melhor)) ? n : melhor),
    null,
  );
}

/**
 * Cliente se tem negócio ganho; senão "Negócio" se tem um aberto; senão a do pedido mais avançado (Lead, Contacto ou Visita).
 * Sem negócio aberto nem pedidos (uma lead que só tem negócios terminados) fica em Contacto.
 */
export function etapaEfetiva({ papel, abertos, pedidos }: EntradaEtapa): EtapaPessoa {
  if (papel === "cliente") return "cliente";
  if (abertos.length > 0) return "qualificada";
  const pedido = pedidoMaisAvancado(pedidos);
  return pedido ? ETAPA_DO_PEDIDO[faseDoPedido(pedido)] : "emContacto";
}

/**
 * Lead: o próximo contacto (a chamada agendada ou a visita por fazer mais cedo, ver `proximoContactoDaPessoa`) é anterior a hoje.
 * Cliente: só com um negócio em curso (aberto) com o prazo anterior a hoje. Uma perdida nunca está atrasada.
 */
export function estaAtrasada({ pessoa, papel, abertos, pedidos }: EntradaEtapa, hoje: string): boolean {
  if (pessoa.perdida) return false;
  if (papel === "cliente") return abertos.some((n) => emAtraso(n, hoje));
  const dia = proximoContactoDaPessoa(pessoa, pedidos);
  return dia !== null && dia < hoje;
}

/**
 * Os passos da coluna "Próximo passo". Um id tem sempre o mesmo texto, e a divergência com o "A fazer" (`processo/tiposProcesso.ts`)
 * mantém-se de propósito: num negócio sem orçamentos a coluna diz "fazerLevantamento" e o "A fazer" "criarOrcamento" (o negócio já
 * existe). Num pedido com visitas por fazer a coluna diz "fecharLevantamento" (o texto é «Marcar a visita como feita») e o "A fazer"
 * "marcarVisitaFeita" (abre o painel de visita e levantamento do pedido, onde o levantamento é opcional); com uma visita feita, os dois
 * dizem "criarNegocio". Não há passo obrigatório de levantamento.
 * `passosProcesso.test.ts` ("coerência com a coluna") fixa estes casos com exatidão.
 */
export type IdPasso =
  | "registarChamada" | "marcarVisita" | "fecharLevantamento" | "criarNegocio" | "fazerLevantamento" | "escolherOrcamento"
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

const PASSO_DA_FASE: Record<FasePedido, IdPasso> = { porContactar: "registarChamada", contactado: "marcarVisita", visita: "fecharLevantamento" };

/** O passo de um pedido na coluna "Próximo passo": pela fase e, na fase Visita, por já haver uma visita feita (então, criar o negócio). */
export const passoDoPedidoNaColuna = (pedido: PedidoNegocio): IdPasso => (temVisitaFeita(pedido) ? "criarNegocio" : PASSO_DA_FASE[faseDoPedido(pedido)]);

/**
 * O próximo passo para a coluna da lista e para o Resumo. Uma perdida, ou quem não tem negócio aberto nem pedidos, não tem
 * nenhum ("—"). Com negócio aberto manda o mais avançado e o prazo é o dele; senão manda o pedido mais avançado e o prazo é o
 * próximo contacto da pessoa.
 */
export function proximoPasso(r: Pick<ResumoPessoa, "pessoa" | "papel" | "abertos" | "pedidos">): ProximoPasso {
  if (r.pessoa.perdida) return { id: "nenhum", prazo: null };
  const foco = negocioEmFoco(r.abertos);
  if (foco) return { id: passoDoNegocio(foco), prazo: foco.proximoPrazo };
  const pedido = pedidoMaisAvancado(r.pedidos);
  return pedido ? { id: passoDoPedidoNaColuna(pedido), prazo: proximoContactoDaPessoa(r.pessoa, r.pedidos) } : { id: "nenhum", prazo: null };
}

/** O índice (0 a 3) do passo em que uma lead está (o passo em que se perderia agora). */
export const passoAtual = (r: Pick<ResumoPessoa, "etapa">): number => Math.min(indiceEtapa(r.etapa), 3);

/** O índice (0 a 3) do passo em que a pessoa foi perdida; nas perdidas antigas, sem passo, o da etapa. */
export const passoDaPerdida = (r: Pick<ResumoPessoa, "pessoa" | "etapa">): number => r.pessoa.perdida?.passo ?? passoAtual(r);

/** Uma lead em curso cujos negócios estão todos perdidos: a ficha avisa e oferece "Marcar como perdida". */
export function todosNegociosPerdidos(r: Pick<ResumoPessoa, "pessoa" | "papel" | "negocios">): boolean {
  return r.papel === "lead" && !r.pessoa.perdida && r.negocios.length > 0 && r.negocios.every((n) => ehHistorico(n) && n.resultado === "perdido");
}
