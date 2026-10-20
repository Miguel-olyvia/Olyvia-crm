import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { chaveErroWorkflow } from "@/hooks/pessoas/workflow/errosWorkflow";
import type { RuleGroup } from "@/hooks/pessoas/workflow/regrasQualificacao";
import type { RegrasQualificacaoHook } from "@/hooks/pessoas/workflow/useRegrasQualificacao";
import { useTranslation } from "@/hooks/useTranslation";
import { EditorCondicoes } from "./EditorCondicoes";

const W = "pessoasPagina.real.workflow.";

type Aviso = "guardadas" | "semAlteracoes";
interface Edicao {
  mql: RuleGroup | null;
  sql: RuleGroup | null;
}

/**
 * O separador «Qualificação»: as regras MQL e SQL da organização (as duas listas de Leads), e «Guardar», que escreve só pela função da
 * base (via o hook). Sem tocar em nada também se pode guardar: se a base diz que não mudou, avisa «sem alterações». Enquanto grava, o
 * botão fica `aria-disabled` (continua focável, por isso o foco não se perde) e as caixas bloqueadas; um duplo clique dá um só pedido.
 * O resultado e o erro vão para regiões que o leitor de ecrã anuncia; o que o utilizador marcou fica no ecrã depois de um erro.
 */
export function QualificacaoSeparador({ regras }: { regras: RegrasQualificacaoHook }) {
  const { t } = useTranslation();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // O estado só muda no render seguinte: a referência é o que trava o segundo clique.
  const emCurso = useRef(false);
  const dados = regras.dados;

  if (!dados) {
    if (regras.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t(`${W}qual.loading`)}</p>;
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <p>{t(`${W}qual.loadError`)}</p>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={regras.recarregar}>{t(`${W}qual.retry`)}</Button>
      </div>
    );
  }

  const atual: Edicao = edicao ?? { mql: dados.mql, sql: dados.sql };
  const aGuardar = ocupado || regras.aGuardar;
  const mudar = (seguinte: Edicao) => {
    setEdicao(seguinte);
    setAviso(null);
    setErro(null);
  };
  const guardar = async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    setOcupado(true);
    setAviso(null);
    setErro(null);
    try {
      const resultado = await regras.guardar(atual.mql, atual.sql);
      // Com as regras de depois, o ecrã passa a mostrar o que a base tem (já está na cache); sem elas fica o que se enviou até reler.
      if (resultado.depois) setEdicao(null);
      setAviso(resultado.mudou ? "guardadas" : "semAlteracoes");
    } catch (e) {
      setErro(chaveErroWorkflow(e));
    } finally {
      emCurso.current = false;
      setOcupado(false);
    }
  };
  const mensagem = aGuardar ? t(`${W}qual.saving`) : aviso === "guardadas" ? t(`${W}qual.saved`) : aviso === "semAlteracoes" ? t(`${W}qual.unchanged`) : "";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t(`${W}qual.intro`)}</p>
      {dados.descartadas > 0 && (
        <p role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t(`${W}qual.dropped`, { n: dados.descartadas })}</p>
      )}
      <EditorCondicoes
        tom="mql" idBase="mql" titulo={t(`${W}qual.mql.title`)} descricao={t(`${W}qual.mql.hint`)} valor={atual.mql}
        aoMudar={(mql) => mudar({ ...atual, mql })} desativado={aGuardar}
      />
      <EditorCondicoes
        tom="sql" idBase="sql" titulo={t(`${W}qual.sql.title`)} descricao={t(`${W}qual.sql.hint`)} valor={atual.sql}
        aoMudar={(sql) => mudar({ ...atual, sql })} desativado={aGuardar}
      />
      {erro && (
        <div role="alert" className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">{t(`${W}error.title`)}</p>
          <p>{t(erro)}</p>
        </div>
      )}
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{mensagem}</p>
      <Button
        type="button" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-busy={aGuardar || undefined} aria-disabled={aGuardar || undefined}
        onClick={() => void guardar()}
      >
        {aGuardar ? t(`${W}qual.saving`) : t(`${W}qual.save`)}
      </Button>
    </div>
  );
}
