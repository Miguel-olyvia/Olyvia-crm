// Protótipo do configurador de famílias de produto (ramo proto/visualizador-3d), numa página própria e pública. Sem sessão, sem base de dados:
// as famílias vivem só em memória (armazém de módulo) e passam para a planta 3D (/prototipo/planta-3d) se se navegar sem recarregar.
import { PainelConfigurador } from "@/emylia/planta3d/PainelConfigurador";
import { LigacaoProto } from "@/emylia/planta3d/LigacaoProto";
import { ROTA_PLANTA_3D, definirFamiliasConfiguradas, useFamiliasConfiguradas } from "@/emylia/planta3d/familiasConfiguradas";

export default function PrototipoConfiguradorFamilias() {
  const familias = useFamiliasConfiguradas();
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Protótipo: configurador de famílias</h1>
      <p className="text-[15px] text-muted-foreground">
        Crie famílias de produto: cada produto (medida e referência) tem os seus acabamentos, e cada acabamento um preço e um SKU próprios. Nada se grava na base de dados.
      </p>
      <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        As famílias guardadas ficam só nesta sessão do navegador: recarregar a página perde as famílias. Para as ver na barra de produtos, use a ligação abaixo (não recarregue).
      </p>
      <div><LigacaoProto para={ROTA_PLANTA_3D}>Ver na planta 3D</LigacaoProto></div>
      <PainelConfigurador familias={familias} onFamilias={definirFamiliasConfiguradas} />
    </main>
  );
}
