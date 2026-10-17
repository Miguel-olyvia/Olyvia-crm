// O arnês dos testes do `ProcessoProvider` (nenhum código da página o importa): as ações simuladas, os botões que executam um passo, o
// `ProcessoProvider` montado à volta de uma pessoa e as fábricas de pedidos, visitas e levantamentos que os testes partilham.
/* eslint-disable react-refresh/only-export-components -- ficheiro só de testes: não há "fast refresh" a proteger. */
import type { ReactNode } from "react";
import { vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { novaLinha } from "@/components/negocio-metas/levantamento";
import type { DadosCriarNegocio } from "@/components/negocio-metas/novoNegocio";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { pedidoBase, pessoaBase, resumoBase, visitaBase } from "../fabricaTestes";
import { paraOpcao } from "../pessoaOpcao";
import type { PedidoNegocio, ResumoPessoa } from "../pessoasTipos";
import { itensDaPessoa } from "./itensProcesso";
import { ProcessoProvider, type AcoesProcesso } from "./ProcessoProvider";
import { useAcaoDoPasso, useProcesso } from "./processoContexto";
import type { ItemProcesso } from "./tiposProcesso";

export const PAINEL = /^Visita e levantamento de a( · .+)?$/;
export const GUARDAR = "Guardar a visita e o levantamento";

export const acoes = (): AcoesProcesso => ({
  registarChamada: vi.fn(), adiar: vi.fn(), perder: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn(),
  marcarVisita: vi.fn(), guardarPedido: vi.fn(), criarPedidoComVisitas: vi.fn(), removerPedido: vi.fn(),
});

export function Gatilho({ item }: { item: ItemProcesso }) {
  const processo = useProcesso();
  return <button type="button" onClick={(e) => processo?.executar(item, e.currentTarget)}>executar</button>;
}

export function GatilhoNovoPedido() {
  const processo = useProcesso();
  return <button type="button" onClick={(e) => processo?.abrirNovoPedido("a", e.currentTarget)}>novo pedido</button>;
}

/** Um botão feito com o mesmo gancho dos cartões do Quadro e da Lista: mostra a explicação do portão junto a si. */
export function GatilhoDoCartao({ item }: { item: ItemProcesso }) {
  const acao = useAcaoDoPasso(item, () => {});
  return (
    <div>
      <button type="button" onClick={acao.aoClicar} {...acao.atributos}>passo</button>
      {acao.bloqueio && <p data-testid="explicacao">{acao.bloqueio}</p>}
    </div>
  );
}

interface Extras {
  aoAnunciar?: (texto: string) => void;
}

/** Monta o provider à volta de uma pessoa; devolve os mocks (anúncios, ações, criar negócio) e `mudarResumo` para re-renderizar com outra. */
export const renderizar = (resumo: ResumoPessoa, filhos: ReactNode, extras: Extras = {}) => {
  const aoAnunciar = vi.fn(extras.aoAnunciar);
  const a = acoes();
  const aoCriarNegocio = vi.fn((_dados: DadosCriarNegocio) => "n-novo-1");
  const arvore = (r: ResumoPessoa) => (
    <ProcessoProvider hoje={HOJE_EXEMPLO} resumos={[r]} acoes={a} opcoesPessoa={[paraOpcao(r.pessoa)]} aoCriarNegocio={aoCriarNegocio} aoAnunciar={aoAnunciar}>
      {filhos}
    </ProcessoProvider>
  );
  const { rerender } = render(arvore(resumo));
  return { aoAnunciar, a, aoCriarNegocio, mudarResumo: (novo: ResumoPessoa) => rerender(arvore(novo)) };
};

/** Monta e clica no botão que executa o item. */
export const montar = (resumo: ResumoPessoa, item: ItemProcesso) => {
  const resultado = renderizar(resumo, <Gatilho item={item} />);
  fireEvent.click(screen.getByRole("button", { name: "executar" }));
  return resultado;
};

export const visita = (extra: Partial<VisitaNegocio> = {}) => visitaBase("pd-1-v1", { data: "2026-10-12", ...extra });
export const comVisitas = (visitas = [visita()], extra: Partial<PedidoNegocio> = {}) => pedidoBase("pd-1", { contactado: true, visitas, ...extra });
export const resumoCom = (pedidos: PedidoNegocio[]): ResumoPessoa => resumoBase(pessoaBase("a"), [], HOJE_EXEMPLO, "lead", pedidos);
export const itensDe = (r: ResumoPessoa): ItemProcesso[] => itensDaPessoa(r, HOJE_EXEMPLO);
export const itemDe = (pedido: PedidoNegocio) => { const r = resumoCom([pedido]); return { r, item: itensDe(r)[0] }; };
export const linha = { ...novaLinha("l1"), divisao: "cozinha", trabalho: "bancada", medida: "3.5" };
export const levantamento = (linhas = [linha]) => ({ linhas, observacoes: "", respostas: {} });
export const feitaComLinhas = () => comVisitas([visita({ estado: "feita" })], { levantamento: levantamento(), servico: "Cozinha" });
