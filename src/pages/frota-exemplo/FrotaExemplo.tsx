// A Frota de exemplo na app real (/frota/*): uma página por ecrã, todas dentro da mesma moldura (FrotaShell). Os dados
// são de exemplo (sem tabelas na base de dados até a migração ser aprovada); a UI é a do Inventário real (shadcn +
// tokens do tema). Carrega à parte (lazy em App.tsx).
import { FrotaShell } from "@/components/frota-exemplo/FrotaShell";
import type { EcraFrota } from "@/components/frota-exemplo/contexto";
import {
  AtribuicoesFrota, CondutoresFrota, CustosFrota, DocumentosFrota, HojeFrota, LigacoesFrota, ManutencaoFrota, OcorrenciasFrota, RelatoriosFrota, ViaturasFrota,
} from "@/components/frota-exemplo/ecras";

const ECRAS: Record<EcraFrota, () => JSX.Element> = {
  hoje: HojeFrota, viaturas: ViaturasFrota, atribuicoes: AtribuicoesFrota, condutores: CondutoresFrota, manutencao: ManutencaoFrota,
  custos: CustosFrota, ocorrencias: OcorrenciasFrota, documentos: DocumentosFrota, relatorios: RelatoriosFrota, ligacoes: LigacoesFrota,
};

export default function FrotaExemplo({ ecra }: { ecra: EcraFrota }) {
  const Ecra = ECRAS[ecra] ?? HojeFrota;
  return (
    <FrotaShell key={ecra}>
      <Ecra />
    </FrotaShell>
  );
}
