// A identidade de quem denuncia. Anónima: «Identidade desconhecida», sem nada para mostrar. Identificada: protegida até
// o responsável do canal carregar em «Ver identidade», o que fica registado no histórico (quem e quando).
import { useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { erroDoResultado, useExecutar } from "../comum/useExecutar";
import { useFonte } from "../dados/fonte";
import type { EstadoIdentidade } from "../lib/anonimizacao";
import type { ErroAcao } from "../lib/acoes";
import type { Denuncia, Identidade } from "../lib/tipos";

export function SeccaoIdentidade({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const fonte = useFonte();
  const { pendente, executar } = useExecutar();
  // A identidade nunca vem com a denúncia: só chega como resposta a «Ver identidade», com motivo, e só vive neste estado.
  const [identidade, setIdentidade] = useState<Identidade | null>(null);
  const [aPedir, setAPedir] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<ErroAcao | null>(null);
  const estado: EstadoIdentidade = d.anonima ? "desconhecida" : identidade ? "revelada" : "protegida";

  const fechar = (): void => { setAPedir(false); setMotivo(""); setErro(null); };
  const ver = async (): Promise<void> => {
    const r = await executar(() => fonte.verIdentidade(d.id, motivo));
    if (r.ok && "identidade" in r) {
      setIdentidade(r.identidade);
      fechar();
    } else {
      setErro(erroDoResultado(r));
    }
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
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setAPedir(true)}>
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
      <Dialog open={aPedir} onOpenChange={(aberto) => !aberto && fechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cd.identidade.motivoTitulo")}</DialogTitle>
            <DialogDescription>{t("cd.identidade.motivoExplica")}</DialogDescription>
          </DialogHeader>
          <Campo id="den-identidade-motivo" rotulo={t("cd.identidade.motivo")} obrigatorio erro={erro ? t(`cd.erroAcao.${erro}`) : undefined}>
            {(a) => <Textarea {...a} rows={3} value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} />}
          </Campo>
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={fechar}>{t("cd.identidade.cancelar")}</Button>
            <Button type="button" className="min-h-11" disabled={pendente} onClick={ver}>{t("cd.identidade.confirmar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
