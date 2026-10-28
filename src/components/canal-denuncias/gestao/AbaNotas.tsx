// Aba «Notas internas»: só o responsável do canal as vê; o denunciante nunca.
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { erroDoResultado, useExecutar } from "../comum/useExecutar";
import { useFonte } from "../dados/fonte";
import type { ErroAcao } from "../lib/acoes";
import { dataHora } from "../lib/datas";
import type { Denuncia } from "../lib/tipos";

export function AbaNotas({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const fonte = useFonte();
  const { pendente, executar } = useExecutar();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<ErroAcao | null>(null);

  const adicionar = async (): Promise<void> => {
    const r = await executar(() => fonte.notaEm(d.id, texto));
    setErro(erroDoResultado(r));
    if (r.ok) setTexto("");
  };

  return (
    <div className="space-y-4">
      <p role="note" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />{t("cd.notas.privadas")}
      </p>
      {d.notas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("cd.notas.vazia")}</p>
      ) : (
        <ul className="space-y-2">
          {d.notas.map((n) => (
            <li key={n.id} className="rounded-md border bg-card p-3 text-sm">
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{n.quem}</span> · {dataHora(n.em)}</p>
              <p className="whitespace-pre-line break-words">{n.texto}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 border-t pt-4">
        <Campo id="den-nota" rotulo={t("cd.notas.escrever")} erro={erro ? t(`cd.erroAcao.${erro}`) : undefined}>
          {(a) => <Textarea {...a} rows={3} value={texto} onChange={(e) => { setTexto(e.target.value); setErro(null); }} />}
        </Campo>
        <Button type="button" className="min-h-11" disabled={pendente} onClick={adicionar}>{t("cd.notas.adicionar")}</Button>
      </div>
    </div>
  );
}
