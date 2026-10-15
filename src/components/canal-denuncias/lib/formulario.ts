// O formulário de denúncia: valores iniciais, validação por passo (devolve chaves de tradução, por campo) e a
// construção da denúncia a partir do que a pessoa preencheu. A identidade só entra se a pessoa escolheu identificar-se.
import { identidadeAGuardar } from "./anonimizacao";
import type { AindaAcontece, Anexo, Denuncia, TipoDenuncia } from "./tipos";
import { MAX_FICHEIROS } from "./tipos";

export const MIN_DESCRICAO = 30;
export const MAX_DESCRICAO = 4000;
export const QUEM_SISTEMA = "@sistema";
export const PASSOS = 5;

export interface DadosFormulario {
  /** null enquanto a pessoa não escolheu (passo 0). */
  anonima: boolean | null;
  nome: string;
  email: string;
  telefone: string;
  podemContactar: boolean;
  soResponsavel: boolean;
  tipo: TipoDenuncia | "";
  descricao: string;
  quando: string;
  aindaAcontece: AindaAcontece;
  onde: string;
  envolvidos: string;
  testemunhas: AindaAcontece;
  jaReportado: string;
  anexos: Anexo[];
  boaFe: boolean;
}

export const FORMULARIO_VAZIO: DadosFormulario = {
  anonima: null,
  nome: "",
  email: "",
  telefone: "",
  podemContactar: false,
  soResponsavel: true,
  tipo: "",
  descricao: "",
  quando: "",
  aindaAcontece: "nao_sei",
  onde: "",
  envolvidos: "",
  testemunhas: "nao_sei",
  jaReportado: "",
  anexos: [],
  boaFe: false,
};

/** Erros por campo: o valor é uma chave de tradução. Vazio = o passo está válido. */
export type ErrosFormulario = Partial<Record<keyof DadosFormulario | "contacto", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarPassoIdentidade(f: DadosFormulario): ErrosFormulario {
  if (f.anonima === null) return { anonima: "cd.erro.modo" };
  if (f.anonima) return {};
  const erros: ErrosFormulario = {};
  if (f.email.trim() && !EMAIL.test(f.email.trim())) erros.email = "cd.erro.email";
  if (f.podemContactar && !f.email.trim() && !f.telefone.trim()) erros.contacto = "cd.erro.contacto";
  return erros;
}

function validarPassoOQue(f: DadosFormulario): ErrosFormulario {
  const erros: ErrosFormulario = {};
  if (!f.tipo) erros.tipo = "cd.erro.tipo";
  const tamanho = f.descricao.trim().length;
  if (tamanho < MIN_DESCRICAO) erros.descricao = "cd.erro.descricaoCurta";
  else if (tamanho > MAX_DESCRICAO) erros.descricao = "cd.erro.descricaoLonga";
  if (f.quando.trim().length < 2) erros.quando = "cd.erro.quando";
  return erros;
}

/** Valida o passo `n` (0 a 4). Os passos «Quem» e «Provas» não têm campos obrigatórios. */
export function validarPasso(f: DadosFormulario, n: number): ErrosFormulario {
  if (n === 0) return validarPassoIdentidade(f);
  if (n === 1) return validarPassoOQue(f);
  if (n === 3) return f.anexos.length > MAX_FICHEIROS ? { anexos: "cd.erro.demasiadosFicheiros" } : {};
  if (n === 4) return f.boaFe ? {} : { boaFe: "cd.erro.boaFe" };
  return {};
}

export const passoValido = (f: DadosFormulario, n: number): boolean => Object.keys(validarPasso(f, n)).length === 0;

/** A primeira linha da descrição, cortada, para a coluna «Resumo» da lista. */
export function resumirTexto(texto: string, max = 90): string {
  const linha = texto.trim().split(/\r?\n/)[0] ?? "";
  return linha.length <= max ? linha : `${linha.slice(0, max - 1).trimEnd()}…`;
}

export interface DadosNovaDenuncia {
  id: string;
  codigo: string;
  pin: string;
  /** AAAA-MM-DD */
  hoje: string;
  em: string;
  idEvento: string;
  /** A organização a que a denúncia pertence (a ativa, dentro da app; a da página, na pública). */
  organizationId: string;
  /** A pessoa que denuncia dentro da app. Só fica na denúncia se esta for identificada. */
  pessoaId?: string | null;
}

export function construirDenuncia(f: DadosFormulario, n: DadosNovaDenuncia): Denuncia {
  // Sem escolha feita, o mais seguro para a pessoa é tratar como anónima: só se identifica quem o disse.
  const anonima = f.anonima !== false;
  return {
    id: n.id,
    organizationId: n.organizationId,
    codigo: n.codigo,
    pin: n.pin,
    tipo: f.tipo === "" ? "outro" : f.tipo,
    resumo: resumirTexto(f.descricao),
    descricao: f.descricao.trim(),
    quando: f.quando.trim(),
    aindaAcontece: f.aindaAcontece,
    onde: f.onde.trim(),
    envolvidos: f.envolvidos.trim(),
    testemunhas: f.testemunhas,
    jaReportado: f.jaReportado.trim(),
    anexos: f.anexos.slice(0, MAX_FICHEIROS),
    anonima,
    identidade: identidadeAGuardar(anonima, f),
    pessoaId: anonima ? null : (n.pessoaId ?? null),
    estado: "recebida",
    recebidaEm: n.hoje,
    confirmadaEm: null,
    responsavelId: null,
    denunciados: [],
    conflitos: [],
    gravidade: "media",
    avaliacaoInicial: "",
    mensagens: [],
    notas: [],
    decisao: null,
    motivoArquivo: null,
    historico: [{ id: n.idEvento, em: n.em, quem: QUEM_SISTEMA, acao: "recebida" }],
  };
}
