/**
 * Ligar, alterar e desligar uma pessoa: funções puras sobre o estado (devolvem um estado novo ou o erro, nunca mutam).
 * Validam que a filial é da empresa escolhida e que o centro existe; o centro NÃO tem de ser da filial do vínculo.
 */
import { centroPrincipalDaFilial } from "@/components/rh-exemplo/organizacao/arvore";
import {
  MOTIVO_MINIMO,
  type DestinoLigacao,
  type ErroLigacao,
  type EstadoOrganizacao,
  type EstruturaOrg,
  type EventoLigacao,
  type Ligacao,
  type PedidoLigacao,
  type Resultado,
  type TipoEvento,
} from "@/components/rh-exemplo/organizacao/tipos";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const falha = (erro: ErroLigacao): Resultado => ({ ok: false, erro });

/** Resolve o centro («mesmo da filial» quando `centroId` é nulo) e valida a coerência do destino. */
export function resolverDestino(
  est: EstruturaOrg,
  p: Pick<PedidoLigacao, "empresaId" | "filialId" | "centroId">,
): { destino: DestinoLigacao } | { erro: ErroLigacao } {
  if (!est.empresas.some((e) => e.id === p.empresaId)) return { erro: "empresaInvalida" };
  const filial = est.filiais.find((f) => f.id === p.filialId);
  if (!filial) return { erro: "filialInvalida" };
  if (filial.empresaId !== p.empresaId) return { erro: "filialForaDaEmpresa" };
  const centroId = p.centroId ?? centroPrincipalDaFilial(est, filial.id)?.id ?? null;
  if (centroId === null || !est.centros.some((c) => c.id === centroId)) return { erro: "centroInexistente" };
  return { destino: { empresaId: p.empresaId, filialId: p.filialId, centroId } };
}

function comEvento(estado: EstadoOrganizacao, ligacoes: Ligacao[], e: Omit<EventoLigacao, "id">): EstadoOrganizacao {
  const evento: EventoLigacao = { ...e, id: `ev-org-${estado.historico.length + 1}` };
  return { ligacoes, historico: [...estado.historico, evento] };
}

const destinoDe = (l: Ligacao): DestinoLigacao => ({ empresaId: l.empresaId, filialId: l.filialId, centroId: l.centroId });

function guardar(estado: EstadoOrganizacao, est: EstruturaOrg, p: PedidoLigacao, tipo: TipoEvento): Resultado {
  if (!p.pessoaId) return falha("pessoaEmFalta");
  if (!DATA_ISO.test(p.desde)) return falha("dataInvalida");
  const atual = estado.ligacoes.find((l) => l.pessoaId === p.pessoaId);
  if (tipo === "ligar" && atual) return falha("jaLigada");
  if (tipo === "alterar" && !atual) return falha("naoLigada");
  const r = resolverDestino(est, p);
  if ("erro" in r) return falha(r.erro);
  const nova: Ligacao = { pessoaId: p.pessoaId, desde: p.desde, ...r.destino };
  const outras = estado.ligacoes.filter((l) => l.pessoaId !== p.pessoaId);
  const evento = { pessoaId: p.pessoaId, data: p.desde, tipo, de: atual ? destinoDe(atual) : null, para: r.destino, motivo: p.motivo.trim() };
  return { ok: true, estado: comEvento(estado, [...outras, nova], evento) };
}

export const ligar = (estado: EstadoOrganizacao, est: EstruturaOrg, p: PedidoLigacao): Resultado => guardar(estado, est, p, "ligar");

export const alterar = (estado: EstadoOrganizacao, est: EstruturaOrg, p: PedidoLigacao): Resultado => guardar(estado, est, p, "alterar");

/** Termina a ligação da pessoa; o motivo (≥3 caracteres, sem contar espaços nas pontas) é obrigatório. */
export function desligar(estado: EstadoOrganizacao, pessoaId: string, motivo: string, data: string): Resultado {
  const atual = estado.ligacoes.find((l) => l.pessoaId === pessoaId);
  if (!atual) return falha("naoLigada");
  if (motivo.trim().length < MOTIVO_MINIMO) return falha("motivoCurto");
  const restantes = estado.ligacoes.filter((l) => l.pessoaId !== pessoaId);
  const evento = { pessoaId, data, tipo: "desligar" as const, de: destinoDe(atual), para: null, motivo: motivo.trim() };
  return { ok: true, estado: comEvento(estado, restantes, evento) };
}
