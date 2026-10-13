import { Keyboard } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FOCO } from "./estilos";

const ATALHOS: readonly { teclas: string; chave: string }[] = [
  { teclas: "↓  j", chave: "down" },
  { teclas: "↑  k", chave: "up" },
  { teclas: "←  →", chave: "sides" },
  { teclas: "Enter", chave: "enter" },
  { teclas: "x", chave: "select" },
  { teclas: "c", chave: "compare" },
  { teclas: "o", chave: "open" },
  { teclas: "Enter  ↓", chave: "searchDown" },
  { teclas: "/", chave: "search" },
  { teclas: "Esc", chave: "esc" },
  { teclas: "?", chave: "help" },
];

interface AjudaAtalhosProps {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
}

/** Botão com ícone (nome para leitores de ecrã) e a lista dos atalhos de teclado. */
export function AjudaAtalhos({ aberta, aoMudar }: AjudaAtalhosProps) {
  const { t } = useTranslation();
  return (
    <Popover open={aberta} onOpenChange={aoMudar}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="ghost" size="icon" aria-label={t("businessGoals.shortcuts.button")}
          className={`h-11 w-11 ${FOCO}`}
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 motion-reduce:animate-none">
        <p className="mb-2 text-sm font-semibold">{t("businessGoals.shortcuts.title")}</p>
        <dl className="space-y-1.5 text-sm">
          {ATALHOS.map((a) => (
            <div key={a.chave} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t(`businessGoals.shortcuts.${a.chave}`)}</dt>
              <dd><kbd className="rounded border border-input bg-muted px-1.5 py-0.5 font-mono text-xs">{a.teclas}</kbd></dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
