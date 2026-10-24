// Só para testes: uma ficha tal como neg_ficha_pessoa a devolve, com valores por omissão que cada teste altera.
import type {
  AgregadosDb, AtividadeFichaDb, ContactoFichaDb, FichaDb, LevantamentoFichaDb, NegocioFichaDb, PessoaFichaDb, SeccaoDb, VisitaFichaDb,
} from "./fichaTipos";

export const PESSOA_ID = "11111111-1111-4111-8111-111111111111";
export const LEAD_ID = "22222222-2222-4222-8222-222222222222";

export const pessoaDb = (sobre: Partial<PessoaFichaDb> = {}): PessoaFichaDb => ({
  id: PESSOA_ID, nome: "Ana Lopes", papel: "lead", lead_id: LEAD_ID, client_id: null, responsavel_id: "u1", responsavel_nome: "Rita Gomes",
  etapa: "nova", desde: "2026-09-01T10:00:00Z", contacto: { telefone: "912345678", email: "ana@exemplo.pt" }, morada: null,
  qualificacao: null, origem: null, nif: null, empresa: null, ...sobre,
});

export const agregadosDb = (sobre: Partial<AgregadosDb> = {}): AgregadosDb => ({
  ultimo_contacto_em: null, ultimo_resultado: null, proximo_contacto_em: null, ultima_visita_feita_em: null, proxima_visita_em: null,
  por_ligar: { contactos: 0, visitas: 0, levantamentos: 0 }, negocios: { abertos: 0, ganhos: 0, perdidos: 0 },
  total_contactos: 0, total_visitas: 0, total_levantamentos: 0, total_atividade: 0, ...sobre,
});

export function seccaoDb<T>(itens: T[] = [], sobre: Partial<SeccaoDb<T>> = {}): SeccaoDb<T> {
  return { total: itens.length, tem_mais: false, proximo: null, itens, ...sobre };
}

export const negocioDb = (sobre: Partial<NegocioFichaDb> = {}): NegocioFichaDb => ({
  id: "n1", titulo: "Casa de banho", notas: null, estado: "aberto", criado_em: "2026-10-10T09:00:00Z", ganho_em: null, perdido_em: null,
  fase_perda: null, motivo_perda: null, responsavel_id: "u1", responsavel_nome: "Rita Gomes", valor: 0, pronto_a_ganhar: false,
  parado_desde: null, levantamento_id: null, orcamentos: [], propostas: [], contratos: [], eventos: [], ...sobre,
});

export const contactoDb = (sobre: Partial<ContactoFichaDb> = {}): ContactoFichaDb => ({
  id: "c1", resultado: "atendeuInteressado", notas: null, em: "2026-10-12T09:30:00Z", proxima_acao_em: null, negocio_id: null,
  criado_por_nome: "Rita Gomes", ...sobre,
});

export const visitaDb = (sobre: Partial<VisitaFichaDb> = {}): VisitaFichaDb => ({
  id: "v1", inicio: "2026-10-20T09:00:00Z", fim: "2026-10-20T10:00:00Z", status: "scheduled", resultado: null, tipo: "levantamento", titulo: null,
  notas: null, local: null, negocio_id: null, feito_por_nome: "Rita Gomes", board_id: null, board_nome: null, recursos: [], detalhes: null, ...sobre,
});

export const levantamentoDb = (sobre: Partial<LevantamentoFichaDb> = {}): LevantamentoFichaDb => ({
  id: "l1", visita_id: null, negocio_id: null, data: "2026-10-12", estado: "feito", notas: null, feito_por_id: "u1", feito_por_nome: "Rita Gomes",
  morada: null, n_linhas: 0, n_respostas: 0, linhas: [], respostas: [], ...sobre,
});

export const atividadeDb = (sobre: Partial<AtividadeFichaDb> = {}): AtividadeFichaDb => ({
  id: "a1", tipo: "call", assunto: null, resultado: "atendeuInteressado", notas: null, em: "2026-10-12T09:30:00Z", negocio_id: null,
  criado_por_nome: "Rita Gomes", ...sobre,
});

/** Uma ficha vazia de uma lead (sem negócios nem registos). */
export const fichaDb = (sobre: Partial<FichaDb> = {}): FichaDb => ({
  pessoa: pessoaDb(), lead: { id: LEAD_ID, estado: "new", aberta: true, encerramento: null }, leads_abertas: [], agregados: agregadosDb(),
  permissoes: { editar: true, criar: true }, negocios: { total: 0, itens: [] }, documentos_por_ligar: null,
  contactos: seccaoDb(), visitas: seccaoDb(), levantamentos: seccaoDb(), atividade: seccaoDb(), ...sobre,
});
