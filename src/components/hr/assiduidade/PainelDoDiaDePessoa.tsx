/**
 * O painel do dia aberto a partir de um ecra de organizacao.
 *
 * PORQUE E QUE ISTO E UM COMPONENTE E NAO UMA PROP
 * ------------------------------------------------
 * No mapa do mes ha centenas de pessoas. Carregar a assiduidade de todas em
 * bruto so porque uma celula pode vir a ser clicada seria trazer dezenas de
 * milhares de linhas para mostrar um dia. Este embrulho monta-se SO quando
 * alguem abre uma celula, e o hook que ele instancia pede uma janela de UM
 * DIA de UMA pessoa -- o resto do ecra continua a ler as vistas em vigor, que
 * e o que lhe basta.
 *
 * Ao fechar, o componente desmonta-se e os dados vao com ele. E deliberado:
 * as picagens e as faltas de outra pessoa nao sao coisa para ficar em memoria
 * depois de o painel fechar.
 */
import { useMemo } from "react";
import { PainelDoDia } from "@/components/hr/assiduidade/PainelDoDia";
import { useAssiduidadeDaPessoa } from "@/hooks/useAssiduidadeDaPessoa";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";
import type { LocalTrabalho } from "@/types/hr";

interface PainelDoDiaDePessoaProps {
  pessoaId: string;
  pessoaNome: string;
  data: string;
  souAPessoa: boolean;
  locais: LocalTrabalho[];
  permissoes: PermissoesAssiduidade;
  onFechar: () => void;
  /** Para o ecra de tras se actualizar quando algo mudou aqui dentro. */
  onDepoisDeGravar?: () => void;
}

export function PainelDoDiaDePessoa({
  pessoaId,
  pessoaNome,
  data,
  souAPessoa,
  locais,
  permissoes,
  onFechar,
  onDepoisDeGravar,
}: PainelDoDiaDePessoaProps) {
  const janela = useMemo(() => ({ de: data, ate: data }), [data]);
  const assiduidade = useAssiduidadeDaPessoa(pessoaId, janela);

  return (
    <PainelDoDia
      aberto
      data={data}
      pessoaNome={pessoaNome}
      souAPessoa={souAPessoa}
      assiduidade={assiduidade}
      locais={locais}
      permissoes={permissoes}
      onFechar={() => {
        onDepoisDeGravar?.();
        onFechar();
      }}
    />
  );
}
