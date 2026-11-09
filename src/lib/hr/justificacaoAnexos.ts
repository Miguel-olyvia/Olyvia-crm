/**
 * Os anexos reais das justificações (do dia e da falta), a parte pura: o que se valida no browser antes de gastar uma
 * reserva, os códigos de erro da Edge `hr-justificacao-anexo` (e a chave de tradução de cada um) e a leitura segura do que
 * a RPC `rpc_hr_justificacao_anexos_listar` devolve.
 *
 * O browser só PRIMEIRO-FILTRA: quem decide formato, tamanho e conteúdo é a Edge (assinatura real, limpeza) e a base.
 * O nome do ficheiro vem NULO a quem não o pode ver (pode ser dado de saúde): mostra-se «Anexo» e o tamanho.
 */

export const MAX_ANEXOS_JUSTIFICACAO_REAIS = 4;
export const TAMANHO_MAX_ANEXO_BYTES = 10 * 1024 * 1024;
export const MIMES_ANEXO_ACEITES: readonly string[] = ["application/pdf", "image/jpeg", "image/png"];
/** O valor de `accept` do campo de ficheiros. */
export const ACCEPT_ANEXOS = MIMES_ANEXO_ACEITES.join(",");

/** Os códigos `{error}` que a Edge pode devolver. */
export const CODIGOS_DE_ERRO_ANEXO: readonly string[] = [
  "pedido_invalido",
  "sem_sessao",
  "sem_permissao",
  "justificacao_nao_encontrada",
  "anexo_nao_encontrado",
  "justificacao_decidida",
  "anexo_estado_invalido",
  "anexo_maximo_ficheiros",
  "anexo_limite_reservas",
  "anexo_nao_carregado",
  "anexo_formato_invalido",
  "anexo_vazio",
  "anexo_demasiado_grande",
  "anexo_conteudo_recusado",
  "rate_limited",
  "anexo_falha_envio",
  "erro_url",
  "erro_inesperado",
];

const CHAVE_INESPERADO = "rhJust.anexo.erro.erro_inesperado";

/**
 * Os erros de autenticação da Edge vêm de `_shared/auth.ts` com TEXTO em inglês e o estado HTTP (401/403), e não com um dos
 * códigos acima. Mapeiam-se aqui para o código estável, para nunca se mostrar o texto cru nem cair no «erro inesperado».
 */
const TEXTO_DE_AUTENTICACAO: Readonly<Record<string, string>> = {
  "Authorization header required": "sem_sessao",
  "Invalid or expired token": "sem_sessao",
  "User profile not found": "sem_permissao",
};

/**
 * O código estável de um erro da Edge: um código conhecido fica como está; os textos de autenticação e qualquer 401 viram
 * `sem_sessao`; o que não se reconhece fica como veio (e `chaveDoErroDeAnexo` trata-o como inesperado). `null` sem código nem 401.
 */
export function codigoCanonicoDeAnexo(codigo: string | null | undefined, estadoHttp?: number | null): string | null {
  if (codigo && CODIGOS_DE_ERRO_ANEXO.includes(codigo)) return codigo;
  if (codigo && Object.prototype.hasOwnProperty.call(TEXTO_DE_AUTENTICACAO, codigo)) return TEXTO_DE_AUTENTICACAO[codigo];
  if (estadoHttp === 401) return "sem_sessao";
  return codigo ?? null;
}

/** A chave de tradução de um código de erro; nulo ou desconhecido dá o erro inesperado (nunca se mostra o código). */
export function chaveDoErroDeAnexo(codigo: string | null | undefined, estadoHttp?: number | null): string {
  const canonico = codigoCanonicoDeAnexo(codigo, estadoHttp);
  return canonico && CODIGOS_DE_ERRO_ANEXO.includes(canonico) ? `rhJust.anexo.erro.${canonico}` : CHAVE_INESPERADO;
}

/** O motivo por que o ficheiro nem chega a ser enviado, ou `null`. */
export function validarFicheiroDeAnexo(f: Pick<File, "type" | "size">): string | null {
  if (!MIMES_ANEXO_ACEITES.includes((f.type ?? "").toLowerCase())) return "anexo_formato_invalido";
  if (f.size <= 0) return "anexo_vazio";
  if (f.size > TAMANHO_MAX_ANEXO_BYTES) return "anexo_demasiado_grande";
  return null;
}

/**
 * Junta o que se escolheu ao que já havia: só os válidos, no máximo 4 no total. `erro` é o primeiro motivo de recusa
 * (formato, vazio, tamanho) ou `anexo_maximo_ficheiros` se sobrou algum.
 */
export function escolherAnexos(jaEscolhidos: number, novos: readonly File[]): { aceites: File[]; erro: string | null } {
  const aceites: File[] = [];
  let erro: string | null = null;
  for (const f of novos) {
    const motivo = validarFicheiroDeAnexo(f);
    if (motivo) {
      erro ??= motivo;
    } else if (jaEscolhidos + aceites.length >= MAX_ANEXOS_JUSTIFICACAO_REAIS) {
      erro ??= "anexo_maximo_ficheiros";
    } else {
      aceites.push(f);
    }
  }
  return { aceites, erro };
}

/** Um anexo, como o ecrã o usa. */
export interface AnexoListado {
  id: string;
  /** Nulo a quem não pode ver o nome. */
  nome: string | null;
  mimeType: string | null;
  tamanhoBytes: number;
  criadoEm: string | null;
  carregadoPorNome: string | null;
  podeAbrir: boolean;
  podeRemover: boolean;
  origem: string | null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** As linhas de `rpc_hr_justificacao_anexos_listar`; só os anexos verificados contam. Nunca lança. */
export function lerAnexosListados(bruto: unknown): AnexoListado[] {
  if (!Array.isArray(bruto)) return [];
  const lista: AnexoListado[] = [];
  for (const l of bruto) {
    if (l === null || typeof l !== "object") continue;
    const r = l as Record<string, unknown>;
    const id = texto(r.id);
    if (!id || r.estado !== "verificado") continue;
    const bytes = Number(r.tamanho_bytes);
    lista.push({
      id,
      nome: texto(r.nome),
      mimeType: texto(r.mime_type),
      tamanhoBytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
      criadoEm: texto(r.criado_em),
      carregadoPorNome: texto(r.carregado_por_nome),
      podeAbrir: r.pode_abrir === true,
      podeRemover: r.pode_remover === true,
      origem: texto(r.origem),
    });
  }
  return lista;
}

/** «4 kB» / «3,0 MB»; vazio quando não se sabe o tamanho. */
export function tamanhoLegivel(bytes: number): string {
  if (!(bytes > 0)) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/** O que se escreve na lista: o nome, ou «Anexo» (traduzido por quem chama) com o tamanho quando o nome vem oculto. */
export function rotuloDoAnexo(a: Pick<AnexoListado, "nome" | "tamanhoBytes">, rotuloGenerico: string): string {
  if (a.nome) return a.nome;
  const tamanho = tamanhoLegivel(a.tamanhoBytes);
  return tamanho ? `${rotuloGenerico} · ${tamanho}` : rotuloGenerico;
}
