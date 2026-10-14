/**
 * O banco de horas na aba Horário da ficha: só aparece quando o tipo de horário EM VIGOR da pessoa é «banco».
 * Lê o tipo do store dos horários (frente B) e o saldo do store da frente C; nada sai da memória.
 */
import { useTranslation } from "@/hooks/useTranslation";
import { CartaoBancoHoras } from "./CartaoBancoHoras";
import { useEmBancoDeHoras } from "./useEmBancoDeHoras";

interface Props {
  pessoaId: string;
  podeAjustar: boolean;
}

export function BancoHorasDaFicha({ pessoaId, podeAjustar }: Props) {
  const { t } = useTranslation();
  if (!useEmBancoDeHoras(pessoaId)) return null;
  return (
    <div className="space-y-2" data-testid="rhd-banco-ficha">
      <p className="text-sm text-muted-foreground">{t("rhFluxosD.banco.sobreTipo")}</p>
      <CartaoBancoHoras pessoaId={pessoaId} podeAjustar={podeAjustar} />
    </div>
  );
}
