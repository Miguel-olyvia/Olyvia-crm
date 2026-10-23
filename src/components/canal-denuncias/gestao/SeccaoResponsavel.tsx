// Atribuir o responsável e declarar conflitos de interesses. Quem é visado pela denúncia, ou declarou conflito, não pode
// ficar com o caso: a escolha é recusada com um aviso, e a loja recusa-a também.
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "@/hooks/useTranslation";
import { RESPONSAVEIS, nomeDoResponsavel } from "../dados/exemplo";
import { atribuirA, declararConflitoDe } from "../dados/loja";
import { erroDe } from "../lib/acoes";
import { motivoDeBloqueio } from "../lib/conflito";
import type { Denuncia } from "../lib/tipos";

const LIGADOS = (d: Denuncia): string[] => Array.from(new Set([...d.denunciados, ...d.conflitos]));

export function SeccaoResponsavel({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const [escolhido, setEscolhido] = useState("");
  const [conflito, setConflito] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const atribuir = (): void => {
    if (!escolhido) return;
    const r = atribuirA(d.id, escolhido);
    const e = erroDe(r);
    setAviso(e ? t(`cd.erroAcao.${e}`, { nome: nomeDoResponsavel(escolhido) ?? "" }) : null);
    if (r.ok) setEscolhido("");
  };

  const declarar = (): void => {
    if (!conflito) return;
    declararConflitoDe(d.id, conflito);
    setConflito("");
  };

  const etiqueta = (id: string, nome: string): string => {
    const m = motivoDeBloqueio(d, id);
    return m ? `${nome} (${t(`cd.conflito.${m}`)})` : nome;
  };

  return (
    <section aria-labelledby="den-responsavel" className="space-y-3 rounded-lg border bg-card p-4">
      <h3 id="den-responsavel" className="text-sm font-semibold">{t("cd.responsavel.titulo")}</h3>
      <p className="text-sm">{nomeDoResponsavel(d.responsavelId) ?? <span className="text-muted-foreground">{t("cd.semResponsavel")}</span>}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="den-atribuir" className="sr-only">{t("cd.responsavel.escolher")}</label>
        <div className="min-w-[12rem] flex-1">
          <NativeSelect id="den-atribuir" className="h-11" value={escolhido} placeholder={t("cd.responsavel.escolher")}
            options={RESPONSAVEIS.map((r) => ({ value: r.id, label: etiqueta(r.id, r.nome) }))} onValueChange={(v) => { setEscolhido(v); setAviso(null); }} />
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={atribuir}>{t("cd.responsavel.atribuir")}</Button>
      </div>
      {aviso && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{aviso}
        </p>
      )}
      <div className="space-y-2 border-t pt-3">
        <h4 className="text-sm font-medium">{t("cd.conflito.titulo")}</h4>
        <p className="text-xs text-muted-foreground">{t("cd.conflito.aviso")}</p>
        {LIGADOS(d).length > 0 && (
          <p className="text-sm">{t("cd.conflito.lista", { nomes: LIGADOS(d).map((id) => etiqueta(id, nomeDoResponsavel(id) ?? id)).join(", ") })}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="den-conflito" className="sr-only">{t("cd.conflito.escolher")}</label>
          <div className="min-w-[12rem] flex-1">
            <NativeSelect id="den-conflito" className="h-11" value={conflito} placeholder={t("cd.conflito.escolher")}
              options={RESPONSAVEIS.map((r) => ({ value: r.id, label: r.nome }))} onValueChange={setConflito} />
          </div>
          <Button type="button" variant="outline" className="min-h-11" onClick={declarar}>{t("cd.conflito.declarar")}</Button>
        </div>
      </div>
    </section>
  );
}
