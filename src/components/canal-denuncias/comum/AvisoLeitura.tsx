// O que se mostra no lugar de uma leitura que ainda não chegou ou que falhou. Falhou NÃO é «não há denúncias»: diz-se, em
// texto (role="alert") e com «Tentar de novo». Nunca se enche o ecrã com dados de exemplo.
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoLeitura } from "../dados/fonte";

interface AvisoLeituraProps {
  estado: Exclude<EstadoLeitura, "ok">;
  onTentar: () => void;
}

export function AvisoLeitura({ estado, onTentar }: AvisoLeituraProps) {
  const { t } = useTranslation();
  if (estado === "a_carregar") {
    return <p role="status" className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{t("cd.leitura.carregando")}</p>;
  }
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-destructive/40 bg-card p-6 text-center">
      <p className="text-sm text-destructive">{t("cd.leitura.erro")}</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={onTentar}>{t("cd.leitura.tentar")}</Button>
    </div>
  );
}
