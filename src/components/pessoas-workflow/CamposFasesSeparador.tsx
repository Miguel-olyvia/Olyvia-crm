import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import type { CfgCampos } from "@/emylia/campos";
import { EditorFases } from "@/emylia/CamposEditor";
import type { CamposConfigHook } from "@/hooks/pessoas/workflow/useCamposConfig";
import type { LigacaoFase } from "@/hooks/pessoas/workflow/useLigacoesFase";
import { useTranslation } from "@/hooks/useTranslation";
import { W } from "./LevantamentoPecas";

const C = `${W}campos.`;

/** Os ajustes mudaram em relação ao que está gravado (o rascunho nulo é «sem mudanças»). */
export const camposSujos = (rascunho: CfgCampos | null, gravado: CfgCampos | null | undefined): boolean =>
  rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(gravado ?? {});

/**
 * 3/11 (Rúben): o separador «Campos das fases» do Workflow de Pessoas. O admin ajusta os campos das fases do Negócio (nome, opções,
 * obrigatório, esconder, ordem e campos novos) com o editor da Emylia (EditorFases, CamposEditor.tsx), sobre um rascunho que vive no
 * diálogo (sobrevive à troca de separador e entra no aviso de alterações por gravar). Grava de uma vez por «Guardar campos».
 * Fica aqui, ao lado do «Levantamento», porque é o mesmo trabalho: decidir o que se pergunta ao cliente e quando.
 */
export function CamposFasesSeparador({ config, rascunho, aoMudar, ligacoes, ligacoesProntas }: { config: CamposConfigHook; rascunho: CfgCampos | null; aoMudar: (c: CfgCampos | null) => void; ligacoes?: LigacaoFase[]; ligacoesProntas?: boolean }) {
  const { t } = useTranslation();
  const [aviso, setAviso] = useState<"guardado" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const gravado = config.dados?.campos;
  const base = rascunho ?? gravado ?? null;
  // o editor muda o objeto que recebe (S.campos) e chama run: copia-se, e o rascunho passa a ser a cópia mudada
  const S = useMemo(() => ({ campos: structuredClone(base ?? {}) as CfgCampos, setor: undefined as string | undefined }), [base]);
  const ocupado = config.aGuardar;

  if (!config.dados) {
    if (config.estado !== "erro") return <p role="status" className="text-sm text-muted-foreground">{t(`${C}loading`)}</p>;
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <div className="space-y-1">
          <p>{t(`${C}loadError`)}</p>
          {config.erro && <p className="text-muted-foreground">{config.erro}</p>}
        </div>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={config.recarregar}>{t(`${C}retry`)}</Button>
      </div>
    );
  }

  const run = (fn: () => void) => {
    if (ocupado) return;
    fn();
    setAviso(null); setErro(null);
    aoMudar(S.campos ?? {});
  };
  const sujo = camposSujos(rascunho, gravado);
  const temAjustes = Object.keys(base ?? {}).length > 0;
  const guardar = async () => {
    if (ocupado || !rascunho) return;
    setErro(null);
    try {
      await config.guardar({ campos: rascunho });
      aoMudar(null);
      setAviso("guardado");
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t(`${C}intro`)}</p>
      <div className={cn(ocupado && "pointer-events-none opacity-60")} aria-busy={ocupado || undefined}>
        <EditorFases S={S} run={run} ligacoes={ligacoes} ligacoesProntas={ligacoesProntas} />
      </div>
      {erro && <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">{t(`${C}error`, { erro })}</p>}
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {ocupado ? t(`${C}saving`) : aviso === "guardado" ? t(`${C}saved`) : sujo ? t(`${C}unsaved`) : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-busy={ocupado || undefined} aria-disabled={ocupado || !sujo || undefined}
          onClick={() => void guardar()}
        >
          {ocupado ? t(`${C}saving`) : t(`${C}save`)}
        </Button>
        {sujo && <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} disabled={ocupado} onClick={() => { aoMudar(null); setAviso(null); }}>{t(`${C}discard`)}</Button>}
        {temAjustes && (
          <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} disabled={ocupado} title={t(`${C}reset.hint`)} onClick={() => run(() => { S.campos = {}; })}>
            {t(`${C}reset`)}
          </Button>
        )}
      </div>
    </div>
  );
}
