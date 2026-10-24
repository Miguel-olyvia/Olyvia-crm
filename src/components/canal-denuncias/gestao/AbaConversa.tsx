// Aba «Conversa»: as mensagens com o denunciante (também quando é anónimo), enviar mensagem e pedir mais informação.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { Campo } from "../comum/Campo";
import { ListaMensagens } from "../comum/ListaMensagens";
import { enviarMensagemA, pedirInformacaoEm } from "../dados/loja";
import { erroDe } from "../lib/acoes";
import { estaFechada } from "../lib/estados";
import type { Denuncia } from "../lib/tipos";

export function AbaConversa({ d }: { d: Denuncia }) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const executar = (fazer: (id: string, texto: string) => ReturnType<typeof enviarMensagemA>): void => {
    const r = fazer(d.id, texto);
    const e = erroDe(r);
    setErro(e ? t(`cd.erroAcao.${e}`) : null);
    if (r.ok) setTexto("");
  };

  return (
    <div className="space-y-4">
      {d.anonima && <p role="note" className="text-xs text-muted-foreground">{t("cd.conversa.anonimaNota")}</p>}
      <ListaMensagens mensagens={d.mensagens} perspetiva="gestao" />
      {estaFechada(d.estado) ? (
        <p className="text-sm text-muted-foreground">{t("cd.conversa.fechada")}</p>
      ) : (
        <div className="space-y-3 border-t pt-4">
          <Campo id="den-mensagem" rotulo={t("cd.conversa.escrever")} erro={erro ?? undefined}>
            {(a) => <Textarea {...a} rows={3} value={texto} onChange={(e) => { setTexto(e.target.value); setErro(null); }} />}
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={() => executar(enviarMensagemA)}>{t("cd.conversa.enviar")}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={d.estado !== "em_analise"} onClick={() => executar(pedirInformacaoEm)}>
              {t("cd.conversa.pedirInfo")}
            </Button>
          </div>
          {d.estado === "recebida" && <p className="text-xs text-muted-foreground">{t("cd.conversa.confirmaPrimeiro")}</p>}
        </div>
      )}
    </div>
  );
}
