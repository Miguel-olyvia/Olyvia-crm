// O que a página pública mostra quando o canal não está disponível: a ler, desligado/desconhecido, ou a leitura falhou.
// «Indisponível» é a resposta para um endereço sem `?org=`, um `?org=` desconhecido e um canal desligado: não se diz qual.
import { useTranslation } from "@/hooks/useTranslation";
import type { CanalPublico } from "../dados/fonte";

export function AvisoCanal({ estado }: { estado: Exclude<CanalPublico["estado"], "ok"> }) {
  const { t } = useTranslation();
  if (estado === "a_carregar") {
    return <p role="status" className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{t("cd.leitura.carregando")}</p>;
  }
  const indisponivel = estado === "indisponivel";
  return (
    <div role={indisponivel ? "status" : "alert"} className="space-y-2 rounded-lg border bg-card p-6 text-center">
      <h2 className="text-xl font-semibold">{t(indisponivel ? "cd.canal.indisponivelTitulo" : "cd.canal.erroTitulo")}</h2>
      <p className="text-sm text-muted-foreground">{t(indisponivel ? "cd.canal.indisponivelTexto" : "cd.canal.erroTexto")}</p>
    </div>
  );
}
