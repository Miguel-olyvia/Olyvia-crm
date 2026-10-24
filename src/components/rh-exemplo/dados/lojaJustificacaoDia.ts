/**
 * O store em memória das justificações de dias com falta sugerida ou atraso (a pessoa justifica, o RH decide) e dos
 * acessos ao texto sensível. À parte dos outros: `lojaFluxosB` guarda as justificações de picagem esquecida. Recarregar
 * repõe tudo; `reporJustificacaoDia()` serve os testes.
 */
import { useSyncExternalStore } from "react";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

export interface AcessoTextoJustificacao {
  justificacaoId: string;
  quem: string;
  quando: string;
}

export interface EstadoJustificacaoDia {
  justificacoes: JustificacaoDia[];
  acessos: AcessoTextoJustificacao[];
}

const SEM_DECISAO = { decididaPor: null, decididaEm: null, motivoRecusa: null, faltaId: null, mesFechado: false } as const;

/**
 * Três dias de outras pessoas, um em cada estado (os dias vêm de `assiduidadePlano.ts`):
 * a Inês espera decisão (aparece na fila), o André foi aceite e pago, a Beatriz foi recusada e ainda tem prazo.
 */
export function justificacoesIniciais(): JustificacaoDia[] {
  const marta = lerEstado().fichas["p-marta"]?.pessoa.nome_completo ?? "RH";
  return [
    {
      id: "jd-ines", origem: "sugestao", pessoaId: "p-ines", data: "2026-10-07", tipo: "transporte",
      motivo: "O autocarro avariou a meio do caminho e só cheguei 15 minutos depois da hora.",
      horaReal: "09:15", anexos: [], minutos: 15, periodoInicio: "09:00", periodoFim: "09:15", deAtraso: true,
      enviadaEm: `${diaIso(-2)}T10:15:00.000Z`, estado: "pendente", ...SEM_DECISAO,
    },
    {
      id: "jd-andre", origem: "sugestao", pessoaId: "p-andre", data: "2026-10-06", tipo: "consulta_medica",
      motivo: "Consulta de rotina no centro de saúde, marcada há meses. Cheguei ao armazém às 09:14.",
      horaReal: "09:14", anexos: ["comprovativo-consulta.pdf"], minutos: 14, periodoInicio: "09:00", periodoFim: "09:14", deAtraso: true,
      enviadaEm: `${diaIso(-7)}T10:00:00.000Z`, estado: "aceite_paga",
      decididaPor: marta, decididaEm: `${diaIso(-6)}T09:00:00.000Z`, motivoRecusa: null, faltaId: "fa-andre-justificada", mesFechado: false,
    },
    {
      id: "jd-beatriz", origem: "sugestao", pessoaId: "p-beatriz", data: "2026-10-09", tipo: "transporte",
      motivo: "Houve greve no metro e cheguei mais tarde.",
      horaReal: "09:12", anexos: [], minutos: 12, periodoInicio: "09:00", periodoFim: "09:12", deAtraso: true,
      enviadaEm: `${diaIso(-4)}T09:40:00.000Z`, estado: "recusada",
      decididaPor: marta, decididaEm: `${diaIso(-3)}T11:00:00.000Z`,
      motivoRecusa: "Sem comprovativo da greve. Volta a enviar com o aviso da transportadora.", faltaId: null, mesFechado: false,
    },
  ];
}

export function criarJustificacaoDiaInicial(): EstadoJustificacaoDia {
  return { justificacoes: justificacoesIniciais(), acessos: [] };
}

let estado: EstadoJustificacaoDia = criarJustificacaoDiaInicial();
let contador = 0;
const ouvintes = new Set<() => void>();

export const lerJustificacaoDia = (): EstadoJustificacaoDia => estado;

export function subscreverJustificacaoDia(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Substitui o estado por uma cópia alterada (nunca se muta o estado actual). */
export function definirJustificacaoDia(alterar: (actual: EstadoJustificacaoDia) => EstadoJustificacaoDia): void {
  estado = alterar(estado);
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function reporJustificacaoDia(): void {
  estado = criarJustificacaoDiaInicial();
  contador = 0;
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function novoIdJustificacaoDia(): string {
  contador += 1;
  return `jd-b${contador}`;
}

/** Lê uma fatia do estado. O selector tem de devolver sempre a mesma referência se nada mudou. */
export function useJustificacaoDia<T>(selector: (e: EstadoJustificacaoDia) => T): T {
  return useSyncExternalStore(subscreverJustificacaoDia, () => selector(estado), () => selector(estado));
}
