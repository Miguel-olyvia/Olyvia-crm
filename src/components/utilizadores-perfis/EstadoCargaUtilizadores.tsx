import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";

interface EstadoCargaUtilizadoresProps {
  carregando: boolean;
  semOrganizacao: boolean;
  erro: string | null;
  aoTentarDeNovo: () => void;
}

/**
 * O que os separadores Utilizadores e Portal mostram quando a lista ainda não está pronta: a carregar, sem organização ativa
 * ou a falha de leitura (com «Tentar de novo»). Devolve `null` quando há lista para mostrar; um erro nunca passa por lista vazia.
 */
export function EstadoCargaUtilizadores({ carregando, semOrganizacao, erro, aoTentarDeNovo }: EstadoCargaUtilizadoresProps) {
  const { t } = useTranslation();
  if (semOrganizacao) {
    return <p role="status" className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{t("usersProfiles.noOrganization")}</p>;
  }
  if (erro) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-md border border-destructive/40 px-4 py-10 text-center">
        <p className="text-sm text-destructive">{t("usersProfiles.loadError", { message: erro })}</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={aoTentarDeNovo}>{t("usersProfiles.retry")}</Button>
      </div>
    );
  }
  if (carregando) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 rounded-md border border-dashed px-4 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("usersProfiles.loading")}
      </p>
    );
  }
  return null;
}
