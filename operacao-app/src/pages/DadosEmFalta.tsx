import { useAuth } from "../auth/AuthProvider";
import { EmptyState, ErrorState } from "../components/ui";
import { AlertTriangle } from "../components/icons";
import { DadosEmFalta } from "../components/arranque/DadosEmFalta";
import { podePlanear } from "../domain/obras";

/**
 * "Dados em falta" — o que falta nos produtos e serviços vendidos para as
 * encomendas pós-contrato andarem sozinhas (fornecedor, preço de compra,
 * stock, fichas de materiais, marcas por ligar, encomendas paradas).
 * Para quem planeia; a base verifica as permissões na mesma.
 */
export default function DadosEmFaltaPagina() {
  const { activeOrgId, funcao } = useAuth();

  if (!podePlanear(funcao)) {
    return <ErrorState message="Os dados em falta são para quem planeia as obras (gestor ou administrador)." />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dados em falta</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          O que falta nos produtos e serviços vendidos para a Encomenda Cliente e as notas de encomenda a fornecedor
          saírem certas.
        </p>
      </div>
      {activeOrgId ? (
        <DadosEmFalta orgId={activeOrgId} />
      ) : (
        <EmptyState
          icon={<AlertTriangle width={22} height={22} />}
          title="Sem organização escolhida"
          description="Escolha a organização no menu para ver os dados em falta."
        />
      )}
    </div>
  );
}
