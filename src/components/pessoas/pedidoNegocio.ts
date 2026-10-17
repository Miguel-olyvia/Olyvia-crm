// Os pedidos de uma pessoa, em funções puras: a fase deriva dos dados (nunca se guarda), a próxima visita e o prazo, e o
// próximo contacto da pessoa. Uma pessoa pode ter vários pedidos em paralelo, cada um com as suas visitas, ou nenhuma.
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import { proximaVisitaDoNegocio } from "@/components/negocio-metas/visitasNegocio";
import { textoDiaCompleto } from "./formatoPessoas";
import type { FasePedido, PedidoNegocio, Pessoa } from "./pessoasTipos";

/** O que se pede para criar um pedido. */
export interface DadosPedido {
  pessoaId: string;
  servico: string;
  comercial: string;
}

const ID_PEDIDO = /^pd-(\d+)$/;

/**
 * Por contactar (sem chamada), contactado (houve chamada) ou visita (há pelo menos uma visita que não foi cancelada, por
 * fazer ou feita). Visitas só canceladas contam como se não houvesse nenhuma.
 */
export function faseDoPedido(pedido: PedidoNegocio): FasePedido {
  if (pedido.visitas.some((v) => v.estado !== "cancelada")) return "visita";
  return pedido.contactado ? "contactado" : "porContactar";
}

/** A primeira visita por fazer, por ordem cronológica; `undefined` sem nenhuma (as feitas e as canceladas não contam). */
export const proximaVisitaDoPedido = (pedido: PedidoNegocio): VisitaNegocio | undefined => proximaVisitaDoNegocio(pedido.visitas);

/** O dia (AAAA-MM-DD) da próxima visita por fazer; `null` sem visita, ou com a visita sem data. */
export const prazoDoPedido = (pedido: PedidoNegocio): string | null => proximaVisitaDoPedido(pedido)?.data || null;

/**
 * O próximo contacto da pessoa: o mais cedo entre a chamada agendada (`Pessoa.proximoContacto`, que só guarda chamadas) e as
 * visitas por fazer dos pedidos dela; `null` sem nenhum.
 */
export function proximoContactoDaPessoa(pessoa: Pick<Pessoa, "id" | "proximoContacto">, pedidos: readonly PedidoNegocio[]): string | null {
  const dias = [pessoa.proximoContacto, ...pedidos.filter((p) => p.pessoaId === pessoa.id).map(prazoDoPedido)]
    .filter((d): d is string => typeof d === "string" && d !== "");
  return dias.length === 0 ? null : dias.reduce((cedo, d) => (d < cedo ? d : cedo));
}

/**
 * O próximo contacto da pessoa vem de uma visita por fazer (e não de uma chamada agendada): há uma visita no dia mais cedo, que
 * pode ser também o dia da chamada. É o caso em que "Adiar" não tem nada a mover (as visitas têm o seu ecrã, «Alterar visita»).
 */
export function proximoContactoVemDeVisita(pessoa: Pick<Pessoa, "id" | "proximoContacto">, pedidos: readonly PedidoNegocio[]): boolean {
  const dia = proximoContactoDaPessoa(pessoa, pedidos);
  return dia !== null && pedidos.some((p) => p.pessoaId === pessoa.id && prazoDoPedido(p) === dia);
}

/**
 * A hora do próximo contacto da pessoa: a da chamada agendada, se é ela o dia mais cedo, ou a da primeira visita por fazer desse dia;
 * `undefined` sem hora, ou sem próximo contacto.
 */
export function horaDoProximoContacto(pessoa: Pick<Pessoa, "id" | "proximoContacto" | "proximoHora">, pedidos: readonly PedidoNegocio[]): string | undefined {
  const dia = proximoContactoDaPessoa(pessoa, pedidos);
  if (dia === null) return undefined;
  if (pessoa.proximoContacto === dia && pessoa.proximoHora) return pessoa.proximoHora;
  const daVisita = pedidos.filter((p) => p.pessoaId === pessoa.id).map(proximaVisitaDoPedido).find((v) => v?.data === dia && v.hora !== "");
  return daVisita?.hora;
}

/** O id seguinte na numeração `pd-<n>`; ids de outro formato não contam. */
export function proximoIdPedido(pedidos: readonly PedidoNegocio[]): string {
  const maior = pedidos.reduce((m, p) => Math.max(m, Number(ID_PEDIDO.exec(p.id)?.[1] ?? 0)), 0);
  return `pd-${maior + 1}`;
}

/**
 * O que identifica um pedido ao utilizador: o serviço (ou, sem ele, o dia em que foi criado) e, entre os que ficariam com o mesmo
 * nome, a posição (`posicao` de `total`; `total` é 1 quando o nome já é único). Guarda-se nos cartões e nos itens do processo, que
 * não têm `t` à mão: o texto faz-se com `textoDoRotulo`.
 */
export interface RotuloPedido {
  servico: string;
  criadoEm: string;
  posicao: number;
  total: number;
}

/** O nome-base de um pedido para decidir repetidos: o serviço, ou o dia de criação. */
const chaveDoNome = (p: Pick<PedidoNegocio, "servico" | "criadoEm">): string => (p.servico.trim() ? `s:${p.servico.trim()}` : `d:${p.criadoEm}`);

/** O rótulo de um pedido entre os pedidos `todos` da mesma pessoa (a posição conta só os que têm o mesmo nome-base, pela ordem da lista). */
export function rotuloDoPedido(pedido: PedidoNegocio, todos: readonly PedidoNegocio[]): RotuloPedido {
  const iguais = todos.filter((p) => chaveDoNome(p) === chaveDoNome(pedido));
  const indice = iguais.findIndex((p) => p.id === pedido.id);
  return {
    servico: pedido.servico.trim(), criadoEm: pedido.criadoEm, posicao: indice < 0 ? 1 : indice + 1, total: indice < 0 ? 1 : iguais.length,
  };
}

/** O texto de um rótulo: «Cozinha», «Pedido de 05/10/2026» e, se ainda houver repetidos, «Pedido de 05/10/2026 (1 de 2)». */
export function textoDoRotulo(t: Traduzir, r: RotuloPedido): string {
  const nome = r.servico || t("pessoasPagina.process.requestName.date", { date: textoDiaCompleto(r.criadoEm) });
  return r.total > 1 ? t("pessoasPagina.process.requestName.ofTotal", { name: nome, n: r.posicao, total: r.total }) : nome;
}

/** O nome de um pedido, igual em todo o lado (cabeçalhos, botões, diálogos, avisos): ver `rotuloDoPedido` e `textoDoRotulo`. */
export const nomeDoPedido = (t: Traduzir, pedido: PedidoNegocio, todos: readonly PedidoNegocio[]): string =>
  textoDoRotulo(t, rotuloDoPedido(pedido, todos));

/** «Ana · Cozinha»: o nome da pessoa e o do pedido, para os títulos e descrições dos diálogos; sem pedido, só o nome da pessoa. */
export function nomeComPedido(t: Traduzir, nome: string, pedidoId: string | undefined, pedidos: readonly PedidoNegocio[]): string {
  const pedido = pedidoId === undefined ? undefined : pedidos.find((p) => p.id === pedidoId);
  return pedido ? `${nome} · ${nomeDoPedido(t, pedido, pedidos)}` : nome;
}

/** Um pedido novo: por contactar, sem visitas nem levantamento. */
export const pedidoNovo = (dados: DadosPedido, hoje: string, id: string): PedidoNegocio => ({
  id, pessoaId: dados.pessoaId, servico: dados.servico, comercial: dados.comercial, criadoEm: hoje, contactado: false, visitas: [],
});
