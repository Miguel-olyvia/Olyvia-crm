// "Nova lead": o que o formulário pede, a validação e a pessoa (e a atividade) que saem dele. Funções puras: o dia de
// hoje e o número de série chegam por parâmetro. O que se guarda vive em `pessoasNovas.ts`.
import type { ItemAtividade, OrigemPessoa, Pessoa } from "./pessoasTipos";

export const ORIGENS_LEAD: readonly OrigemPessoa[] = ["site", "formulario", "campanha", "indicacao", "telefone"];
export const MAX_NOME_LEAD = 80;
export const MAX_NOTA_LEAD = 280;

export interface DadosNovaLead {
  nome: string;
  telefone: string;
  email: string;
  localidade: string;
  origem: OrigemPessoa;
  /** O formulário ou a campanha de onde veio (opcional). */
  formulario: string;
  comercial: string;
  nota: string;
}

export type ErroLead = "obrigatorio" | "comprido" | "invalido";
export type ErrosNovaLead = Partial<Record<"nome" | "telefone" | "email" | "nota", ErroLead>>;

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Um telefone aceita dígitos, espaços, + e hífens, com 9 a 15 dígitos. */
const FORMATO_TELEFONE = /^\+?[\d\s-]+$/;

const digitos = (texto: string): number => texto.replace(/\D/g, "").length;

/** O nome é obrigatório; o telefone e o email só se validam se se escreveram. Vazio quando está tudo certo. */
export function validarNovaLead(dados: DadosNovaLead): ErrosNovaLead {
  const erros: ErrosNovaLead = {};
  const nome = dados.nome.trim();
  if (nome === "") erros.nome = "obrigatorio";
  else if (nome.length > MAX_NOME_LEAD) erros.nome = "comprido";
  const telefone = dados.telefone.trim();
  if (telefone && (!FORMATO_TELEFONE.test(telefone) || digitos(telefone) < 9 || digitos(telefone) > 15)) erros.telefone = "invalido";
  const email = dados.email.trim();
  if (email && !FORMATO_EMAIL.test(email)) erros.email = "invalido";
  if (dados.nota.trim().length > MAX_NOTA_LEAD) erros.nota = "comprido";
  return erros;
}

/** O texto vazio vira `null` (o contacto que não se escreveu não existe). */
const ouNulo = (texto: string): string | null => (texto.trim() === "" ? null : texto.trim());

export interface LeadMontada {
  pessoa: Pessoa;
  /** A atividade com que a lead nasce: "Lead criada" e, se se escreveu, a nota (a mais recente primeiro). */
  atividade: ItemAtividade[];
}

/**
 * A pessoa nova: uma lead na etapa "Por contactar" (etapa "nova"), com o primeiro contacto para hoje. O id é
 * `p-novo-<sequência>`. Quem a cria não a tem em lado nenhum, por isso fica só em memória.
 */
export function montarLead(dados: DadosNovaLead, hoje: string, sequencia: number): LeadMontada {
  const id = `p-novo-${sequencia}`;
  const localidade = dados.localidade.trim();
  const formulario = dados.formulario.trim();
  const pessoa: Pessoa = {
    id, nome: dados.nome.trim(), contacto: { telefone: ouNulo(dados.telefone), email: ouNulo(dados.email) },
    comercial: dados.comercial, origem: dados.origem, viaEntrada: "manual", saude: 50, etapa: "nova", ultimoContactoDias: 0,
    desde: hoje, proximoContacto: hoje,
    ...(localidade ? { morada: { linha: "", cp: "", localidade } } : {}),
    ...(formulario ? { formulario } : {}),
  };
  const criada: ItemAtividade = {
    id: `novo-criada-${sequencia}`, pessoaId: id, tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.activity.created",
    detalhe: "", quando: hoje, exemplo: false,
  };
  const nota = dados.nota.trim();
  const itemNota: ItemAtividade[] = nota
    ? [{
      id: `novo-nota-lead-${sequencia}`, pessoaId: id, tipo: "nota", titulo: "", chaveTitulo: "pessoasPagina.activity.noteAdded",
      detalhe: nota, quando: hoje, exemplo: false,
    }]
    : [];
  return { pessoa, atividade: [...itemNota, criada] };
}
