// DADOS DE EXEMPLO da ficha da pessoa (empresa, morada, NIF, qualificação, próximo contacto, atividade). Nada disto
// existe noutro sítio nem vem da base. Os dias são relativos a HOJE_EXEMPLO, para a ficha não envelhecer.
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { somarDias } from "./acoesPessoa";
import { origemExemplo } from "./pessoasExemploOrigem";
import type { VisitaSemente } from "./pessoaSemente";
import type {
  ItemAtividade, MotivoPerda, Pessoa, QualificacaoPessoa, ResultadoContacto,
} from "./pessoasTipos";

type Extra = Partial<Pick<Pessoa,
  "empresa" | "morada" | "distrito" | "nif" | "qualificacao" | "resultadoContacto" | "proximoContacto" | "desde" | "perdida" |
  "canal" | "campanha" | "formulario" | "viaEntrada" | "saude">> & { visita?: VisitaSemente };

interface Dados {
  /** `null`: nunca houve uma chamada ("Sem contacto"). */
  resultado: ResultadoContacto | null;
  /** Dias de hoje até ao próximo contacto (negativo: em atraso); `null` sem próximo contacto. */
  proximo: number | null;
  desde: string;
  morada: [linha: string, cp: string, localidade: string];
  distrito: string;
  nif?: string;
  qualificacao?: QualificacaoPessoa;
  empresa?: { nome: string; contacto: string; nif: string };
  /** Perdida há `dias` dias, no passo `passo` do percurso (0 a 3). */
  perdida?: { motivo: MotivoPerda; dias: number; passo: number };
  /**
   * A visita marcada (o dia é o do próximo contacto): `outra` é a morada da visita quando não é a da lead, e sem ela a visita
   * é na morada da lead. Com o dia já passado, fica por concluir.
   */
  visita?: { hora: string; comercial: string; outra?: [rua: string, cp: string, localidade: string, andar: string]; acesso?: string };
}

const DADOS: Record<string, Dados> = {
  "p-marta": { resultado: "atendeuInteressado", proximo: 4, desde: "2024-03-12", morada: ["Rua das Flores 24, 2.º Esq.", "4050-262", "Porto"], distrito: "Porto", nif: "201 234 567" },
  "p-rui": { resultado: "atendeuMaisTarde", proximo: 1, desde: "2025-01-20", morada: ["Av. da República 118", "1050-197", "Lisboa"], distrito: "Lisboa", nif: "202 345 678" },
  "p-helena": {
    resultado: "atendeuInteressado", proximo: 7, desde: "2023-09-05", morada: ["Rua do Alecrim 7", "3000-300", "Coimbra"], distrito: "Coimbra",
    nif: "203 456 789", empresa: { nome: "Tavares & Associados, Lda.", contacto: "Helena Tavares (gerente)", nif: "513 456 789" },
  },
  "p-paulo": {
    resultado: "atendeuInteressado", proximo: 2, desde: "2025-06-02", morada: ["Rua do Souto 51", "4700-329", "Braga"], distrito: "Braga",
    nif: "204 567 890", empresa: { nome: "Neves Climatização, Lda.", contacto: "Paulo Neves (sócio)", nif: "514 567 890" },
    visita: { hora: "10:30", comercial: "Bruno Costa", outra: ["Zona Industrial, Lote 7", "4700-500", "Braga", "Armazém 2"], acesso: "Tocar à campainha da portaria." },
  },
  "p-sofia": { resultado: "naoAtendeu", proximo: -2, desde: "2024-11-18", morada: ["Rua Nova 3", "8000-123", "Faro"], distrito: "Faro", nif: "205 678 901" },
  "p-nuno": { resultado: "atendeuInteressado", proximo: 5, desde: "2026-05-14", morada: ["Rua da Fonte 15", "2900-210", "Setúbal"], distrito: "Setúbal", qualificacao: "SQL" },
  "p-ines": { resultado: "atendeuMaisTarde", proximo: -10, desde: "2022-02-08", morada: ["Rua do Mar 90", "2900-100", "Setúbal"], distrito: "Setúbal", nif: "206 789 012" },
  "p-tiago": {
    resultado: "naoAtendeu", proximo: -3, desde: "2026-07-01", morada: ["Rua dos Pinhais 8", "2400-123", "Leiria"], distrito: "Leiria",
    qualificacao: "MQL", empresa: { nome: "Ribeiro Obras, Lda.", contacto: "Tiago Ribeiro (gerente)", nif: "515 678 901" },
  },
  "p-clara": { resultado: "atendeuInteressado", proximo: 0, desde: "2026-09-20", morada: ["Rua da Pêra 41", "3800-100", "Aveiro"], distrito: "Aveiro", qualificacao: "SQL" },
  "p-vasco": { resultado: "atendeuMaisTarde", proximo: 3, desde: "2026-08-11", morada: ["Rua do Castelo 2", "3500-120", "Viseu"], distrito: "Viseu", qualificacao: "MQL" },
  "p-beatriz": { resultado: null, proximo: 1, desde: "2026-10-11", morada: ["Rua Direita 66", "3510-050", "Viseu"], distrito: "Viseu" },
  "p-hugo": { resultado: null, proximo: 2, desde: "2026-10-12", morada: ["Largo da Sé 5", "4700-010", "Braga"], distrito: "Braga" },
  "p-lucia": { resultado: "naoAtendeu", proximo: -5, desde: "2026-09-22", morada: ["Rua de Avis 30", "7000-100", "Évora"], distrito: "Évora" },
  "p-rita": {
    resultado: "atendeuInteressado", proximo: 0, desde: "2026-10-01", morada: ["Rua dos Combatentes 12", "2710-100", "Sintra"], distrito: "Lisboa",
    qualificacao: "SQL", visita: { hora: "15:00", comercial: "Ana Ribeiro" },
  },
  "p-goncalo": {
    resultado: "atendeuMaisTarde", proximo: -1, desde: "2026-10-07", morada: ["Av. do Mar 220", "2750-300", "Cascais"], distrito: "Lisboa",
    qualificacao: "MQL", empresa: { nome: "Matias Construções, Lda.", contacto: "Gonçalo Matias (sócio)", nif: "516 789 012" },
    visita: { hora: "11:00", comercial: "Bruno Costa", outra: ["Rua das Oliveiras 14", "2750-100", "Cascais", "Moradia"] },
  },
  "p-joana": {
    resultado: "naoAtendeu", proximo: null, desde: "2026-09-18", morada: ["Rua do Giestal 4", "2000-250", "Santarém"], distrito: "Santarém",
    perdida: { motivo: "semResposta", dias: 8, passo: 1 },
  },
  "p-fabio": {
    resultado: "semInteresse", proximo: null, desde: "2026-07-20", morada: ["Rua da Olaria 19", "2300-400", "Tomar"], distrito: "Santarém",
    perdida: { motivo: "preco", dias: 20, passo: 3 },
  },
};

/** A visita de exemplo: no dia do próximo contacto, na morada da lead ou na outra que os dados indicam. */
function visitaDeExemplo(d: Dados): VisitaSemente | undefined {
  if (!d.visita || d.proximo === null) return undefined;
  const [rua, codigoPostal, localidade, andar] = d.visita.outra ?? [...d.morada, ""];
  return {
    data: somarDias(HOJE_EXEMPLO, d.proximo), hora: d.visita.hora, comercial: d.visita.comercial, igualALead: d.visita.outra === undefined,
    moradaVisita: { rua, codigoPostal, localidade, andar },
    ...(d.visita.acesso ? { notaAcesso: d.visita.acesso } : {}),
  };
}

/** Os campos de exemplo da ficha de uma pessoa (vazio se o id não tem dados). */
export function extrasExemplo(id: string): Extra {
  const d = DADOS[id];
  if (!d) return {};
  return {
    resultadoContacto: d.resultado ?? undefined,
    proximoContacto: d.proximo === null ? null : somarDias(HOJE_EXEMPLO, d.proximo),
    desde: d.desde,
    morada: { linha: d.morada[0], cp: d.morada[1], localidade: d.morada[2] },
    distrito: d.distrito,
    nif: d.nif,
    qualificacao: d.qualificacao,
    empresa: d.empresa,
    perdida: d.perdida && { motivo: d.perdida.motivo, data: somarDias(HOJE_EXEMPLO, -d.perdida.dias), passo: d.perdida.passo },
    visita: visitaDeExemplo(d),
    ...origemExemplo(id),
  };
}

/** A atividade de exemplo de uma pessoa: a última chamada (se houve), um email (se já passaram dias) e o registo da ficha. */
function atividadeDe(p: Pessoa): ItemAtividade[] {
  const ultimo = somarDias(HOJE_EXEMPLO, -p.ultimoContactoDias);
  const base = { pessoaId: p.id, exemplo: true };
  const itens: ItemAtividade[] = [
    {
      ...base, id: `${p.id}-a3`, tipo: "historico", quando: p.desde ?? ultimo, hora: "09:00",
      titulo: "", chaveTitulo: "pessoasPagina.seed.created", detalhe: "", chaveDetalhe: `pessoasPagina.origin.${p.origem}`,
    },
  ];
  if (p.resultadoContacto) {
    itens.push({
      ...base, id: `${p.id}-a1`, tipo: "chamada", quando: ultimo, hora: "10:30",
      titulo: "", chaveTitulo: `pessoasPagina.result.${p.resultadoContacto}`, detalhe: "", chaveDetalhe: "pessoasPagina.seed.callNote",
    });
  }
  if (p.ultimoContactoDias >= 3) {
    itens.push({
      ...base, id: `${p.id}-a2`, tipo: "email", quando: somarDias(ultimo, -2), hora: "15:10",
      titulo: "", chaveTitulo: "pessoasPagina.seed.emailSent", detalhe: "", chaveDetalhe: "pessoasPagina.seed.emailDetail",
    });
  }
  return itens;
}

/** A atividade de exemplo de todas as pessoas, por ordem de pessoa. */
export const atividadeExemplo = (pessoas: readonly Pessoa[]): ItemAtividade[] => pessoas.flatMap(atividadeDe);
