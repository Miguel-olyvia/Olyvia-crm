/**
 * Os painéis que o módulo «Custos» abre: a ficha da pessoa (já no separador Custo), «Registar valor avulso» (um lançamento
 * pontual do processamento do mês, na base) e «Atribuir
 * equipamento» (nos dois últimos escolhe-se a pessoa no próprio painel).
 */
import { AvulsoDialog } from "@/components/rh-exemplo/custo/AvulsoDialog";
import { EquipamentoSheet, type PessoaEscolhivel } from "@/components/rh-exemplo/custo/EquipamentoSheet";
import type { AcoesLancamentos } from "@/components/rh-exemplo/custo/lancamentosCusto";
import { FichaPessoaRh } from "@/components/rh-exemplo/ficha/FichaPessoaRh";

interface Props {
  ficha: { id: string | null; aberta: boolean };
  idsVisiveis: string[];
  pessoas: readonly PessoaEscolhivel[];
  autor: string;
  /** O mês («AAAA-MM») cujo período recebe os valores avulsos. */
  mes: string;
  lancamentos: AcoesLancamentos;
  avulsoAberto: boolean;
  equipamentoAberto: boolean;
  aoFecharFicha: () => void;
  aoIrParaFicha: (id: string) => void;
  aoFecharAvulso: () => void;
  aoFecharEquipamento: () => void;
  aoRegistarAvulso: (mesContagem: string) => void;
  aoAtribuir: (pessoaId: string) => void;
}

export function PaineisCustos(p: Props) {
  return (
    <>
      <FichaPessoaRh id={p.ficha.id} aberta={p.ficha.aberta} abaInicial="custo" idsVisiveis={p.idsVisiveis} aoFechar={p.aoFecharFicha} aoIrPara={p.aoIrParaFicha} />
      <AvulsoDialog open={p.avulsoAberto} pessoaId={null} pessoas={p.pessoas} mes={p.mes} acoes={p.lancamentos} aoFechar={p.aoFecharAvulso} aoRegistar={p.aoRegistarAvulso} />
      <EquipamentoSheet aberto={p.equipamentoAberto} pessoaId={null} pessoas={p.pessoas} autor={p.autor} aoFechar={p.aoFecharEquipamento} aoAtribuir={p.aoAtribuir} />
    </>
  );
}
