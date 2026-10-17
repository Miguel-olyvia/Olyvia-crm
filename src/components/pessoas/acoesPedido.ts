// As ações dos pedidos, em memória: funções puras e imutáveis. O dia de hoje chega por parâmetro e nada lê o relógio. Um id que
// não existe, uma pessoa perdida ou dados inválidos devolvem o próprio estado. A visita e o levantamento são do pedido: nada
// aqui escreve em `Pessoa.proximoContacto` (as visitas contam-se a partir dos pedidos, ver `proximoContactoDaPessoa`).
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { ordenarVisitas, visitasParaGuardar } from "@/components/negocio-metas/visitasNegocio";
import { destinoInicial, moradaDaLead, resolverDestino, textoMoradaVisita } from "./moradaVisita";
import { faseDoPedido, pedidoNovo, proximoIdPedido, type DadosPedido } from "./pedidoNegocio";
import type { EstadoPessoas, ItemAtividade, PedidoNegocio, Pessoa } from "./pessoasTipos";
import { detalheDaVisita, validarVisita, type DadosAlterarVisita, type DadosVisita } from "./visitaPessoa";

/** A parte do estado que as ações dos pedidos mudam. */
export type EstadoPedidos = Pick<EstadoPessoas, "pessoas" | "pedidos" | "atividade" | "contactadas">;

/** O que se pede para marcar uma visita: o serviço é o do pedido; `detalhe` é o texto da atividade, quando quem marca já o tem escrito. */
export type DadosVisitaPedido = Pick<DadosVisita, "data" | "hora" | "nota" | "destino" | "detalhe">;

/** O que se guarda de um pedido: as visitas (a lista inteira), o levantamento (se houver) e o comercial escolhido no painel (se mudou). */
export interface DadosGuardarPedido {
  visitas: VisitaNegocio[];
  levantamento?: RascunhoLevantamento;
  /** O comercial do pedido; sem ele fica o que o pedido tinha. */
  comercial?: string;
}

const CHAVE_VISITA_FEITA = "pessoasPagina.process.activity.visitMarkedDone";
const CHAVE_LEVANTAMENTO = "pessoasPagina.process.activity.surveySaved";
const ID_VISITA = /-v(\d+)$/;

/** O pedido e a pessoa dele, quando a pessoa existe e não está perdida; senão `null`. */
function alvoDe(estado: EstadoPedidos, pedidoId: string): { pedido: PedidoNegocio; pessoa: Pessoa } | null {
  const pedido = estado.pedidos.find((p) => p.id === pedidoId);
  const pessoa = pedido && estado.pessoas.find((p) => p.id === pedido.pessoaId);
  return pedido && pessoa && !pessoa.perdida ? { pedido, pessoa } : null;
}

const trocar = (pedidos: readonly PedidoNegocio[], novo: PedidoNegocio): PedidoNegocio[] => pedidos.map((p) => (p.id === novo.id ? novo : p));

/** Falar com a pessoa: o último contacto é hoje e conta como contactada. */
const contactar = (estado: EstadoPedidos, pessoaId: string): Pick<EstadoPedidos, "pessoas" | "contactadas"> => ({
  pessoas: estado.pessoas.map((p) => (p.id === pessoaId ? { ...p, ultimoContactoDias: 0 } : p)),
  contactadas: estado.contactadas.includes(pessoaId) ? estado.contactadas : [...estado.contactadas, pessoaId],
});

/** Uma linha da atividade; `n` evita ids repetidos quando uma ação junta várias. */
const registo = (estado: EstadoPedidos, n: number, pessoaId: string, tipo: string, chaveTitulo: string, detalhe: string, hoje: string): ItemAtividade => ({
  id: `novo-${tipo}-${estado.atividade.length + n + 1}`, pessoaId, tipo: "historico", titulo: "", chaveTitulo, detalhe, quando: hoje, exemplo: false,
});

const idDaNovaVisita = (pedido: PedidoNegocio): string =>
  `${pedido.id}-v${pedido.visitas.reduce((m, v) => Math.max(m, Number(ID_VISITA.exec(v.id)?.[1] ?? 0)), 0) + 1}`;

/**
 * Marca uma visita ao pedido: a primeira é do tipo levantamento, as seguintes revisita (visitas canceladas não contam). A morada é
 * a da lead, salvo se `destino` disser outra; o pedido passa a contactado e a pessoa a contactada. Pedido que não existe, pessoa
 * perdida ou dados inválidos deixam o estado como está.
 */
export function marcarVisitaDoPedido<E extends EstadoPedidos>(estado: E, pedidoId: string, dados: DadosVisitaPedido, hoje: string): E {
  const alvo = alvoDe(estado, pedidoId);
  if (!alvo) return estado;
  const lead = moradaDaLead(alvo.pessoa);
  // Sem escolha, vale a morada da lead; se ela não tem nenhuma, falta a morada e não se marca (uma visita precisa de um sítio).
  const destino = dados.destino ?? destinoInicial(lead);
  if (validarVisita({ ...dados, destino }, hoje, lead)) return estado;
  const onde = resolverDestino(destino, lead);
  const { pedido } = alvo;
  const visita: VisitaNegocio = {
    id: idDaNovaVisita(pedido), data: dados.data, hora: dados.hora, feitoPor: pedido.comercial, estado: "porFazer",
    tipo: pedido.visitas.some((v) => v.estado !== "cancelada") ? "revisita" : "levantamento", quemVaiEstar: "", duracao: "",
    morada: { ...onde.moradaVisita }, igualALead: onde.igualALead, nota: onde.notaAcesso ?? "",
  };
  const detalhe = dados.detalhe ?? detalheDaVisita({ ...dados, servico: pedido.servico }, textoMoradaVisita(onde.moradaVisita));
  const item = registo(estado, 0, pedido.pessoaId, "visita", "pessoasPagina.activity.visitBooked", detalhe, hoje);
  return {
    ...estado, ...contactar(estado, pedido.pessoaId),
    pedidos: trocar(estado.pedidos, { ...pedido, contactado: true, visitas: ordenarVisitas([...pedido.visitas, visita]) }),
    atividade: [item, ...estado.atividade],
  };
}

/** Onde vai a visita de uma pessoa: o pedido indicado (que tem de ser dela) ou, sem ele, o do primeiro pedido ainda sem visita. */
export interface EscolhaPedido {
  pedidoId?: string;
  /** O serviço do pedido que se cria quando a pessoa não tem nenhum sem visita. */
  servico?: string;
}

/**
 * Marca uma visita a uma pessoa, sem saber de que pedido: usa o indicado (de outra pessoa não vale), senão o primeiro pedido ainda
 * sem visita, senão cria um pedido novo (sem serviço, salvo o que se indicar) e marca nele. Se a visita não se pode marcar, nem o
 * pedido se cria: o estado fica como está.
 */
export function marcarVisitaDaPessoa<E extends EstadoPedidos>(
  estado: E, pessoaId: string, escolha: EscolhaPedido, dados: DadosVisitaPedido, hoje: string,
): E {
  const pessoa = estado.pessoas.find((p) => p.id === pessoaId);
  if (!pessoa || pessoa.perdida) return estado;
  if (escolha.pedidoId !== undefined) {
    return estado.pedidos.some((p) => p.id === escolha.pedidoId && p.pessoaId === pessoaId)
      ? marcarVisitaDoPedido(estado, escolha.pedidoId, dados, hoje) : estado;
  }
  const candidato = estado.pedidos.find((p) => p.pessoaId === pessoaId && faseDoPedido(p) !== "visita");
  if (candidato) return marcarVisitaDoPedido(estado, candidato.id, dados, hoje);
  const criado = criarPedido(estado, { pessoaId, servico: escolha.servico ?? "", comercial: pessoa.comercial }, hoje);
  const marcado = marcarVisitaDoPedido(criado, criado.pedidos[criado.pedidos.length - 1].id, dados, hoje);
  return marcado === criado ? estado : marcado;
}

/**
 * Altera o dia, a hora e a morada de uma visita do pedido (feita ou por fazer): a nota de acesso passa a ser a nota da visita e a
 * atividade regista-o. Visita ou pedido que não existe, pessoa perdida ou dados inválidos deixam o estado como está.
 */
export function alterarVisitaDoPedido<E extends EstadoPedidos>(
  estado: E, pedidoId: string, visitaId: string, dados: DadosAlterarVisita, hoje: string,
): E {
  const alvo = alvoDe(estado, pedidoId);
  if (!alvo || !alvo.pedido.visitas.some((v) => v.id === visitaId)) return estado;
  const lead = moradaDaLead(alvo.pessoa);
  if (validarVisita({ ...dados, nota: "" }, hoje, lead)) return estado;
  const onde = resolverDestino(dados.destino, lead);
  const visitas = alvo.pedido.visitas.map((v) => (v.id !== visitaId ? v : {
    ...v, data: dados.data, hora: dados.hora, morada: { ...onde.moradaVisita }, igualALead: onde.igualALead, nota: onde.notaAcesso ?? "",
  }));
  const detalhe = [dados.hora ? `${dados.data} ${dados.hora}` : dados.data, textoMoradaVisita(onde.moradaVisita)].filter(Boolean).join(" · ");
  const item = registo(estado, 0, alvo.pedido.pessoaId, "visita-alterada", "pessoasPagina.activity.visitChanged", detalhe, hoje);
  return { ...estado, pedidos: trocar(estado.pedidos, { ...alvo.pedido, visitas: ordenarVisitas(visitas) }), atividade: [item, ...estado.atividade] };
}

/**
 * Guarda as visitas e o levantamento do pedido (por ordem cronológica e com as notas aparadas; sem levantamento novo, fica o que
 * já havia; o comercial do painel passa a ser o do pedido). O levantamento é opcional: uma visita feita guarda-se com ou sem linhas de medidas. Cada visita que passa a feita
 * regista "Visita feita" na atividade e conta como contacto; um levantamento com linhas, diferente do anterior, regista-se também.
 */
export function guardarPedido<E extends EstadoPedidos>(estado: E, pedidoId: string, dados: DadosGuardarPedido, hoje: string): E {
  const alvo = alvoDe(estado, pedidoId);
  if (!alvo) return estado;
  const { pedido } = alvo;
  const levantamento = dados.levantamento ?? pedido.levantamento;
  const passouAFeita = dados.visitas.filter((v) => v.estado === "feita" && pedido.visitas.find((a) => a.id === v.id)?.estado !== "feita");
  const novoLevantamento = !!dados.levantamento?.linhas.length && JSON.stringify(dados.levantamento) !== JSON.stringify(pedido.levantamento);
  const itens = [
    ...(novoLevantamento ? [registo(estado, 0, pedido.pessoaId, "levantamento", CHAVE_LEVANTAMENTO, "", hoje)] : []),
    ...passouAFeita.map((v, i) => registo(estado, i + 1, pedido.pessoaId, "visita-feita", CHAVE_VISITA_FEITA, [v.data, v.hora].filter(Boolean).join(" "), hoje)),
  ];
  const guardado: PedidoNegocio = {
    ...pedido, comercial: dados.comercial ?? pedido.comercial, contactado: pedido.contactado || dados.visitas.length > 0,
    visitas: visitasParaGuardar(dados.visitas),
    ...(levantamento ? { levantamento } : {}),
  };
  return {
    ...estado, ...(passouAFeita.length > 0 ? contactar(estado, pedido.pessoaId) : {}),
    pedidos: trocar(estado.pedidos, guardado), atividade: [...itens, ...estado.atividade],
  };
}

/** Cria um pedido por contactar para a pessoa (que tem de existir e não estar perdida), com o id seguinte (`pd-<n>`). */
export function criarPedido<E extends EstadoPedidos>(estado: E, dados: DadosPedido, hoje: string): E {
  const pessoa = estado.pessoas.find((p) => p.id === dados.pessoaId);
  if (!pessoa || pessoa.perdida) return estado;
  const pedido = pedidoNovo({ ...dados, servico: dados.servico.trim() }, hoje, proximoIdPedido(estado.pedidos));
  return { ...estado, pedidos: [...estado.pedidos, pedido] };
}

/**
 * Cria um pedido para a pessoa e guarda-lhe de seguida as visitas e o levantamento (o "Novo negócio com visita" de um cliente).
 * Se o pedido não se pode criar (pessoa que não existe ou perdida), nada fica criado.
 */
export function criarPedidoGuardado<E extends EstadoPedidos>(estado: E, dados: DadosPedido, guardar: DadosGuardarPedido, hoje: string): E {
  const criado = criarPedido(estado, dados, hoje);
  if (criado === estado) return estado;
  const guardado = guardarPedido(criado, criado.pedidos[criado.pedidos.length - 1].id, guardar, hoje);
  return guardado === criado ? estado : guardado;
}

/** Tira o pedido; um id que não existe deixa o estado como está. */
export function removerPedido<E extends Pick<EstadoPessoas, "pedidos">>(estado: E, pedidoId: string): E {
  return estado.pedidos.some((p) => p.id === pedidoId) ? { ...estado, pedidos: estado.pedidos.filter((p) => p.id !== pedidoId) } : estado;
}

/** Uma chamada fala de tudo o que a pessoa pediu: os pedidos por contactar dela passam a contactados (os outros ficam como estão). */
export function marcarContactados<E extends Pick<EstadoPessoas, "pedidos">>(estado: E, pessoaId: string): E {
  const pedidos = estado.pedidos.map((p) => (p.pessoaId === pessoaId && faseDoPedido(p) === "porContactar" ? { ...p, contactado: true } : p));
  return pedidos.some((p, i) => p !== estado.pedidos[i]) ? { ...estado, pedidos } : estado;
}
