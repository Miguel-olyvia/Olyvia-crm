// A conversa entre o responsável do canal e o denunciante. Quem lê escolhe a perspetiva: o denunciante vê «Tu»; o
// responsável vê «Denunciante», nunca um nome, mesmo numa denúncia identificada (a identidade só se vê no painel).
import { Paperclip } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { dataHora } from "../lib/datas";
import { formatoTamanho } from "../lib/formato";
import type { Mensagem } from "../lib/tipos";

interface ListaMensagensProps {
  mensagens: readonly Mensagem[];
  perspetiva: "gestao" | "denunciante";
}

export function ListaMensagens({ mensagens, perspetiva }: ListaMensagensProps) {
  const { t } = useTranslation();
  if (mensagens.length === 0) return <p className="text-sm text-muted-foreground">{t("cd.conversa.vazia")}</p>;
  return (
    <ol aria-label={t("cd.conversa.lista")} className="space-y-3">
      {mensagens.map((m) => {
        const minha = (perspetiva === "gestao") === (m.autor === "responsavel");
        const autor = m.autor === "responsavel" ? t("cd.conversa.responsavel") : perspetiva === "denunciante" ? t("cd.conversa.tu") : t("cd.conversa.denunciante");
        return (
          <li key={m.id} className={cn("flex", minha ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] space-y-1 rounded-lg border px-3 py-2 text-sm", minha ? "bg-primary/10" : "bg-card")}>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{autor}</span> · {dataHora(m.em)}
              </p>
              <p className="whitespace-pre-line break-words">{m.texto}</p>
              {m.anexos.map((a) => (
                <p key={a.nome} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Paperclip className="h-3 w-3" aria-hidden="true" />
                  {a.nome} · {formatoTamanho(a.tamanho)}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
