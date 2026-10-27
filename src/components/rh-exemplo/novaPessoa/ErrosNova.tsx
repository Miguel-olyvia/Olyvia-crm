// A lista de erros do painel «Nova pessoa»: depois de tentar criar, uma ligação por aba com erros (nome da aba e quantos
// campos faltam), que leva à aba e ao primeiro campo com erro. Os campos de outras abas não se veem, e o rodapé só diz
// quantos faltam; esta lista diz onde. O anúncio para leitores de ecrã continua a ser o do rodapé (`role="status"`): a lista
// é navegação, não um segundo alerta (não se repete a mesma coisa duas vezes).
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { cn } from "@/lib/utils";
import { ABAS_NOVA, type AbaNova } from "./ids";

interface ErrosNovaProps {
  /** Quantos campos têm erro em cada aba. */
  porAba: Readonly<Record<AbaNova, number>>;
  aoIrParaAba: (aba: AbaNova) => void;
}

export function ErrosNova({ porAba, aoIrParaAba }: ErrosNovaProps) {
  const { t } = useTranslation();
  const idTitulo = useId();
  const comErros = ABAS_NOVA.filter((aba) => porAba[aba] > 0);
  if (comErros.length === 0) return null;
  return (
    <div role="group" aria-labelledby={idTitulo} className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <p id={idTitulo} className="text-sm font-medium text-destructive">{t("rhNova.erros.titulo")}</p>
      <ul className="flex flex-wrap gap-2">
        {comErros.map((aba) => (
          <li key={aba}>
            <button
              type="button" onClick={() => aoIrParaAba(aba)}
              className={cn("min-h-11 rounded-md border border-destructive/40 px-3 text-sm text-destructive underline-offset-2 hover:underline", FOCO)}
            >
              {t(`rhNova.tabs.${aba}`)}{t("rhForm.nova.tabs.errosN", { n: porAba[aba] })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
