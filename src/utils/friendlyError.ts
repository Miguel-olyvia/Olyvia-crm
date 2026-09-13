/**
 * Extracts a human-readable error message from various error shapes
 * (Supabase FunctionsHttpError, fetch Response, Error, string) and maps
 * known technical messages to friendly, localized messages.
 */
import { translations } from "@/translations/index";

type Language = "en" | "pt" | "es" | "fr" | "de";

/**
 * Reads the user's selected language outside of React (this module is used
 * from plain async helpers, not hooks/components). Mirrors the storage key
 * and default used by LanguageContext (src/contexts/LanguageContext.tsx).
 */
function getCurrentLanguage(): Language {
  try {
    if (typeof localStorage === "undefined") return "en";
    const saved = localStorage.getItem("language") as Language | null;
    return saved || "en";
  } catch {
    return "en";
  }
}

function translate(key: string): string {
  const lang = getCurrentLanguage();
  const table = translations as unknown as Record<string, Record<string, string>>;
  return table[lang]?.[key] || table.en?.[key] || key;
}

/**
 * Resolves a translation key using the same non-hook locale lookup as
 * getFriendlyErrorMessage, for callers that need a localized fallback
 * message outside of a React component (e.g. requestControlledExport.ts).
 */
export function getLocalizedFallback(key: string): string {
  return translate(key);
}

const FRIENDLY_MAP: Array<{ match: RegExp; key: string }> = [
  // Uma lead com cliente criado tem de ficar em "convertida" -- e a restricao
  // anew_leads_conversao_coerente recusa mudar-lhe o estado. Sem esta entrada,
  // mapFriendly devolvia o texto cru do Postgres ('violates check constraint
  // "anew_leads_conversao_coerente"') a quem arrastasse a lead noutro estado.
  // Vem primeiro por ser a regra mais especifica das que aqui estao.
  { match: /anew_leads_conversao_coerente/i, key: "friendlyError.leadAlreadyConverted" },
  { match: /Nenhum SMTP ativo encontrado/i, key: "friendlyError.noSmtp" },
  { match: /SMTP/i, key: "friendlyError.smtpError" },
  { match: /rate limit|too many requests/i, key: "friendlyError.rateLimit" },
  { match: /unauthorized|not authenticated|jwt/i, key: "friendlyError.sessionExpired" },
  { match: /forbidden|not allowed|permission|insufficient_privilege/i, key: "friendlyError.forbidden" },
  { match: /not found/i, key: "friendlyError.notFound" },
  { match: /timeout|timed out/i, key: "friendlyError.timeout" },
  { match: /network|failed to fetch|load failed/i, key: "friendlyError.network" },
  { match: /invalid.*email|email.*invalid/i, key: "friendlyError.invalidEmail" },
  // Os dois indices unicos de hr_locais_trabalho (20261120130000): nome e
  // codigo por organizacao. Vem ANTES do `duplicate|already exists|unique`
  // generico -- que continua a apanhar tudo o resto -- para dar a quem gere
  // centros uma mensagem que diz QUAL campo colidiu, nao so "ja existe".
  { match: /idx_hr_locais_trabalho_nome_org/i, key: "hr.locais.erroNomeDuplicado" },
  { match: /idx_hr_locais_trabalho_codigo_org/i, key: "hr.locais.erroCodigoDuplicado" },
  // hr_no_pertence_a_arvore_da_org / hr_locais_trabalho_na_arvore
  // (20261130080000): a filial escolhida nao pertence a arvore da propria
  // organizacao. So pode acontecer se o ecra oferecer uma opcao que a base
  // recusa -- o ecra ja filtra por `useFiliaisDaArvore`, mas a base e que
  // decide por ultimo.
  { match: /organograma_no_fora_da_arvore/i, key: "hr.locais.erroFilialForaDaArvore" },
  { match: /duplicate|already exists|unique/i, key: "friendlyError.duplicate" },
  // Mensagens da Edge Function export-data. Sem estas, mapFriendly devolvia o
  // texto cru em ingles ("Unable to generate export") a um utilizador com a
  // interface em portugues.
  { match: /unable to generate export/i, key: "friendlyError.exportFailed" },
  { match: /export (not authorized|exceeds)/i, key: "friendlyError.exportFailed" },
  { match: /Edge Function returned a non-2xx/i, key: "friendlyError.serverError" },
  // `rpc_hr_ligar_conta` / `rpc_hr_revogar_conta` (20261120090000). Cada uma
  // pede uma acao diferente de quem esta a olhar, por isso tem mensagem
  // propria em vez de cair no generico "sem permissao" ou "duplicado".
  { match: /conta_ja_ligada_a_outra_pessoa/i, key: "hr.conta.erroJaLigadaAOutraPessoa" },
  { match: /pessoa_ja_tem_conta_activa/i, key: "hr.conta.erroPessoaJaTemConta" },
  { match: /conta_sem_membership_na_organizacao/i, key: "hr.conta.erroSemMembershipNaOrganizacao" },
  { match: /pessoa_sem_conta_activa/i, key: "hr.conta.erroSemContaActiva" },
  // `pessoas_afectacoes` (20261130060000). `afectacao_tem_horario_a_frente`
  // vem ANTES de `afectacao_sobreposta` so por serem prefixos distintos -- a
  // ordem entre estas duas nao importa, mas tem de vir antes de qualquer
  // padrao generico (`duplicate`, `forbidden`) que a apanhasse por engano.
  { match: /afectacao_tem_horario_a_frente/i, key: "friendlyError.afectacaoTemHorarioAFrente" },
  { match: /afectacao_sobreposta/i, key: "friendlyError.afectacaoSobreposta" },
  { match: /horario_sem_afectacao/i, key: "friendlyError.horarioSemAfectacao" },
  { match: /pessoas_local_id_e_derivado/i, key: "friendlyError.pessoasLocalIdDerivado" },
  // `pessoas_colocacao_organograma` (20261130080000): duas versoes vivas com
  // intervalos que se cruzam -- so um no de organograma vigora de cada vez.
  { match: /colocacao_organograma_sobreposta/i, key: "friendlyError.colocacaoOrganogramaSobreposta" },
  // `pessoas_horario_planeado` ganha historico (20261130190000): ALTERAR
  // fecha e abre outra, nunca toca no que ja passou; so `rpc_hr_planeado_corrigir`
  // mexe numa janela decorrida. As entradas mais especificas vem primeiro.
  { match: /horario_planeado_insercao_no_passado/i, key: "friendlyError.horarioPlaneadoInsercaoNoPassado" },
  { match: /horario_planeado_correccao_alvo_invalido/i, key: "friendlyError.horarioPlaneadoCorreccaoAlvoInvalido" },
  { match: /horario_planeado_correccao_ainda_em_vigor/i, key: "friendlyError.horarioPlaneadoCorreccaoAindaEmVigor" },
  { match: /horario_planeado_correccao_janela_diferente/i, key: "friendlyError.horarioPlaneadoCorreccaoJanelaDiferente" },
  { match: /horario_planeado_correccao_sem_permissao/i, key: "friendlyError.horarioPlaneadoCorreccaoSemPermissao" },
  { match: /horario_planeado_correccao_imutavel/i, key: "friendlyError.horarioPlaneadoCorreccaoImutavel" },
  { match: /horario_planeado_janela_decorrida/i, key: "friendlyError.horarioPlaneadoJanelaDecorrida" },
  { match: /horario_planeado_fecha_no_passado/i, key: "friendlyError.horarioPlaneadoFechaNoPassado" },
  { match: /horario_planeado_encolhe_inicio/i, key: "friendlyError.horarioPlaneadoEncolheInicio" },
  { match: /horario_planeado_altera_regra_em_curso/i, key: "friendlyError.horarioPlaneadoAlteraRegraEmCurso" },
  { match: /planeado_correccao_sem_motivo/i, key: "friendlyError.planeadoCorreccaoSemMotivo" },
  { match: /planeado_sem_permissao/i, key: "friendlyError.planeadoSemPermissao" },
  { match: /planeado_nao_corrigivel/i, key: "friendlyError.planeadoNaoCorrigivel" },
  { match: /planeado_nao_decorrido/i, key: "friendlyError.planeadoNaoDecorrido" },
  { match: /planeado_ja_corrigido/i, key: "friendlyError.planeadoJaCorrigido" },
  { match: /planeado_horas_invalidas/i, key: "friendlyError.planeadoHorasInvalidas" },
  { match: /planeado_inexistente/i, key: "friendlyError.planeadoInexistente" },
];

function mapFriendly(raw: string): string {
  if (!raw) return translate("friendlyError.unexpectedRetry");
  for (const { match, key } of FRIENDLY_MAP) {
    if (match.test(raw)) return translate(key);
  }
  return raw;
}

/**
 * Synchronous variant of `mapFriendly`, exported for callers that already
 * have a plain string and just need the `FRIENDLY_MAP` lookup (no Supabase
 * error-shape parsing, no `await`). Used by `sanitizeDbErrorForDisplay.ts` to
 * turn a recognized raw database error into the SAME specific friendly text
 * (e.g. "This record already exists.") that `getFriendlyErrorMessage` would
 * have produced, instead of duplicating the map.
 *
 * Returns the input unchanged when nothing in `FRIENDLY_MAP` matches — callers
 * that need a generic fallback in that case must supply their own, exactly
 * like `getFriendlyErrorMessage`'s callers already do.
 */
export function mapFriendlyErrorText(raw: string): string {
  return mapFriendly(raw);
}

/**
 * The generic fallback used when a raw error is recognized as technical but
 * has no specific entry in `FRIENDLY_MAP`. Exposed so `sanitizeDbErrorForDisplay.ts`
 * uses the exact same localized string as every other unmapped-error fallback
 * in the app, instead of inventing its own.
 */
export function getGenericFriendlyFallback(): string {
  return translate("friendlyError.unexpectedRetry");
}

export async function getFriendlyErrorMessage(
  error: unknown,
  fallback = translate("friendlyError.unexpected"),
): Promise<string> {
  if (!error) return fallback;

  // String
  if (typeof error === "string") return mapFriendly(error);

  const e = error as any;

  // Try to read Supabase FunctionsHttpError response body
  try {
    if (e?.context && typeof e.context.json === "function") {
      const body = await e.context.json();
      const msg = body?.error || body?.message;
      if (msg) return mapFriendly(String(msg));
    } else if (e?.context && typeof e.context.text === "function") {
      const txt = await e.context.text();
      if (txt) {
        try {
          const parsed = JSON.parse(txt);
          const msg = parsed?.error || parsed?.message;
          if (msg) return mapFriendly(String(msg));
        } catch {
          return mapFriendly(txt);
        }
      }
    }
  } catch {
    // ignore — fall back to message
  }

  // Plain object with error/message
  if (e?.error && typeof e.error === "string") return mapFriendly(e.error);
  if (e?.message) return mapFriendly(String(e.message));

  try {
    return mapFriendly(JSON.stringify(error));
  } catch {
    return fallback;
  }
}
