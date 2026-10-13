// DADOS DE EXEMPLO da ficha da pessoa (empresa, morada, NIF, qualificação, próximo contacto, atividade). Nada disto
// existe noutro sítio nem vem da base. Os dias são relativos a HOJE_EXEMPLO, para a ficha não envelhecer.
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { somarDias } from "./acoesPessoa";
import type { ItemAtividade, Pessoa, QualificacaoPessoa, ResultadoContacto } from "./pessoasTipos";

type Extra = Pick<Pessoa, "empresa" | "morada" | "distrito" | "nif" | "qualificacao" | "resultadoContacto" | "proximoContacto" | "desde">;

interface Dados {
  resultado: ResultadoContacto;
  /** Dias de hoje até ao próximo contacto (negativo: em atraso); `null` sem próximo contacto. */
  proximo: number | null;
  desde: string;
  morada: [linha: string, cp: string, localidade: string];
  distrito: string;
  nif?: string;
  qualificacao?: QualificacaoPessoa;
  empresa?: { nome: string; contacto: string; nif: string };
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
  "p-beatriz": { resultado: "naoAtendeu", proximo: 1, desde: "2026-10-11", morada: ["Rua Direita 66", "3510-050", "Viseu"], distrito: "Viseu" },
  "p-hugo": { resultado: "atendeuInteressado", proximo: 2, desde: "2026-10-12", morada: ["Largo da Sé 5", "4700-010", "Braga"], distrito: "Braga" },
  "p-lucia": { resultado: "naoAtendeu", proximo: -5, desde: "2026-09-22", morada: ["Rua de Avis 30", "7000-100", "Évora"], distrito: "Évora" },
};

/** Os campos de exemplo da ficha de uma pessoa (vazio se o id não tem dados). */
export function extrasExemplo(id: string): Extra | Record<string, never> {
  const d = DADOS[id];
  if (!d) return {};
  return {
    resultadoContacto: d.resultado,
    proximoContacto: d.proximo === null ? null : somarDias(HOJE_EXEMPLO, d.proximo),
    desde: d.desde,
    morada: { linha: d.morada[0], cp: d.morada[1], localidade: d.morada[2] },
    distrito: d.distrito,
    nif: d.nif,
    qualificacao: d.qualificacao,
    empresa: d.empresa,
  };
}

/** A atividade de exemplo de uma pessoa: a última chamada, um email (se já passaram dias) e o registo da ficha. */
function atividadeDe(p: Pessoa): ItemAtividade[] {
  const ultimo = somarDias(HOJE_EXEMPLO, -p.ultimoContactoDias);
  const base = { pessoaId: p.id, exemplo: true };
  const itens: ItemAtividade[] = [
    {
      ...base, id: `${p.id}-a1`, tipo: "chamada", quando: ultimo,
      titulo: "", chaveTitulo: `pessoasPagina.result.${p.resultadoContacto ?? "naoAtendeu"}`, detalhe: "", chaveDetalhe: "pessoasPagina.seed.callNote",
    },
    {
      ...base, id: `${p.id}-a3`, tipo: "historico", quando: p.desde ?? ultimo,
      titulo: "", chaveTitulo: "pessoasPagina.seed.created", detalhe: "", chaveDetalhe: `pessoasPagina.origin.${p.origem}`,
    },
  ];
  if (p.ultimoContactoDias >= 3) {
    itens.push({
      ...base, id: `${p.id}-a2`, tipo: "email", quando: somarDias(ultimo, -2),
      titulo: "", chaveTitulo: "pessoasPagina.seed.emailSent", detalhe: "", chaveDetalhe: "pessoasPagina.seed.emailDetail",
    });
  }
  return itens;
}

/** A atividade de exemplo de todas as pessoas, por ordem de pessoa. */
export const atividadeExemplo = (pessoas: readonly Pessoa[]): ItemAtividade[] => pessoas.flatMap(atividadeDe);
