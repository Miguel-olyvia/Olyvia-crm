// Só para os testes (nenhum código da página o importa): uma "página" mínima com o que a página real faz para os passos do orçamento e da
// proposta. Lê os negócios e os extras dos mesmos stores, monta o `ProcessoProvider` e mostra o Quadro de Pessoas e o Quadro de Negócios,
// por isso um passo que muda o estado se vê nos dois, como na aplicação.
import { useMemo, useState } from "react";
import { vi } from "vitest";
import { QuadroNegocios } from "@/components/negocio-metas/QuadroNegocios";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { negociosDoQuadro, useAlteracoesNegocios } from "@/components/negocio-metas/negociosAlterados";
import { pessoaBase, resumoBase } from "@/components/pessoas/fabricaTestes";
import { cartoesDoQuadro } from "@/components/pessoas/quadro/cartoesQuadroPessoas";
import { QuadroPessoas } from "@/components/pessoas/quadro/QuadroPessoas";
import { itensDaPessoa } from "@/components/pessoas/processo/itensProcesso";
import { useExtrasProcesso } from "@/components/pessoas/processo/processoNegocios";
import { ProcessoProvider, type AcoesProcesso } from "@/components/pessoas/processo/ProcessoProvider";
import { HOJE } from "./fabricaProcessoTestes";

const SEM_ACOES: AcoesProcesso = {
  registarChamada: () => {}, adiar: () => {}, perder: () => {}, reativar: () => {}, juntarNota: () => {}, alterarVisita: () => {},
  marcarVisita: () => {}, marcarVisitaFeita: () => {}, guardarLevantamento: () => {},
};

interface PaginaDeTesteProps {
  negocio: NegocioMes;
  aoAnunciar?: (texto: string) => void;
}

export function PaginaDeTeste({ negocio, aoAnunciar }: PaginaDeTesteProps) {
  const alteracoes = useAlteracoesNegocios();
  const extras = useExtrasProcesso();
  const negocios = useMemo(() => negociosDoQuadro([negocio], alteracoes), [negocio, alteracoes]);
  const resumo = useMemo(() => resumoBase(pessoaBase("a"), negocios, HOJE), [negocios]);
  const itens = useMemo(() => new Map(itensDaPessoa(resumo, HOJE, extras).map((i) => [i.id, i])), [resumo, extras]);
  const cartoes = useMemo(() => cartoesDoQuadro([resumo], HOJE), [resumo]);
  const [aviso, setAviso] = useState("");
  return (
    <ProcessoProvider
      hoje={HOJE} resumos={[resumo]} acoes={SEM_ACOES} opcoesPessoa={[]} aoCriarNegocio={vi.fn()}
      aoAnunciar={(texto) => { setAviso(texto); aoAnunciar?.(texto); }}
    >
      <div data-testid="quadro-pessoas">
        <QuadroPessoas cartoes={cartoes} itens={itens} hoje={HOJE} chip="todas" aoAbrir={vi.fn()} aoLimpar={vi.fn()} />
      </div>
      <div data-testid="quadro-negocios">
        <QuadroNegocios
          negocios={negocios} hoje={HOJE} fases={[]} ocultarComercial={false} selecionados={new Set()}
          acoes={{ abrirPessoa: vi.fn(), criarOrcamento: vi.fn() }} aoAbrir={vi.fn()} aoAlternarSelecao={vi.fn()}
        />
      </div>
      <div role="status" data-testid="aviso">{aviso}</div>
    </ProcessoProvider>
  );
}
