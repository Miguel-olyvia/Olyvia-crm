/** A barra por cima da árvore: pesquisa por nome e os botões Expandir tudo / Recolher tudo. */
import { ChevronsDownUp, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/useTranslation";

interface BarraProps {
  termo: string;
  aoPesquisar: (termo: string) => void;
  aoExpandir: () => void;
  aoRecolher: () => void;
}

export function BarraOrganizacao({ termo, aoPesquisar, aoExpandir, aoRecolher }: BarraProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search" value={termo} onChange={(e) => aoPesquisar(e.target.value)} aria-label={t("rhOrg.pesquisar")}
          placeholder={t("rhOrg.pesquisaPlaceholder")} className="min-h-11 pl-9"
        />
      </div>
      <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={aoExpandir}>
        <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />{t("rhOrg.expandir")}
      </Button>
      <Button type="button" variant="outline" className="min-h-11 gap-1.5" onClick={aoRecolher}>
        <ChevronsDownUp className="h-4 w-4" aria-hidden="true" />{t("rhOrg.recolher")}
      </Button>
    </div>
  );
}
