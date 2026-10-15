// A identidade de quem denuncia. Anónima: «Identidade desconhecida», sem nada para mostrar. Identificada: protegida até
// o responsável do canal carregar em «Ver identidade», o que fica registado no histórico (quem e quando).
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { verIdentidade } from "../dados/loja";
import { estadoDaIdentidade, identidadeVisivel } from "../lib/anonimizacao";
import type { Denuncia } from "../lib/tipos";

export function SeccaoIdentidade({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const [revelada, setRevelada] = useState(false);
  const estado = estadoDaIdentidade(d, revelada);
  const identidade = identidadeVisivel(d, revelada);

  const ver = (): void => {
    if (verIdentidade(d.id)) setRevelada(true);
  };

  return (
    <section aria-labelledby="den-identidade" className="space-y-2 rounded-lg border bg-card p-4">
      <h3 id="den-identidade" className="flex items-center gap-2 text-sm font-semibold">
        {estado === "desconhecida" ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
        {t(`cd.identidade.${estado}`)}
      </h3>
      {estado === "desconhecida" && <p className="text-sm text-muted-foreground">{t("cd.identidade.desconhecidaTexto")}</p>}
      {estado === "protegida" && (
        <>
          <p className="text-sm text-muted-foreground">{t("cd.identidade.protegidaTexto")}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={ver}>
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("cd.identidade.ver")}
          </Button>
        </>
      )}
      {identidade && (
        <>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">{t("cd.campo.nome")}</dt><dd>{identidade.nome || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("cd.campo.email")}</dt><dd>{identidade.email || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("cd.campo.telefone")}</dt><dd>{identidade.telefone || "—"}</dd></div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("cd.campo.podemContactar")}</dt>
              <dd>{identidade.podemContactar ? t("cd.sim") : t("cd.nao")}</dd>
            </div>
          </dl>
          <p role="status" className="text-xs text-muted-foreground">{t("cd.identidade.registada")}</p>
        </>
      )}
    </section>
  );
}
