// O ecrã de configuração do efeito no orçamento: por pergunta («Afeta o orçamento?» e o campo da Emylia a que se liga) e por opção de resposta (o que
// acrescenta quando é a escolhida). Só edita o rascunho do questionário; quem aplica o efeito ao orçamento é a Emylia, na visita (visitaConfiguravel/).
// Sem valores por omissão: um efeito por preencher não deixa guardar (validação em questionarioEdicao.ts).
import { Plus, Trash2 } from "lucide-react";
import { FOCO } from "@/components/negocio-metas/estilos";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { camposLigaveis, campoLigavel } from "@/hooks/pessoas/workflow/camposEmylia";
import {
  criarItemEfeito, LIMITES_EFEITO, MODOS_EFEITO, problemaDoItem, TIPOS_ITEM_EFEITO, type ItemEfeitoEd, type ModoEfeito, type TipoItemEfeito,
} from "@/hooks/pessoas/workflow/efeitosQuestionario";
import { ehEscolha, type OpcaoEd, type PerguntaEd } from "@/hooks/pessoas/workflow/questionario";
import { alterarOpcao, alterarPergunta } from "@/hooks/pessoas/workflow/questionarioEdicao";
import { useTranslation } from "@/hooks/useTranslation";
import { BotaoIcone, BotaoTexto, Campo, W, type ContextoEditor } from "./LevantamentoPecas";

const E = `${W}lev.efeito.`;

/**
 * Os controlos de efeito só aparecem quando a base aceita, grava e devolve estes campos. Hoje o rascunho supabase/rascunhos/NOVO-20261231998000_levantamento_efeitos.sql
 * está incompleto (faltam fn_neg_questionario_normalizar, neg_guardar_questionario e neg_questionario_levantamento) e a base devolve NG009 ao guardar; com os controlos
 * à vista a pessoa configuraria um efeito que não se grava. Passa a `true` NO MESMO DIA em que a migração completa for aplicada (migração e código juntos).
 */
export const EFEITOS_NA_BASE = true;

interface ItensProps {
  id: string;
  itens: readonly ItemEfeitoEd[];
  aoMudar: (itens: ItemEfeitoEd[]) => void;
  desativado: boolean;
  /** O que o leitor de ecrã ouve para o grupo («Efeito por cada unidade», «Efeito ao escolher X»). */
  rotulo: string;
}

/** A lista de efeitos (até 5) de uma opção ou, nas perguntas numéricas, por unidade. */
function ItensDoEfeito({ id, itens, aoMudar, desativado, rotulo }: ItensProps) {
  const { t } = useTranslation();
  const cheia = itens.length >= LIMITES_EFEITO.itens;
  const mudarItem = (i: number, patch: Partial<ItemEfeitoEd>) => aoMudar(itens.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const tipos = TIPOS_ITEM_EFEITO.map((tipo) => ({ value: tipo, label: t(`${E}tipo.${tipo}`) }));
  return (
    <div role="group" aria-label={rotulo} className="space-y-2">
      <p className="text-sm font-medium">{rotulo}</p>
      {itens.length === 0 && <p className="text-xs text-muted-foreground">{t(`${E}nenhumNaOpcao`)}</p>}
      <ul className="space-y-2">
        {itens.map((item, i) => {
          const n = i + 1;
          const problema = problemaDoItem(item);
          const base = `${id}-${n}`;
          return (
            <li key={base} className="space-y-2 rounded-md border bg-background/60 p-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`${base}-tipo`} className="text-sm">{t(`${E}tipo`)}</Label>
                  <NativeSelect
                    id={`${base}-tipo`} options={tipos} value={item.tipo} disabled={desativado} className={FOCO}
                    onValueChange={(v) => mudarItem(i, { tipo: v as TipoItemEfeito })}
                  />
                </div>
                <div className="min-w-48 flex-1">
                  <Campo id={`${base}-motivo`} rotulo={t(`${E}motivo`)} valor={item.descricao} desativado={desativado} invalido={problema !== null && item.descricao.trim() === ""} aoMudar={(descricao) => mudarItem(i, { descricao })} />
                </div>
                <BotaoIcone icone={Trash2} rotulo={t(`${E}remover`, { n })} inativo={desativado} aoClicar={() => aoMudar(itens.filter((_, j) => j !== i))} />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {item.tipo === "valor" && (
                  <>
                    <Campo id={`${base}-custo`} tipo="number" rotulo={t(`${E}custo`)} valor={item.custo} desativado={desativado} aoMudar={(custo) => mudarItem(i, { custo })} />
                    <Campo id={`${base}-preco`} tipo="number" rotulo={t(`${E}preco`)} valor={item.preco} desativado={desativado} aoMudar={(preco) => mudarItem(i, { preco })} />
                  </>
                )}
                {item.tipo === "horas" && (
                  <>
                    <Campo id={`${base}-horas`} tipo="number" rotulo={t(`${E}horas`)} valor={item.horas} desativado={desativado} aoMudar={(horas) => mudarItem(i, { horas })} />
                    <Campo id={`${base}-custoh`} tipo="number" rotulo={t(`${E}custoHora`)} valor={item.custoHora} desativado={desativado} aoMudar={(custoHora) => mudarItem(i, { custoHora })} />
                    <Campo id={`${base}-precoh`} tipo="number" rotulo={t(`${E}precoHora`)} valor={item.precoHora} desativado={desativado} aoMudar={(precoHora) => mudarItem(i, { precoHora })} />
                  </>
                )}
                {item.tipo === "percentagem" && (
                  <Campo id={`${base}-pct`} tipo="number" rotulo={t(`${E}pct`)} valor={item.pct} desativado={desativado} aoMudar={(pct) => mudarItem(i, { pct })} />
                )}
              </div>
              {problema && <p role="alert" className="text-xs text-destructive">{problema}</p>}
            </li>
          );
        })}
      </ul>
      <BotaoTexto id={`${id}-add`} icone={Plus} inativo={desativado || cheia} aoClicar={() => aoMudar([...itens, criarItemEfeito()])}>{t(`${E}adicionar`)}</BotaoTexto>
      {cheia && <p className="text-xs text-muted-foreground">{t(`${E}cheio`, { max: LIMITES_EFEITO.itens })}</p>}
    </div>
  );
}

/** Na pergunta: o campo da Emylia a que se liga, se afeta o orçamento e (numéricas) o efeito por unidade. */
export function LevantamentoEfeito({ pergunta, ctx }: { pergunta: PerguntaEd; ctx: ContextoEditor }) {
  const { t } = useTranslation();
  if (!EFEITOS_NA_BASE) return null;
  const k = pergunta.k;
  const modo = pergunta.efeitoModo ?? "";
  const mudar = (patch: Partial<PerguntaEd>) => ctx.mudar((s) => alterarPergunta(s, k, patch));
  const campos = camposLigaveis();
  const opcoesCampo = [{ value: "", label: t(`${E}campoNenhum`) }, ...campos.map((c) => ({ value: c.k, label: `${c.rotulo} (${c.k})` }))];
  // um campo que a Emylia já não tem continua à vista (nunca desaparece em silêncio)
  const campoAtual = pergunta.campoEmylia ?? "";
  if (campoAtual !== "" && !campos.some((c) => c.k === campoAtual)) opcoesCampo.push({ value: campoAtual, label: campoAtual });
  const opcoesModo = [
    { value: "", label: t(`${E}modo.omissao`) },
    ...MODOS_EFEITO.map((m) => ({ value: m, label: t(`${E}modo.${m}`) })),
  ];
  return (
    <div role="group" aria-label={t(`${E}titulo`)} className="space-y-3 rounded-md border border-dashed p-3">
      <div className="space-y-1">
        <Label htmlFor={`lev-${k}-campoemylia`} className="text-sm">{t(`${E}campo`)}</Label>
        <NativeSelect
          id={`lev-${k}-campoemylia`} options={opcoesCampo} value={campoAtual} disabled={ctx.desativado} className={FOCO}
          onValueChange={(campoEmylia) => mudar({ campoEmylia })}
        />
        <p className="text-xs text-muted-foreground">{t(`${E}campoAjuda`)}</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`lev-${k}-efeitomodo`} className="text-sm">{t(`${E}titulo`)}</Label>
        <NativeSelect
          id={`lev-${k}-efeitomodo`} options={opcoesModo} value={modo} disabled={ctx.desativado} className={FOCO}
          onValueChange={(v) => mudar({ efeitoModo: v === "" ? "" : (v as ModoEfeito) })}
        />
      </div>
      {modo === "proprio" && pergunta.tipo === "numero" && (
        <ItensDoEfeito
          id={`lev-${k}-efeito`} itens={pergunta.efeito ?? []} desativado={ctx.desativado} rotulo={t(`${E}porUnidade`)}
          aoMudar={(efeito) => mudar({ efeito })}
        />
      )}
    </div>
  );
}

/** Na opção de uma pergunta de escolha: o valor que tem no campo da Emylia e o efeito de a escolher (só com o modo «próprio»). */
export function LevantamentoEfeitoOpcao({ pergunta, opcao, ctx, n }: { pergunta: PerguntaEd; opcao: OpcaoEd; ctx: ContextoEditor; n: number }) {
  const { t } = useTranslation();
  if (!EFEITOS_NA_BASE || !ehEscolha(pergunta.tipo)) return null;
  const campo = campoLigavel(pergunta.campoEmylia ?? "");
  const proprio = pergunta.efeitoModo === "proprio";
  if (!campo && !proprio) return null;
  const mudar = (patch: Partial<Pick<OpcaoEd, "valorEmylia" | "efeito">>) => ctx.mudar((s) => alterarOpcao(s, pergunta.k, opcao.k, patch));
  const valorAtual = opcao.valorEmylia ?? "";
  const valores = [{ value: "", label: t(`${E}semValor`) }, ...(campo?.valores ?? []).map((v) => ({ value: v, label: v }))];
  if (valorAtual !== "" && !valores.some((v) => v.value === valorAtual)) valores.push({ value: valorAtual, label: valorAtual });
  const nome = opcao.texto.trim() || String(n);
  return (
    <div className="w-full space-y-2 border-t pt-2">
      {campo && (
        <div className="space-y-1">
          <Label htmlFor={`lev-${opcao.k}-valoremylia`} className="text-sm">{t(`${E}valorEmylia`)}</Label>
          <NativeSelect
            id={`lev-${opcao.k}-valoremylia`} options={valores} value={valorAtual} disabled={ctx.desativado} className={FOCO}
            onValueChange={(valorEmylia) => mudar({ valorEmylia })}
          />
        </div>
      )}
      {proprio && (
        <ItensDoEfeito
          id={`lev-${opcao.k}-efeito`} itens={opcao.efeito ?? []} desativado={ctx.desativado} rotulo={t(`${E}opcao`, { nome })}
          aoMudar={(efeito) => mudar({ efeito })}
        />
      )}
    </div>
  );
}
