// Famílias (interface): a lista das famílias GRAVADAS NA BASE (nome e «N produtos»), com Editar e Apagar só para quem tem products.edit (`podeEditar`).
// 26/11: cada linha tem «Ver» (abre a vista da família com 3D, /catalogo/produtos/familias/:id; o clique no nome também), que qualquer pessoa com services.view vê.
// Os botões têm id (`editar-<família>`, `apagar-<família>`) para a página devolver o foco depois de guardar, cancelar ou apagar.
import { Link } from "react-router-dom";
import { Box } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { caminhoFamilia } from "../catalogoRotas";
import { NOTA } from "../pecasForm";
import type { FamiliaResumo } from "./familiasDados";
import { BTN, idApagarFamilia, idEditarFamilia } from "./estilosFamilias";

export interface ListaFamiliasProps {
  familias: readonly FamiliaResumo[];
  podeEditar: boolean;
  /** a família que se está a abrir para editar (o botão fica aria-busy) */
  aAbrir: string | null;
  onEditar: (f: FamiliaResumo) => void; onApagar: (f: FamiliaResumo) => void;
}

export function ListaFamilias({ familias, podeEditar, aAbrir, onEditar, onApagar }: ListaFamiliasProps) {
  const { t } = useTranslation();
  if (familias.length === 0) return <p className={NOTA}>{t("catFamilias.lista.vazia")}</p>;
  return (
    <ul aria-label={t("catFamilias.lista.rotulo")} className="grid gap-2">
      {familias.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold">
              <Link to={caminhoFamilia(f.id)} className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{f.nome}</Link>
            </p>
            <p className="text-[15px] text-muted-foreground">{t(f.nProdutos === 1 ? "catFamilias.lista.produtos.one" : "catFamilias.lista.produtos.other", { count: f.nProdutos })}</p>
          </div>
          <Link to={caminhoFamilia(f.id)} aria-label={t("catFamiliaVer.verNome", { name: f.nome })} className={cn(buttonVariants({ variant: "outline" }), BTN, "gap-2")}>
            <Box className="h-4 w-4" aria-hidden="true" />{t("catFamiliaVer.ver")}
          </Link>
          {podeEditar && (
            <>
              <Button type="button" id={idEditarFamilia(f.id)} variant="outline" className={BTN} aria-label={t("catFamilias.editarNome", { name: f.nome })}
                aria-busy={aAbrir === f.id || undefined} disabled={aAbrir !== null} onClick={() => onEditar(f)}>{t("catFamilias.editar")}</Button>
              <Button type="button" id={idApagarFamilia(f.id)} variant="outline" className={BTN} aria-label={t("catFamilias.apagarNome", { name: f.nome })}
                disabled={aAbrir !== null} onClick={() => onApagar(f)}>{t("catFamilias.apagar")}</Button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
