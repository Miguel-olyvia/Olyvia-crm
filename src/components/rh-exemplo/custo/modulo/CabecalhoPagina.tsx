/** O cabeçalho da página «Custos»: título, selo de exemplo, descrição e os dois botões do topo. */
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { SeloExemplo } from "@/components/rh-exemplo/SeloExemplo";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface Props {
  aoRegistarAvulso: () => void;
  aoAtribuirEquipamento: () => void;
}

export function CabecalhoPagina({ aoRegistarAvulso, aoAtribuirEquipamento }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold">{t("rhCustos.titulo")} <SeloExemplo /></h1>
        <p className="text-muted-foreground">{t("rhCustos.sub")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={aoRegistarAvulso} className={cn("min-h-11 gap-2", FOCO)}>
          <Plus className="h-4 w-4" aria-hidden="true" />{t("rhCustos.registarAvulso")}
        </Button>
        <Button type="button" onClick={aoAtribuirEquipamento} className={cn("min-h-11 gap-2", FOCO)}>
          <Plus className="h-4 w-4" aria-hidden="true" />{t("rhCustos.atribuirEquipamento")}
        </Button>
      </div>
    </div>
  );
}
