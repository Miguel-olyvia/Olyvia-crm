import { useMemo } from "react";
import { LinhaPessoaVista } from "./LinhaPessoaVista";
import type { ResumoPessoa } from "./pessoasTipos";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { BotaoNegocios, ResumoNegocios, SemNegocios } from "./quadro/ControloNegociosPessoa";
import { COLUNAS_PROTOTIPO, vistaDoResumo } from "./vistaLinhaPessoa";

interface LinhaPessoaProps {
  resumo: ResumoPessoa;
  voltou: boolean;
  /** Os itens em curso da pessoa: ela em abordagem, ou os negócios (ver `itensDaPessoa`); vazio = sem botão de negócios. */
  itens: readonly ItemProcesso[];
  /** As sub-linhas de negócios estão abertas. */
  aberta: boolean;
  aoAlternar: (id: string) => void;
  aoAbrir: (id: string) => void;
}

/**
 * Uma linha do protótipo: a vista de exemplo do resumo, desenhada pela linha que a Lista real também usa (`LinhaPessoaVista`).
 * Na última célula, o botão dos negócios; por baixo do nome, o resumo de negócios (com as sub-linhas fechadas).
 */
export function LinhaPessoa({ resumo, voltou, itens, aberta, aoAlternar, aoAbrir }: LinhaPessoaProps) {
  const { pessoa } = resumo;
  const vista = useMemo(() => vistaDoResumo(resumo, voltou), [resumo, voltou]);
  return (
    <LinhaPessoaVista
      vista={vista} colunas={COLUNAS_PROTOTIPO} aoAbrir={() => aoAbrir(pessoa.id)}
      abaixoDoNome={!aberta && <ResumoNegocios resumo={resumo} itens={itens} />}
      celulas={{
        deals: itens.length === 0
          ? <SemNegocios />
          : <BotaoNegocios pessoaId={pessoa.id} nome={pessoa.nome} quantidade={itens.length} aberta={aberta} aoAlternar={aoAlternar} />,
      }}
    />
  );
}
