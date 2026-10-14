/**
 * O banco de horas na aba Horário da ficha: só aparece quando o tipo de horário EM VIGOR da pessoa é «banco».
 * Lê o tipo do store dos horários (frente B) e o saldo do store da frente C; nada sai da memória.
 */
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { versaoEmVigor } from "@/components/rh-exemplo/lib/horarioTipos";
import { useTranslation } from "@/hooks/useTranslation";
import { CartaoBancoHoras } from "./CartaoBancoHoras";

interface Props {
  pessoaId: string;
  podeAjustar: boolean;
}

export function BancoHorasDaFicha({ pessoaId, podeAjustar }: Props) {
  const { t } = useTranslation();
  const horario = useFluxosB((e) => e.horarios[pessoaId]);
  const tipo = horario ? versaoEmVigor(horario, hojeIso())?.config.tipo : undefined;
  if (tipo !== "banco") return null;
  return (
    <div className="space-y-2" data-testid="rhd-banco-ficha">
      <p className="text-sm text-muted-foreground">{t("rhFluxosD.banco.sobreTipo")}</p>
      <CartaoBancoHoras pessoaId={pessoaId} podeAjustar={podeAjustar} />
    </div>
  );
}
