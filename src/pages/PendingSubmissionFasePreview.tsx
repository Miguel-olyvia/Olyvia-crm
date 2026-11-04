// CRM (4/11): num envio por resolver, o que passa a ser pré-preenchido no negócio se se carregar em «Criar negócio»: as respostas dos
// campos do formulário ligados a perguntas de fase (tabela form_field_phase_links, lida por neg_sugestoes_submissoes), já traduzidas para as opções da pergunta.
// Só mostra: nada se escreve aqui. Ligar e ignorar não pré-preenchem nada. Best-effort: qualquer erro deixa a página como estava.
import type { SupabaseClient } from "@supabase/supabase-js";
import { camposAjustados, type CfgCampos } from "@/emylia/campos";
import { lerCamposConfigBase, GRUPOS_AJUSTAVEIS } from "@/emylia/real/camposConfig";
import { normalizarTexto, traduzirSugestao, type SugestaoBase } from "@/emylia/sugestoesForm";
import { useTranslation } from "@/hooks/useTranslation";

/** A função ainda não existe na base (PGRST202 / 42883): sem sugestões, sem aviso. */
const semFuncaoOuColuna = (e: { code?: string } | null | undefined): boolean => !!e && (e.code === "PGRST202" || e.code === "42883");

const S = "pessoasPagina.submissoes.fase.";
/** A função recusa mais de 200 submissões por chamada. */
const MAX_SUBMISSOES = 200;

export interface SugestoesFase {
  cfg: CfgCampos;
  porSubmissao: Record<string, SugestaoBase[]>;
}
const VAZIO: SugestoesFase = { cfg: {}, porSubmissao: {} };
/** O excesso avisa-se uma vez por sessão: a fila relê-se a cada envio resolvido. */
let avisouExcesso = false;

/** Lê a configuração das perguntas e as sugestões das submissões. Qualquer erro (função em falta, sem permissão, rede) devolve «nada a mostrar». */
export async function carregarSugestoesFase(sb: SupabaseClient, organizationId: string, submissoes: string[]): Promise<SugestoesFase> {
  if (submissoes.length > MAX_SUBMISSOES && !avisouExcesso) {
    avisouExcesso = true;
    console.warn(`[submissões] só as ${MAX_SUBMISSOES} primeiras mostram o que pré-preenche o negócio (há ${submissoes.length}).`);
  }
  const ids = submissoes.slice(0, MAX_SUBMISSOES);
  if (ids.length === 0) return VAZIO;
  try {
    // em paralelo: a configuração das perguntas não depende das sugestões (e uma falha dela não derruba a página)
    const [sugestoes, config] = await Promise.all([
      // `as never`: as funções estão fora dos tipos gerados nas bases que ainda não as têm
      sb.rpc("neg_sugestoes_submissoes" as never, { p_org: organizationId, p_submissoes: ids } as never),
      lerCamposConfigBase(sb, organizationId).catch(() => null),
    ]);
    if (sugestoes.error) {
      if (!semFuncaoOuColuna(sugestoes.error as { code?: string })) console.warn("[submissões] o que pré-preenche o negócio não carregou:", (sugestoes.error as { message?: string }).message);
      return VAZIO;
    }
    if (!Array.isArray(sugestoes.data) || sugestoes.data.length === 0 || !config) return VAZIO;
    const campos = config.campos;
    const porSubmissao: Record<string, SugestaoBase[]> = {};
    for (const s of sugestoes.data as SugestaoBase[]) {
      if (!s || typeof s.submissao_id !== "string" || typeof s.grupo !== "string" || typeof s.chave !== "string") continue;
      (porSubmissao[s.submissao_id] ??= []).push(s);
    }
    return { cfg: campos, porSubmissao };
  } catch (e) {
    console.warn("[submissões] o que pré-preenche o negócio não carregou:", (e as Error).message);
    return VAZIO;
  }
}

interface Linha { chave: string; pergunta: string; valor: string | null; neutra: boolean }

/** Uma linha por pergunta (a primeira sugestão ganha). Perguntas que já não existem ou estão escondidas não aparecem. */
export function linhasDaSubmissao(sugestoes: readonly SugestaoBase[], cfg: CfgCampos): Linha[] {
  const linhas: Linha[] = [];
  for (const s of sugestoes) {
    if (linhas.some((l) => l.chave === s.chave)) continue;
    const g = GRUPOS_AJUSTAVEIS.find((x) => x.titulo === s.grupo);
    const def = g ? camposAjustados(cfg, g).find((c) => c.k === s.chave) : undefined;
    // uma pergunta escondida, ou de um grupo escondido, não aparece (nem como linha «por responder»): a tradução devolve null para ela
    if (!def || def.escondido || cfg[s.grupo]?.oculto) continue;
    const valor = traduzirSugestao(s, cfg);
    const noOutro = valor !== null && valor.split(",").some((x) => normalizarTexto(x) === "outro");
    linhas.push({ chave: s.chave, pergunta: def.l, valor, neutra: valor === null || noOutro });
  }
  return linhas;
}

export function PendingSubmissionFasePreview({ sugestoes, cfg }: { sugestoes: readonly SugestaoBase[]; cfg: CfgCampos }) {
  const { t } = useTranslation();
  const linhas = linhasDaSubmissao(sugestoes, cfg);
  if (linhas.length === 0) return null;
  return (
    <div role="group" aria-label={t(`${S}title`)} className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
      <p className="text-xs font-medium">{t(`${S}title`)}</p>
      <p className="text-xs text-muted-foreground">{t(`${S}note`)}</p>
      <ul className="space-y-0.5">
        {linhas.map((l) => (
          <li key={l.chave} className={`text-xs ${l.neutra ? "text-muted-foreground" : ""}`}>
            <span className="text-muted-foreground">{l.pergunta}: </span>
            <span className={l.neutra ? "" : "font-medium"}>{l.valor ?? t(`${S}none`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
