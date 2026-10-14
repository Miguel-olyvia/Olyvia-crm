/**
 * «As minhas horas extra» (A minha área): a visão da pessoa. Mostra as horas extra da própria pessoa e o saldo dos
 * limites; se tiver banco de horas, o saldo e os movimentos. Escolha: página própria em vez de um cartão na ficha,
 * porque a ficha é a vista do RH sobre qualquer pessoa e esta é a vista de quem está a usar a aplicação.
 */
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Card, CardContent } from "@/components/ui/card";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SeloExemplo } from "@/components/rh-exemplo/SeloExemplo";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import { CartaoBancoHoras } from "@/components/rh-exemplo/fluxosC/CartaoBancoHoras";
import { HorasExtraDaPessoa } from "@/components/rh-exemplo/fluxosC/HorasExtraDaPessoa";
import { useEmBancoDeHoras } from "@/components/rh-exemplo/fluxosC/useEmBancoDeHoras";
import { useTranslation } from "@/hooks/useTranslation";

export default function RhMinhasHorasExtra() {
  const { t } = useTranslation();
  const { activeCompany, isLoading } = useCompany();
  const minha = useMinhaPessoa();
  const temBanco = useEmBancoDeHoras(minha.pessoaId);

  if (isLoading || minha.loading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (minha.semFicha || !minha.pessoaId) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t("rhFluxosC.minhas.titulo")}</h1>
        <Card className="border-dashed"><CardContent className="py-16 text-center text-sm text-muted-foreground">{t("rhFluxosC.minhas.semFicha")}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold">{t("rhFluxosC.minhas.titulo")} <SeloExemplo /></h1>
      <HorasExtraDaPessoa pessoaId={minha.pessoaId} />
      {temBanco && <CartaoBancoHoras pessoaId={minha.pessoaId} podeAjustar={false} />}
    </div>
  );
}
