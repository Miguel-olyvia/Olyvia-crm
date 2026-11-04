import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { efetivo, type CfgCampos, type Def } from "@/emylia/campos";
import {
  opcoesRegra, REGRAS_EFEITO, regraLigada, valorParam, type CfgEfeitos, type ParamEfeito, type RegraEfeito,
} from "@/emylia/efeitosLevantamento";
import { GRUPOS_AJUSTAVEIS } from "@/emylia/real/camposConfig";
import type { CamposConfigHook } from "@/hooks/pessoas/workflow/useCamposConfig";
import { useTranslation } from "@/hooks/useTranslation";
import { W } from "./LevantamentoPecas";

const E = `${W}efc.`;

export const efeitosSujos = (rascunho: CfgEfeitos | null, gravado: CfgEfeitos | null | undefined): boolean =>
  rascunho !== null && JSON.stringify(rascunho) !== JSON.stringify(gravado ?? {});

/** O campo da regra como a organização o tem (nome e opções ajustados). */
export function campoDaRegra(campos: CfgCampos, r: RegraEfeito): Def | undefined {
  for (const g of GRUPOS_AJUSTAVEIS) {
    const c = efetivo(campos, g).campos.find((x) => x.k === r.campo) ?? g.campos.find((x) => x.k === r.campo);
    if (c) return c;
  }
  return undefined;
}
const opcoesDoCampo = (c: Def | undefined): string[] => (c?.t === "sim_nao" ? ["Sim", "Não"] : c?.op ?? []);

/** Muda uma regra no rascunho; um ajuste que fica vazio sai (volta ao de sempre). */
export function mudarRegra(cfg: CfgEfeitos, id: string, fn: (a: NonNullable<CfgEfeitos[string]>) => void): CfgEfeitos {
  const novo: CfgEfeitos = structuredClone(cfg);
  const a = (novo[id] ??= {});
  fn(a);
  if (a.v && Object.keys(a.v).length === 0) delete a.v;
  if (!a.off) delete a.off;
  if (Object.keys(a).length === 0) delete novo[id];
  return novo;
}

const fmt = (n: number) => String(n).replace(".", ",");

function Valor({ r, p, cfg, desativado, aoMudar }: { r: RegraEfeito; p: ParamEfeito; cfg: CfgEfeitos; desativado: boolean; aoMudar: (c: CfgEfeitos) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const v = valorParam(cfg, r.id, p.p);
  const mudado = cfg[r.id]?.v?.[p.p] !== undefined;
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id}>{p.l} ({p.un})</label>
      <input
        id={id} key={`${r.id}-${p.p}-${v}`} type="number" inputMode="decimal" min={0} step="any" defaultValue={v} disabled={desativado}
        aria-describedby={mudado ? `${id}-omissao` : undefined}
        className={cn("h-11 w-32 rounded-md border border-input bg-background px-3 text-sm", FOCO, mudado && "border-primary")}
        onBlur={(e) => {
          const txt = e.target.value.trim().replace(",", ".");
          const n = Number(txt);
          if (txt === "" || !Number.isFinite(n) || n < 0) { e.target.value = String(v); return; }
          if (n === v) return;
          const omissao = r.params.find((x) => x.p === p.p)!.v;
          aoMudar(mudarRegra(cfg, r.id, (a) => { a.v = { ...a.v }; if (n === omissao) delete a.v[p.p]; else a.v[p.p] = n; }));
        }}
      />
      {mudado && <span id={`${id}-omissao`} className="text-xs text-muted-foreground">{t(`${E}default`, { v: fmt(r.params.find((x) => x.p === p.p)!.v) })}</span>}
    </div>
  );
}

/**
 * 3/11 (Rúben): «customizar o impacto dos campos no orçamento, onde temos uma área para isso». A área é a do Levantamento (onde se
 * configura o efeito de cada pergunta): esta secção, por baixo do questionário, mostra as regras dos campos da Olyvia (REGRAS_EFEITO) com
 * os valores, as respostas a que se aplicam e um interruptor. O rascunho vive no diálogo; grava-se por «Guardar impacto»
 * (negocio_campos_config.efeitos). O orçamento e a nota ao lado do campo passam a usar o que estiver aqui.
 */
export function EfeitosCamposSeccao({ config, rascunho, aoMudar }: { config: CamposConfigHook; rascunho: CfgEfeitos | null; aoMudar: (c: CfgEfeitos | null) => void }) {
  const { t } = useTranslation();
  const [aviso, setAviso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!config.dados) return null;
  const gravado = config.dados.efeitos;
  const cfg = rascunho ?? gravado;
  const ocupado = config.aGuardar;
  const sujo = efeitosSujos(rascunho, gravado);
  const mudar = (c: CfgEfeitos) => { if (ocupado) return; setAviso(false); setErro(null); aoMudar(c); };
  const guardar = async () => {
    if (ocupado || !rascunho || !sujo) return;
    setErro(null);
    try {
      await config.guardar({ efeitos: rascunho });
      aoMudar(null);
      setAviso(true);
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <section aria-labelledby="efc-titulo" className="mt-8 space-y-4 border-t pt-6">
      <div className="space-y-1">
        <h3 id="efc-titulo" className="text-base font-semibold">{t(`${E}title`)}</h3>
        <p className="text-sm text-muted-foreground">{t(`${E}intro`)}</p>
      </div>
      <ul className="space-y-3">
        {REGRAS_EFEITO.map((r) => {
          const ligada = regraLigada(cfg, r.id);
          const campo = campoDaRegra(config.dados!.campos, r);
          const ops = opcoesDoCampo(campo);
          const escolhidas = opcoesRegra(cfg, r.id);
          return (
            <li key={r.id} className={cn("space-y-3 rounded-lg border p-3", !ligada && "bg-muted/40")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.nome}</p>
                  <p className="text-xs text-muted-foreground">{t(`${E}field`, { campo: campo?.l ?? r.campo })} · {r.como}</p>
                </div>
                <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <Switch
                    checked={ligada} disabled={ocupado} aria-label={t(`${E}on`, { nome: r.nome })} className={FOCO}
                    onCheckedChange={(on) => mudar(mudarRegra(cfg, r.id, (a) => { a.off = !on; }))}
                  />
                  {ligada ? t(`${E}onShort`) : t(`${E}offShort`)}
                </label>
              </div>
              {ligada && (r.params.length > 0 || r.quando) && (
                <div className="flex flex-wrap gap-4">
                  {r.params.map((p) => <Valor key={p.p} r={r} p={p} cfg={cfg} desativado={ocupado} aoMudar={mudar} />)}
                  {r.quando && ops.length > 0 && (
                    <fieldset className="grid gap-1 text-sm">
                      <legend className="mb-1">{t(`${E}ops`)}</legend>
                      <div className="flex flex-wrap gap-2">
                        {ops.map((o) => {
                          const on = escolhidas.includes(o);
                          return (
                            <button
                              key={o} type="button" aria-pressed={on} disabled={ocupado}
                              className={cn("inline-flex min-h-11 items-center rounded-md border px-3 text-sm", FOCO, on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background")}
                              onClick={() => mudar(mudarRegra(cfg, r.id, (a) => {
                                const novas = on ? escolhidas.filter((x) => x !== o) : [...escolhidas, o];
                                const omissao = r.quando!;
                                if (novas.length === omissao.length && novas.every((x) => omissao.includes(x))) delete a.ops; else a.ops = novas;
                              }))}
                            >
                              {o}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {erro && <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">{t(`${E}error`, { erro })}</p>}
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {ocupado ? t(`${E}saving`) : aviso ? t(`${E}saved`) : sujo ? t(`${E}unsaved`) : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-busy={ocupado || undefined} aria-disabled={ocupado || !sujo || undefined} onClick={() => void guardar()}>
          {ocupado ? t(`${E}saving`) : t(`${E}save`)}
        </Button>
        {sujo && <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} disabled={ocupado} onClick={() => { aoMudar(null); setAviso(false); }}>{t(`${E}discard`)}</Button>}
        {Object.keys(cfg).length > 0 && (
          <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} disabled={ocupado} onClick={() => mudar({})}>{t(`${E}reset`)}</Button>
        )}
      </div>
    </section>
  );
}
