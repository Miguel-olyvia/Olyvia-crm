// A Frota na app real (/frota/*): uma página por ecrã, todas dentro da mesma moldura (FrotaShell). Os dados vêm das
// tabelas fleet_* da organização ativa (leitura com RLS, escrita só pelas RPCs rpc_fleet_*); a UI é a do Inventário real
// (shadcn + tokens do tema). Carrega à parte (lazy em App.tsx).
import { FrotaShell } from "@/components/frota/FrotaShell";
import type { EcraFrota } from "@/components/frota/contexto";
import {
  AtividadeFrota, AtribuicoesFrota, CondutoresFrota, CustosFrota, DocumentosFrota, HojeFrota, LigacoesFrota, ManutencaoFrota, OcorrenciasFrota, RelatoriosFrota, ViaturasFrota,
} from "@/components/frota/ecras";

const ECRAS: Record<EcraFrota, () => JSX.Element> = {
  hoje: HojeFrota, viaturas: ViaturasFrota, atribuicoes: AtribuicoesFrota, condutores: CondutoresFrota, manutencao: ManutencaoFrota,
  custos: CustosFrota, ocorrencias: OcorrenciasFrota, documentos: DocumentosFrota, relatorios: RelatoriosFrota, atividade: AtividadeFrota, ligacoes: LigacoesFrota,
};

export default function Frota({ ecra }: { ecra: EcraFrota }) {
  const Ecra = ECRAS[ecra] ?? HojeFrota;
  return (
    <FrotaShell key={ecra}>
      <Ecra />
    </FrotaShell>
  );
}
