/** A vista Chefias da página Organização: o organograma de pessoas por «reporta a» (o mesmo componente que vivia na lista de Pessoas). */
import { PessoasOrganogramaTab } from "@/components/rh-exemplo/PessoasOrganogramaTab";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";

export function ChefiasVista() {
  const { pessoas, loading, error } = usePessoas();
  return <PessoasOrganogramaTab pessoas={pessoas} loading={loading} error={error} />;
}
