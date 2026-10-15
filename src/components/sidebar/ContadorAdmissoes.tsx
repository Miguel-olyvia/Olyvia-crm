/**
 * O contador da entrada «Admissões» do menu de RH de exemplo: quantas admissões estão «por aprovar». É texto («1 por
 * aprovar»), não só cor, e lê-se da mesma memória de exemplo que o pipeline. Sem nenhuma por aprovar, não desenha nada.
 */
import { useAdmissoes } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { useTranslation } from "@/hooks/useTranslation";

export function ContadorAdmissoes() {
  const { t } = useTranslation();
  const porAprovar = useAdmissoes((e) => Object.values(e.porPessoa).filter((a) => a.estado === "submetida").length);
  if (porAprovar <= 0) return null;
  return (
    <span className="ml-auto shrink-0 rounded-full bg-warning px-2 py-0.5 text-[11px] font-semibold leading-none text-amber-950 tabular-nums">
      {t("sidebar.rhExemploAdmissoesPorAprovar", { n: porAprovar })}
    </span>
  );
}
