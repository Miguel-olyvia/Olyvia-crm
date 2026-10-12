import { Columns3, LayoutList } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { FOCO } from "./estilos";
import type { ModoVista } from "./vistaGuardada";

interface SeletorModoProps {
  modo: ModoVista;
  aoMudar: (modo: ModoVista) => void;
}

/** Quadro | Lista, ao lado das abas. */
export function SeletorModo({ modo, aoMudar }: SeletorModoProps) {
  const { t } = useTranslation();
  const botoes = [
    { id: "quadro", Icone: Columns3, chave: "businessGoals.view.board" },
    { id: "lista", Icone: LayoutList, chave: "businessGoals.view.list" },
  ] as const;
  return (
    <div role="group" aria-label={t("businessGoals.view.label")} className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {botoes.map(({ id, Icone, chave }) => (
        <Button
          key={id} type="button" size="sm" variant={modo === id ? "default" : "ghost"} aria-pressed={modo === id}
          className={`min-h-11 gap-1.5 ${FOCO}`} onClick={() => aoMudar(id)}
        >
          <Icone className="h-4 w-4" aria-hidden="true" />
          {t(chave)}
        </Button>
      ))}
    </div>
  );
}
