/**
 * Os anexos do convite de admissao, do lado do ecra publico: tipos, limites,
 * pre-verificacao local e a ponte para o texto de erro.
 *
 * O SERVIDOR E A VERDADE
 * ----------------------
 * A Edge Function `convite-admissao` descarrega o ficheiro, le a assinatura
 * REAL (nao o que o navegador declarou) e e ela que decide. Aqui so se poupa um
 * envio que ia ser recusado de certeza -- por isso os limites tem de ser
 * IGUAIS aos de `supabase/functions/convite-admissao/anexos.ts` e aos das
 * funcoes SQL.
 *
 * SO O COMPROVATIVO DE IBAN ESTA ABERTO (20270107000000). Cartao de cidadao e
 * fotografia ficam FECHADOS ate haver parecer: continuam nos tipos e nos limites
 * (o contrato de tres lados mantem-se), mas o ecra nao os mostra nem os envia, e a
 * Edge e a base recusam-nos. O comprovativo e OBRIGATORIO quando a pessoa indicou
 * um IBAN: a regra e do servidor (`anexos_em_falta` na submissao); aqui so se
 * calcula o que falta para o ecra o dizer antes de submeter.
 */
import { chaveDeErroAdmissao } from "@/lib/hr/errosAdmissao";
import type { IdiomaConvite } from "@/lib/hr/conviteAdmissaoEcra";
import type { AnexoPortal } from "@/lib/hr/portalAdmissao";

export type TipoAnexoConvite = "cartao_cidadao" | "comprovativo_iban" | "fotografia";

export const TIPOS_ANEXO_CONVITE: readonly TipoAnexoConvite[] = [
  "cartao_cidadao",
  "comprovativo_iban",
  "fotografia",
];

/** Os tipos que o portal aceita enviar agora (o resto esta fechado). */
export const TIPOS_ANEXO_CONVITE_ABERTOS: readonly TipoAnexoConvite[] = ["comprovativo_iban"];

export function eTipoAbertoConvite(tipo: string): tipo is TipoAnexoConvite {
  return (TIPOS_ANEXO_CONVITE_ABERTOS as readonly string[]).includes(tipo);
}

const MB = 1024 * 1024;

export const LIMITES_ANEXOS = {
  /** Ficheiros activos (a enviar ou ja enviados) por convite. */
  maxActivos: 4,
  porTipo: { cartao_cidadao: 2, comprovativo_iban: 1, fotografia: 1 } as Readonly<
    Record<TipoAnexoConvite, number>
  >,
  tamanhoMaximoBytes: 10 * MB,
  fotografiaMaximaBytes: 5 * MB,
  mimesAceites: ["application/pdf", "image/png", "image/jpeg"] as readonly string[],
  mimesFotografia: ["image/png", "image/jpeg"] as readonly string[],
} as const;

/** Um ficheiro ja aceite pelo servidor e ligado ao convite. */
export interface AnexoConvite {
  id: string;
  tipo: TipoAnexoConvite;
  nome_original: string;
  tamanho_bytes: number;
  mime_type: string;
}

export type ContagemPorTipo = Partial<Record<TipoAnexoConvite, number>>;

/**
 * Os ficheiros que o servidor tem ligados, a partir da lista da accao `ler`.
 * Os pendentes (reservados mas nunca confirmados) nao contam: nao ha ficheiro.
 */
export function anexosLigadosDaLer(lista: readonly AnexoPortal[]): AnexoConvite[] {
  return lista
    .filter((a) => a.estado === "ligado")
    .map((a) => ({
      id: a.id,
      tipo: a.tipo as TipoAnexoConvite,
      nome_original: a.nome,
      tamanho_bytes: a.tamanho_bytes ?? 0,
      mime_type: a.mime_type ?? "",
    }));
}

/**
 * O que ainda falta enviar, dos tipos obrigatorios. Um tipo que o servidor ja dava
 * como em falta (`emFaltaInicial`: p. ex. o RH devolveu o IBAN e o comprovativo
 * antigo ja nao serve) so fica resolvido por um ficheiro enviado DEPOIS de abrir
 * o portal; nos outros, qualquer ficheiro do tipo serve. O servidor e quem decide
 * na submissao: isto so evita o pedido que ia ser recusado.
 */
export function tiposEmFalta(entrada: {
  obrigatorios: readonly string[];
  emFaltaInicial: readonly string[];
  idsIniciais: ReadonlySet<string>;
  anexos: readonly { id: string; tipo: string }[];
}): string[] {
  const { obrigatorios, emFaltaInicial, idsIniciais, anexos } = entrada;
  return obrigatorios.filter((tipo) => {
    const exigeNovo = emFaltaInicial.includes(tipo);
    return !anexos.some((a) => a.tipo === tipo && (!exigeNovo || !idsIniciais.has(a.id)));
  });
}

function eTipoConhecido(tipo: string): tipo is TipoAnexoConvite {
  return (TIPOS_ANEXO_CONVITE as readonly string[]).includes(tipo);
}

/**
 * Pre-verificacao por `file.type` e `file.size`; devolve o codigo de erro (os
 * mesmos que a Edge Function emite) ou `null`. A ordem e a do servidor.
 */
export function validarFicheiroLocal(
  tipo: TipoAnexoConvite,
  file: { type: string; size: number },
): string | null {
  if (!eTipoConhecido(tipo)) return "anexo_tipo_invalido";
  if (!LIMITES_ANEXOS.mimesAceites.includes(file.type)) return "anexo_formato_invalido";
  if (tipo === "fotografia" && !LIMITES_ANEXOS.mimesFotografia.includes(file.type)) {
    return "anexo_fotografia_formato";
  }
  if (!(file.size > 0)) return "anexo_vazio";
  if (tipo === "fotografia" && file.size > LIMITES_ANEXOS.fotografiaMaximaBytes) {
    return "anexo_fotografia_demasiado_grande";
  }
  if (file.size > LIMITES_ANEXOS.tamanhoMaximoBytes) return "anexo_demasiado_grande";
  return null;
}

/** Conta os anexos por tipo (so os tipos conhecidos). */
export function contarPorTipo(anexos: readonly { tipo: string }[]): ContagemPorTipo {
  const contagem: ContagemPorTipo = {};
  for (const anexo of anexos) {
    if (!eTipoConhecido(anexo.tipo)) continue;
    contagem[anexo.tipo] = (contagem[anexo.tipo] ?? 0) + 1;
  }
  return contagem;
}

/**
 * Cabe mais um ficheiro deste tipo? A contagem inclui o que esta a enviar. A
 * ordem e a do servidor: primeiro o total, depois o tipo.
 */
export function verificarLimitesDeContagem(
  tipo: TipoAnexoConvite,
  contagem: ContagemPorTipo,
): string | null {
  const total = Object.values(contagem).reduce<number>((soma, n) => soma + (n ?? 0), 0);
  if (total >= LIMITES_ANEXOS.maxActivos) return "anexo_maximo_ficheiros";
  if ((contagem[tipo] ?? 0) >= LIMITES_ANEXOS.porTipo[tipo]) return "anexo_tipo_cheio";
  return null;
}

/** "512 B", "2 KB", "1,8 MB" -- a virgula decimal segue a lingua do ecra. */
export function formatarTamanho(bytes: number, idioma: IdiomaConvite = "pt"): string {
  const valor = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const numero = (n: number) =>
    new Intl.NumberFormat(idioma, { maximumFractionDigits: 1 }).format(n);
  if (valor < 1024) return `${numero(valor)} B`;
  if (valor < MB) return `${numero(valor / 1024)} KB`;
  return `${numero(valor / MB)} MB`;
}

const CHAVE_FALHA_ENVIO = "hr.convite.erro.anexoFalhaEnvio";

/**
 * A chave de traducao do erro de um anexo. Um codigo sem texto proprio cai na
 * falha de envio: nunca se mostra o codigo em bruto.
 */
export function chaveDeErroAnexo(codigo: string | null | undefined): string {
  if (!codigo) return CHAVE_FALHA_ENVIO;
  if (!/^anexos?_/.test(codigo) && codigo !== "demasiadas_tentativas") return CHAVE_FALHA_ENVIO;
  return chaveDeErroAdmissao(codigo)?.chave ?? CHAVE_FALHA_ENVIO;
}
