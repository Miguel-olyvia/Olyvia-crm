/**
 * Ha banco de horas? So se o tipo de horario EM VIGOR da pessoa for «banco de horas». Nem toda a gente o tem:
 * para os outros tipos nao ha saldo nem movimentos em lado nenhum (ficha, «as minhas horas extra», calendario).
 */
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { versaoEmVigor } from "@/components/rh-exemplo/lib/horarioTipos";

export function useEmBancoDeHoras(pessoaId: string | null | undefined): boolean {
  const horario = useFluxosB((e) => (pessoaId ? e.horarios[pessoaId] : undefined));
  return Boolean(horario && versaoEmVigor(horario, hojeIso())?.config.tipo === "banco");
}
