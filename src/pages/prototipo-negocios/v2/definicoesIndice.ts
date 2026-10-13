// O índice da pesquisa das Definições (V2): cada entrada tem o nome, os sinónimos (as palavras que
// as pessoas usam, incluindo os nomes do antigo) e a âncora da secção ou da linha. Estático e puro.
import { normal } from "../catalogo";

export interface Secao { id: string; titulo: string }

/** As secções da página, pela ordem em que aparecem (as âncoras são os ids). */
export const SECOES: Secao[] = [
  { id: "arranque", titulo: "Arranque" },
  { id: "empresa", titulo: "Empresa e setor" },
  { id: "fases", titulo: "Fases e campos" },
  { id: "orcamento", titulo: "Orçamento" },
  { id: "documentos", titulo: "Documentos" },
  { id: "email", titulo: "Email" },
  { id: "equipa", titulo: "Equipa e acessos" },
  { id: "dados", titulo: "Dados" },
  { id: "aspeto", titulo: "Aspeto e demonstração" },
];

export interface EntradaIndice { rotulo: string; sinonimos: string[]; ancora: string; secao: string }

const E = (secao: string, ancora: string, rotulo: string, sinonimos: string[]): EntradaIndice => ({ secao, ancora, rotulo, sinonimos });

export const INDICE: EntradaIndice[] = [
  E("arranque", "arranque", "Arranque", ["onboarding", "começar", "configurar a conta", "questionário", "primeiros passos"]),
  E("empresa", "empresa-termos", "Nomes de Cliente, Local e Obra", ["termos", "nomenclatura", "chamar", "vocabulário", "serviço", "espaço"]),
  E("empresa", "empresa-setor", "Modelo de setor", ["setor", "remodelação", "limpeza", "manutenção", "avac", "solar", "template"]),
  E("fases", "fases-nomes", "Nomes das fases", ["etapas", "pipeline", "funil", "estados", "workflow", "lead", "contacto", "visita"]),
  E("fases", "fases-campos", "Campos e formulários", ["campos", "perguntas", "obrigatório", "levantamento", "formulário", "campos personalizados", "custom fields"]),
  E("orcamento", "orcamento-margens", "Margem mínima e alvo", ["margem", "lucro", "aprovação", "desconto", "linha de serviço", "piso"]),
  E("orcamento", "orcamento-estrutura", "Custo de estrutura", ["estrutura", "custos fixos", "renda", "overhead"]),
  E("orcamento", "orcamento-deslocacao", "Taxas de deslocação", ["deslocação", "quilómetros", "km", "viagem", "taxa de serviço", "transporte"]),
  E("orcamento", "orcamento-modelos", "Modelos de orçamento e PDF", ["modelo de orçamento", "pdf", "template", "impressão"]),
  E("documentos", "documentos-propostas", "Modelos de proposta", ["proposta", "template de proposta"]),
  E("documentos", "documentos-contratos", "Modelos de contrato", ["contrato", "adenda", "empreitada"]),
  E("documentos", "documentos-emails", "Modelos de email", ["templates de email", "mensagens", "texto do email"]),
  E("email", "email-smtp", "Servidor de email (SMTP)", ["smtp", "servidor", "remetente", "porta", "enviar emails"]),
  E("email", "email-falhas", "Falhas de envio", ["erros", "não enviado", "devolvido", "reenviar", "bounce"]),
  E("equipa", "equipa-utilizadores", "Utilizadores", ["equipa", "pessoas", "convidar", "contas", "users"]),
  E("equipa", "equipa-perfis", "Perfis e permissões", ["funções", "papéis", "acessos", "permissões", "roles", "comercial", "direção", "financeiro", "armazém", "operações"]),
  E("dados", "dados-lixo", "Lixo", ["apagados", "restaurar", "recuperar", "reciclagem", "eliminados", "lixeira"]),
  E("aspeto", "aspeto-leitura", "Leitura fácil", ["dislexia", "letra maior", "tamanho do texto", "acessibilidade"]),
  E("aspeto", "aspeto-atual", "Ver o aspeto atual", ["aspeto antigo", "comparar", "tema"]),
  E("aspeto", "aspeto-repor", "Repor a demonstração", ["reset", "recomeçar", "apagar tudo", "dados de exemplo"]),
];

/**
 * Procura no índice: cada palavra da pesquisa tem de aparecer no nome ou num sinónimo (sem acentos nem maiúsculas).
 * Os que começam pelo que se escreveu no nome vêm primeiro. Pesquisa vazia: nada.
 */
export function procurar(q: string, indice: EntradaIndice[] = INDICE): EntradaIndice[] {
  const palavras = normal(q.trim()).split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const pontos = (e: EntradaIndice): number => {
    const rot = normal(e.rotulo), sin = e.sinonimos.map(normal), tudo = [rot, ...sin].join(" | ");
    if (!palavras.every((p) => tudo.includes(p))) return -1;
    const frase = palavras.join(" ");
    if (rot.startsWith(frase)) return 3;
    if (rot.includes(frase)) return 2;
    if (sin.some((s) => s.startsWith(frase))) return 1;
    return 0;
  };
  return indice
    .map((e, i) => ({ e, i, p: pontos(e) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.e);
}

export const tituloSecao = (id: string): string => SECOES.find((s) => s.id === id)?.titulo ?? "";
