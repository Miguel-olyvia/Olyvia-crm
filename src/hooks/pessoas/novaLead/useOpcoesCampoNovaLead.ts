// As opções de um campo «distrito» do formulário (cópia das consultas de DynamicFormField.tsx), para o campo copiado ficar sem base:
// o componente recebe as opções por aqui. Só lê quando o campo é mesmo um distrito.
import { useQuery } from "@tanstack/react-query";
import { lerDistritos, type DistritoLido } from "./leituraNovaLead";

export function useOpcoesCampoNovaLead(tipoDoCampo: string, campanhaId: string | null): DistritoLido[] {
  const { data } = useQuery({
    queryKey: ["pessoas-nova-lead", "distritos", campanhaId ?? "todos"],
    queryFn: () => lerDistritos(campanhaId),
    enabled: tipoDoCampo === "ref_district",
    staleTime: 5 * 60 * 1000,
  });
  return data ?? [];
}
