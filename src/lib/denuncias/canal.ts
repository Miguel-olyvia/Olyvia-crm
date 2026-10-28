/**
 * O canal de denúncias na base: o que as RPCs e a Edge `denuncia-publica` devolvem (em `snake_case`), os códigos de erro
 * `HRDxx` e a passagem para o `Denuncia` que os ecrãs já usam. Funções puras, sem rede: o que corre na base está em
 * `src/hooks/useDenunciasCanal.ts`.
 *
 * O CONTRATO COM O SQL (as RPCs do desenho `supabase/rascunhos/DESENHO-denuncias.md` ainda não existem na base)
 * -------------------------------------------------------------------------------------------------------------
 * Os nomes dos argumentos são `p_organization_id`, `p_denuncia_id`, `p_texto`, `p_motivo`, `p_user`, `p_gravidade`,
 * `p_resultado`, `p_medidas`, `p_fundamentacao`, `p_ativo`, `p_slug`. As formas das respostas estão nos tipos `*Db` abaixo.
 * Quem escrever o SQL tem de as cumprir (ou mudar este ficheiro e os testes, de propósito). Três pontos vão ALÉM do desenho
 * e são necessários para os ecrãs: `rpc_denuncias_responsaveis` devolve também `eu`; `rpc_denuncias_canal_ler` devolve também
 * `candidatos` e `sem_quem_trate`; e existe `rpc_denuncias_canal_publico(p_organization_id)` (qualquer membro lê o slug do
 * canal da sua organização, para a denúncia feita dentro da app chegar à Edge).
 *
 * Um valor fora das listas fechadas, ou uma resposta com a forma errada, é um ERRO (a leitura falha e o ecrã di-lo): não se
 * adivinha, para uma denúncia nunca aparecer com o estado ou a gravidade que ninguém lhe deu.
 */
import { QUEM_DENUNCIANTE, type ErroAcao } from "@/components/canal-denuncias/lib/acoes";
import { instanteLocal } from "@/components/canal-denuncias/lib/datas";
import { QUEM_SISTEMA } from "@/components/canal-denuncias/lib/formulario";
import {
  AINDA_ACONTECE, ESTADOS, GRAVIDADES, RESULTADOS, TIPOS,
  type Anexo, type Denuncia, type Identidade, type Mensagem, type Responsavel,
} from "@/components/canal-denuncias/lib/tipos";

// ---------------------------------------------------------------------------------------------------- formas da base

export interface MensagemDb { id: string; autor: "canal" | "denunciante"; texto: string; pedido_informacao?: boolean; criada_em: string }
export interface NotaDb { id: string; autor_nome: string | null; texto: string; criada_em: string }
export interface EventoDb { id: string; tipo: string; quem_nome: string | null; dados?: Record<string, unknown> | null; criado_em: string }
export interface AnexoDb { nome_exibicao: string; tamanho_bytes: number; autor?: string }
export interface ImpedidoDb { anew_user_id: string; motivo: "visado" | "conflito" }

/** Uma linha de `rpc_denuncias_listar`: sem descrição completa e sem identidade. */
export interface DenunciaListaDb {
  id: string;
  codigo: string;
  tipo: string;
  resumo: string;
  estado: string;
  gravidade: string;
  anonima: boolean;
  responsavel_id: string | null;
  recebida_em: string;
  confirmada_em: string | null;
}

/** O resultado de `rpc_denuncia_abrir` (e de todas as RPCs de ação, que devolvem a denúncia atualizada). */
export interface DenunciaAbertaDb extends DenunciaListaDb {
  descricao: string;
  quando: string;
  ainda_acontece: string;
  onde: string | null;
  envolvidos: string | null;
  testemunhas: string;
  ja_reportado: string | null;
  avaliacao_inicial: string | null;
  resultado: string | null;
  medidas: string | null;
  fundamentacao: string | null;
  decidida_em: string | null;
  motivo_arquivo: string | null;
  mensagens: MensagemDb[];
  notas: NotaDb[];
  eventos: EventoDb[];
  anexos: AnexoDb[];
  impedidos: ImpedidoDb[];
}

/** O que o denunciante vê: de `rpc_denuncias_minhas` (com `id`) e da Edge `ler` (sem `id`, só o `codigo`). */
export interface VistaDenuncianteDb {
  id?: string;
  codigo: string;
  resumo?: string | null;
  estado: string;
  anonima?: boolean;
  recebida_em: string;
  confirmada_em: string | null;
  resultado: string | null;
  medidas: string | null;
  motivo_arquivo: string | null;
  mensagens: MensagemDb[];
}

export interface IdentidadeDb { nome: string | null; email: string | null; telefone: string | null; pode_contactar: boolean; so_responsavel: boolean }
export interface PessoaDb { id: string; nome: string }
export interface ResponsaveisDb { eu: string | null; responsaveis: PessoaDb[] }
export interface CanalLerDb { ativo: boolean; slug_publico: string | null; responsaveis: PessoaDb[]; candidatos: PessoaDb[]; sem_quem_trate: number }
export interface CanalPublicoDb { ativo: boolean; slug_publico: string | null }

// ---------------------------------------------------------------------------------------------------------- erros

/** Os códigos que a base levanta (`RAISE ... USING ERRCODE`) e o erro que o ecrã traduz. */
const ERRO_POR_CODIGO: Readonly<Record<string, ErroAcao>> = {
  HRD01: "transicao_invalida",
  HRD02: "denunciado",
  HRD03: "conflito",
  HRD04: "texto_vazio",
  HRD05: "motivo_curto",
  HRD06: "resultado_em_falta",
  HRD07: "fundamentacao_em_falta",
  HRD08: "fechada",
  HRD09: "nao_encontrada",
  HRD10: "confirmar_primeiro",
  HRD11: "anonima",
  HRD12: "motivo_identidade",
  HRD13: "limite_anexos",
  HRD14: "nao_e_responsavel",
  HRD15: "impedimento_invalido",
  HRD16: "so_responsavel",
  HRD17: "sem_permissao",
  HRD18: "slug_em_uso",
  HRD19: "canal_inativo",
  HRD20: "anonima_imutavel",
  "42501": "sem_permissao",
};

export interface ErroBase { code?: unknown; message?: unknown }

const codigoDe = (e: unknown): string => {
  const c = e && typeof e === "object" ? (e as ErroBase).code : undefined;
  return typeof c === "string" ? c : "";
};

/** O erro do ecrã para um erro da base. O que não é um `HRDxx` conhecido ou uma recusa de permissão é «indisponivel». */
export const erroDeRpc = (e: unknown): ErroAcao => ERRO_POR_CODIGO[codigoDe(e)] ?? "indisponivel";

/**
 * Se um erro da base é um DEFEITO a reportar (rede, tempo esgotado, RPC por aplicar, sintaxe) e não uma resposta correta
 * (uma regra do canal, ou uma recusa por permissão).
 */
export const deveReportar = (e: unknown): boolean => !(codigoDe(e) in ERRO_POR_CODIGO);

/** O que se envia para o registo de erros: a operação e o código, NUNCA a mensagem, os detalhes nem os argumentos. */
export const erroParaRegisto = (operacao: string, e: unknown): Error => new Error(`denuncias:${operacao}:${codigoDe(e) || "sem_codigo"}`);

// ---------------------------------------------------------------------------------------------------- validação

export class FormaInvalida extends Error {
  constructor(campo: string) {
    super(`denuncias: resposta com forma inválida (${campo})`);
    this.name = "FormaInvalida";
  }
}

function enumDe<T extends string>(valor: unknown, lista: readonly T[], campo: string): T {
  if (typeof valor === "string" && (lista as readonly string[]).includes(valor)) return valor as T;
  throw new FormaInvalida(campo);
}

function textoDe(valor: unknown, campo: string): string {
  if (typeof valor === "string") return valor;
  throw new FormaInvalida(campo);
}

const textoOuVazio = (valor: unknown): string => (typeof valor === "string" ? valor : "");

function listaDe<T>(valor: unknown, campo: string): T[] {
  if (Array.isArray(valor)) return valor as T[];
  throw new FormaInvalida(campo);
}

const dia = (instante: string): string => instanteLocal(instante).slice(0, 10);

/** A resposta de uma RPC que devolve uma lista (um array JSON, ou nada quando vazia). */
export const comoLista = <T>(data: unknown, campo: string): T[] => (data == null ? [] : listaDe<T>(data, campo));

// ------------------------------------------------------------------------------------------------------- mapeamento

function mensagensDe(ms: MensagemDb[]): Mensagem[] {
  return ms.map((m) => ({
    id: textoDe(m.id, "mensagem.id"),
    autor: m.autor === "canal" ? "responsavel" : "denunciante",
    texto: textoDe(m.texto, "mensagem.texto"),
    em: instanteLocal(textoDe(m.criada_em, "mensagem.criada_em")),
    anexos: [],
  }));
}

/** O detalhe de um evento: só o que o ecrã mostra (gravidade, resultado, motivo, nome); nunca o texto de mensagens. */
function detalheDoEvento(e: EventoDb): string | undefined {
  const d = e.dados ?? {};
  const v = e.tipo === "gravidade_alterada" ? d.depois ?? d.gravidade : e.tipo === "concluida" ? d.resultado : d.motivo ?? d.nome;
  return typeof v === "string" && v !== "" ? v : undefined;
}

const SEM_IDENTIDADE = null;

/** Uma linha da lista da gestão. Faltam os campos que só `abrir` traz: ficam vazios e a lista não os mostra. */
export function denunciaDeLista(r: DenunciaListaDb, organizationId: string): Denuncia {
  return {
    id: textoDe(r.id, "id"),
    organizationId,
    codigo: textoDe(r.codigo, "codigo"),
    pin: "",
    tipo: enumDe(r.tipo, TIPOS, "tipo"),
    resumo: textoOuVazio(r.resumo),
    descricao: "",
    quando: "",
    aindaAcontece: "nao_sei",
    onde: "",
    envolvidos: "",
    testemunhas: "nao_sei",
    jaReportado: "",
    anexos: [],
    anonima: r.anonima === true,
    identidade: SEM_IDENTIDADE,
    pessoaId: null,
    estado: enumDe(r.estado, ESTADOS, "estado"),
    recebidaEm: dia(textoDe(r.recebida_em, "recebida_em")),
    confirmadaEm: r.confirmada_em ? dia(r.confirmada_em) : null,
    responsavelId: r.responsavel_id ?? null,
    denunciados: [],
    conflitos: [],
    gravidade: enumDe(r.gravidade, GRAVIDADES, "gravidade"),
    avaliacaoInicial: "",
    mensagens: [],
    notas: [],
    decisao: null,
    motivoArquivo: null,
    historico: [],
  };
}

/** A denúncia completa (sem identidade) de `abrir` e das RPCs de ação. */
export function denunciaDeAberta(r: DenunciaAbertaDb, organizationId: string): Denuncia {
  const base = denunciaDeLista(r, organizationId);
  const decisao = r.estado === "concluida"
    ? {
        resultado: enumDe(r.resultado, RESULTADOS, "resultado"),
        medidas: textoOuVazio(r.medidas),
        fundamentacao: textoOuVazio(r.fundamentacao),
        em: r.decidida_em ? instanteLocal(r.decidida_em) : "",
      }
    : null;
  const impedidos = listaDe<ImpedidoDb>(r.impedidos, "impedidos");
  const anexos: Anexo[] = listaDe<AnexoDb>(r.anexos, "anexos").map((a) => ({ nome: textoDe(a.nome_exibicao, "anexo.nome"), tamanho: Number(a.tamanho_bytes) || 0 }));
  return {
    ...base,
    descricao: textoDe(r.descricao, "descricao"),
    quando: textoOuVazio(r.quando),
    aindaAcontece: enumDe(r.ainda_acontece, AINDA_ACONTECE, "ainda_acontece"),
    onde: textoOuVazio(r.onde),
    envolvidos: textoOuVazio(r.envolvidos),
    testemunhas: enumDe(r.testemunhas, AINDA_ACONTECE, "testemunhas"),
    jaReportado: textoOuVazio(r.ja_reportado),
    anexos,
    denunciados: impedidos.filter((i) => i.motivo === "visado").map((i) => i.anew_user_id),
    conflitos: impedidos.filter((i) => i.motivo === "conflito").map((i) => i.anew_user_id),
    avaliacaoInicial: textoOuVazio(r.avaliacao_inicial),
    mensagens: mensagensDe(listaDe<MensagemDb>(r.mensagens, "mensagens")),
    notas: listaDe<NotaDb>(r.notas, "notas").map((n) => ({ id: n.id, quem: n.autor_nome ?? "", em: instanteLocal(n.criada_em), texto: n.texto })),
    decisao,
    motivoArquivo: r.estado === "arquivada" ? textoOuVazio(r.motivo_arquivo) : null,
    historico: listaDe<EventoDb>(r.eventos, "eventos").map((e) => ({
      id: e.id,
      em: instanteLocal(e.criado_em),
      // O evento «recebida» é do sistema; um evento sem autor é do denunciante (a base só guarda o autor de quem é do canal).
      quem: e.tipo === "recebida" ? QUEM_SISTEMA : e.quem_nome ?? QUEM_DENUNCIANTE,
      acao: e.tipo,
      ...(detalheDoEvento(e) ? { detalhe: detalheDoEvento(e) } : {}),
    })),
  };
}

/**
 * O que o denunciante vê (lista «As minhas» e acompanhamento por código e PIN). `id` é o da base (identificadas) ou o
 * que o cliente escolher (acompanhamento: o código); só traz o que a vista mostra, o resto fica neutro.
 */
export function denunciaDeVista(v: VistaDenuncianteDb, organizationId: string, id: string): Denuncia {
  const estado = enumDe(v.estado, ESTADOS, "estado");
  const decisao = estado === "concluida"
    ? { resultado: enumDe(v.resultado, RESULTADOS, "resultado"), medidas: textoOuVazio(v.medidas), fundamentacao: "", em: "" }
    : null;
  return {
    ...denunciaDeLista(
      { id, codigo: v.codigo, tipo: "outro", resumo: textoOuVazio(v.resumo), estado, gravidade: "media", anonima: v.anonima === true, responsavel_id: null, recebida_em: v.recebida_em, confirmada_em: v.confirmada_em },
      organizationId,
    ),
    mensagens: mensagensDe(listaDe<MensagemDb>(v.mensagens, "mensagens")),
    decisao,
    motivoArquivo: estado === "arquivada" ? textoOuVazio(v.motivo_arquivo) : null,
  };
}

export function identidadeDeDb(r: IdentidadeDb): Identidade {
  return {
    nome: textoOuVazio(r.nome),
    email: textoOuVazio(r.email),
    telefone: textoOuVazio(r.telefone),
    podemContactar: r.pode_contactar === true,
    soResponsavel: r.so_responsavel !== false,
  };
}

export const responsavelDeDb = (p: PessoaDb): Responsavel => ({ id: textoDe(p.id, "pessoa.id"), nome: textoDe(p.nome, "pessoa.nome"), area: "" });

/** O número do contador do menu: a base devolve um inteiro; qualquer outra coisa é um erro, nunca «0». */
export function contagemDe(data: unknown): number {
  const n = typeof data === "number" ? data : typeof data === "string" ? Number(data) : NaN;
  if (!Number.isInteger(n) || n < 0) throw new FormaInvalida("contagem");
  return n;
}
