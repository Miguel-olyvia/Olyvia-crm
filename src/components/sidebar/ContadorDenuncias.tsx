/**
 * O contador da entrada «Denúncias» do menu de RH de exemplo: quantas denúncias da ORGANIZAÇÃO ativa estão «por
 * confirmar» (receção ainda não confirmada). É texto («2 por confirmar»), não só cor. Sem nenhuma, não desenha nada.
 */
import { porConfirmar } from "@/components/canal-denuncias/lib/organizacao";
import { useDenunciasDaOrganizacao } from "@/components/canal-denuncias/dados/loja";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useTranslation } from "@/hooks/useTranslation";
import { PilulaTexto } from "./PilulaTexto";

export function ContadorDenuncias() {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const n = porConfirmar(useDenunciasDaOrganizacao(activeCompany.id));
  if (n <= 0) return null;
  return <PilulaTexto texto={t("sidebar.rhExemploDenunciasPorConfirmar", { n })} />;
}
