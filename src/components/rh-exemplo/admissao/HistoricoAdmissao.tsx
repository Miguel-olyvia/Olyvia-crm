// O histórico da admissão: cada transição com quem, quando e (se houve) o motivo, do mais recente para o mais antigo.
import { History } from "lucide-react";
import type { EventoAdmissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { formatarDataHora } from "@/components/rh-exemplo/lib/conviteAdmissaoEcra";
import { useTranslation } from "@/hooks/useTranslation";

export function HistoricoAdmissao({ eventos }: { eventos: EventoAdmissao[] }) {
  const { t } = useTranslation();
  const recentesPrimeiro = [...eventos].reverse();
  return (
    <details className="group rounded-md border" open>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm font-medium">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t("rhAdm.historico.titulo")} ({eventos.length})
      </summary>
      <ol className="space-y-2 border-t px-3 py-2">
        {recentesPrimeiro.map((e) => (
          <li key={e.id} className="text-sm">
            <p>
              <span className="font-medium">{t(`rhAdm.historico.acao.${e.acao}`)}</span>
              <span className="text-muted-foreground">
                {" — "}{t("rhAdm.historico.por", { quem: e.por })}{" · "}
                <time dateTime={e.em} className="tabular-nums">{formatarDataHora(e.em)}</time>
              </span>
            </p>
            {e.motivo && <p className="text-xs text-muted-foreground">{t("rhAdm.historico.motivo", { motivo: e.motivo })}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
