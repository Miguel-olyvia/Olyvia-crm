// O índice da pesquisa das Definições (V2): cada entrada tem o nome, os sinónimos (as palavras que
// as pessoas usam, incluindo os nomes do antigo) e a âncora da secção ou da linha. Estático e puro.
import { normal } from "../catalogo";

export interface Secao { id: string; titulo: string; /** Só aparece a quem vê como Direção (a Plataforma). */ soDirecao?: boolean }

/** As secções da página, pela ordem em que aparecem (as âncoras são os ids). */
export const SECOES: Secao[] = [
  { id: "arranque", titulo: "Arranque" },
  { id: "empresa", titulo: "Empresa e setor" },
  { id: "fases", titulo: "Fases e campos" },
  { id: "funil", titulo: "Funil e pontuação" },
  { id: "orcamento", titulo: "Orçamento" },
  { id: "agenda", titulo: "Agenda" },
  { id: "documentos", titulo: "Documentos" },
  { id: "email", titulo: "Email" },
  { id: "marketing", titulo: "Marketing" },
  { id: "equipa", titulo: "Equipa e acessos" },
  { id: "plataforma", titulo: "Plataforma", soDirecao: true },
  { id: "dados", titulo: "Dados" },
  { id: "aspeto", titulo: "Aspeto e demonstração" },
];

export interface EntradaIndice { rotulo: string; sinonimos: string[]; ancora: string; secao: string; soDirecao?: boolean }

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
  // Acrescentadas a 13/10 (Agenda, Funil e pontuação, Marketing, Plataforma): ficam no fim para não mudar a ordem das de cima.
  E("funil", "funil-avanco", "Quando cada fase avança", ["regras de etapa", "regras do funil", "estágios", "automático", "workflow de leads", "avançar fase"]),
  E("funil", "funil-pontos", "Pontuação das leads", ["scoring", "lead scoring", "pontos", "qualificação", "classificar leads", "regras de pontuação"]),
  E("funil", "funil-limiares", "Limiares MQL e SQL", ["mql", "sql", "lead qualificada", "marketing qualified", "sales qualified", "qualificação"]),
  E("funil", "funil-experimentar", "Experimentar as regras", ["dry run", "simular", "testar regras", "pré-visualizar", "simulação"]),
  E("agenda", "agenda-quadros", "Quadros da agenda", ["quadros", "boards", "calendários", "agendas", "scheduling", "cores da agenda"]),
  E("agenda", "agenda-recursos", "Recursos", ["recursos", "técnicos", "veículos", "carrinha", "equipamentos", "disponibilidade", "ferramentas"]),
  E("agenda", "agenda-regras", "Regras de marcação", ["duração da visita", "intervalo", "antecedência", "horário de trabalho", "horário", "marcações", "scheduling rules"]),
  E("marketing", "marketing-canais", "Tipos de canal", ["canais", "channels", "origem", "pago", "redes sociais", "pesquisa", "offline", "parcerias"]),
  E("orcamento", "orcamento-entulho", "Demolição e entulho", ["entulho", "demolição", "big bag", "contentor", "deposição", "vazadouro", "rcd", "e-gar", "markup", "artigos de demolição"]),
  { ...E("plataforma", "plataforma-lista", "Acessos de suporte, entradas e RGPD", ["suporte", "support access", "auditoria", "auth audit log", "entradas", "login", "rgpd", "apagamento", "gdpr", "platform"]), soDirecao: true },
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

/** O que esta pessoa vê: a Plataforma só aparece a quem vê como Direção. */
export const secoesVisiveis = (direcao: boolean): Secao[] => SECOES.filter((s) => direcao || !s.soDirecao);
export const indiceVisivel = (direcao: boolean): EntradaIndice[] => INDICE.filter((e) => direcao || !e.soDirecao);

export const tituloSecao = (id: string): string => SECOES.find((s) => s.id === id)?.titulo ?? "";
