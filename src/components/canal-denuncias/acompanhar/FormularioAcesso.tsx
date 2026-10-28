// Acompanhar, passo 1: código e PIN. Se não corresponderem, a mensagem é a mesma e não diz qual dos dois falhou.
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { useExecutar } from "../comum/useExecutar";
import { useFonte } from "../dados/fonte";

interface FormularioAcessoProps {
  onAcesso: (id: string) => void;
  /** Dentro da app: só se abrem denúncias desta organização (a ativa). Sem isto, vale qualquer código (página pública). */
  organizacaoId?: string;
  /** Página pública: o `?org=` do canal onde a denúncia foi feita. */
  slugPublico?: string;
  /** Um código já preenchido (p.ex. um dos guardados nesta sessão); o PIN escreve-se sempre à mão. */
  codigoInicial?: string;
}

export function FormularioAcesso({ onAcesso, organizacaoId, slugPublico, codigoInicial = "" }: FormularioAcessoProps) {
  const { t } = useTranslation();
  const fonte = useFonte();
  const { pendente, executar } = useExecutar();
  const [codigo, setCodigo] = useState(codigoInicial);
  const [pin, setPin] = useState("");
  const [falhou, setFalhou] = useState<"invalido" | "indisponivel" | "limite" | null>(null);

  const entrar = async (): Promise<void> => {
    const r = await executar(() => fonte.entrar({ codigo, pin, organizacaoId, slug: slugPublico }));
    if (r.ok && "id" in r) {
      setPin("");
      onAcesso(r.id);
    } else {
      setFalhou("erro" in r && (r.erro === "indisponivel" || r.erro === "limite") ? r.erro : "invalido");
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); entrar(); }}
      aria-label={t("cd.acomp.formulario")}
      className="space-y-4 rounded-lg border bg-card p-5"
    >
      <div>
        <h2 className="text-xl font-semibold">{t("cd.acomp.titulo")}</h2>
        <p className="text-sm text-muted-foreground">{t("cd.acomp.intro")}</p>
      </div>
      {falhou && (
        <p id="acomp-erro" role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t(falhou === "indisponivel" ? "cd.acomp.indisponivel" : falhou === "limite" ? "cd.acomp.limite" : "cd.acomp.erro")}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="acomp-codigo" rotulo={t("cd.conf.codigo")} ajuda={t("cd.acomp.ajudaCodigo")}>
          {(a) => (
            <Input {...a} autoComplete="off" spellCheck={false} className="font-mono uppercase" value={codigo}
              aria-describedby={[a["aria-describedby"], falhou ? "acomp-erro" : null].filter(Boolean).join(" ") || undefined}
              onChange={(e) => { setCodigo(e.target.value); setFalhou(null); }} />
          )}
        </Campo>
        <Campo id="acomp-pin" rotulo={t("cd.conf.pin")} ajuda={t("cd.acomp.ajudaPin")}>
          {(a) => (
            <Input {...a} type="password" inputMode="numeric" autoComplete="off" maxLength={6} className="font-mono" value={pin}
              aria-describedby={[a["aria-describedby"], falhou ? "acomp-erro" : null].filter(Boolean).join(" ") || undefined}
              onChange={(e) => { setPin(e.target.value); setFalhou(null); }} />
          )}
        </Campo>
      </div>
      <Button type="submit" className="min-h-11" disabled={pendente}>{t("cd.acomp.ver")}</Button>
    </form>
  );
}
