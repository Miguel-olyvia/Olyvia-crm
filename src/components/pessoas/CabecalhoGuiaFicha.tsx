// O cabeçalho ÚNICO da ficha real: o título da ficha (nome, com o foco inicial) e a descrição («Lead · Por contactar»), os selos, o estado de uma pessoa
// perdida ou encerrada, o paginador «1 de N» com Fechar e as ações secundárias (Email, WhatsApp, Mais). Tudo isto era o cabeçalho e a barra de ações
// de antes; agora entra no cabeçalho do guia (`GuiaDoPasso`), passado como elementos para o guia não depender do painel (Sheet) nos seus testes. O título e a descrição vêm de `usePecasFicha`: os do diálogo no painel lateral, os da página na ficha real.
import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { AcoesSecundariasFicha } from "./BarraAcoesFicha";
import { BotoesNavegacao } from "./BotoesNavegacao";
import { textoLinhaCabecalho } from "./formatoPessoas";
import { usePecasFicha } from "./pecasFicha";
import type { TeclaNavegacao, Vizinhas } from "./navegacaoFicha";
import type { AcaoFicha, CapacidadesFicha } from "./PainelBase";
import type { ResumoPessoa } from "./pessoasTipos";
import { AvisoEstadoPessoa } from "./SeccoesResumo";
import { SeloEmpresa, SeloEncerrada, SeloPerdida } from "./SelosPessoa";

/** As peças que o guia (de uma pessoa ou de um negócio) põe no seu cabeçalho. */
export interface PecasCabecalhoFicha {
  nomeEl: ReactNode;
  descricaoEl: ReactNode;
  selos?: ReactNode;
  aviso?: ReactNode;
  navegacao: ReactNode;
  acoesSecundarias: ReactNode;
  /** A faixa fina de alertas, por baixo do cabeçalho (só quando existem alertas). */
  faixa?: ReactNode;
}

export interface CabecalhoGuiaFichaEntrada {
  resumo: ResumoPessoa;
  vizinhas: Vizinhas;
  aoIr: (id: string, qual: TeclaNavegacao) => void;
  /** O painel aberto, se houver (o gatilho do «Mais» diz-lho ao leitor de ecrã). */
  aberta: AcaoFicha | null;
  painelId: string;
  aoAbrir: (acao: AcaoFicha, origem: HTMLElement | null) => void;
  aoReativar: () => void;
  capacidades?: CapacidadesFicha;
  aGuardar?: boolean;
  /** «Registar chamada» vai para o menu «Mais»: o botão do passo não é o da chamada (um cliente, uma perdida, um negócio aberto, ou o passo é a visita). */
  comItemChamada: boolean;
  /** Com um negócio aberto: «Detalhes do negócio» no menu «Mais». */
  aoAbrirDetalhesNegocio?: (origem: HTMLElement | null) => void;
  /** A faixa fina de alertas (montada por quem tem os dados). */
  faixa?: ReactNode;
}

/** Monta as peças do cabeçalho único da ficha. Tem de correr dentro da ficha (painel ou página): o título e a descrição são as peças que ela dá. */
export function useCabecalhoGuiaFicha(p: CabecalhoGuiaFichaEntrada): PecasCabecalhoFicha {
  const { t } = useTranslation();
  const { Titulo, Descricao } = usePecasFicha();
  const { pessoa } = p.resumo;
  const comSelos = Boolean(pessoa.empresa || pessoa.perdida || pessoa.encerrada);
  return {
    nomeEl: <Titulo tabIndex={-1} data-ficha-nome className="break-words text-2xl font-bold outline-none">{pessoa.nome}</Titulo>,
    descricaoEl: <Descricao className="text-base">{textoLinhaCabecalho(t, p.resumo)}</Descricao>,
    selos: comSelos ? (
      <>
        {pessoa.empresa && <SeloEmpresa />}
        {pessoa.perdida && <SeloPerdida />}
        {pessoa.encerrada && <SeloEncerrada />}
      </>
    ) : undefined,
    aviso: pessoa.perdida || pessoa.encerrada ? <AvisoEstadoPessoa resumo={p.resumo} /> : undefined,
    navegacao: <BotoesNavegacao vizinhas={p.vizinhas} aoIr={p.aoIr} />,
    acoesSecundarias: (
      <AcoesSecundariasFicha
        resumo={p.resumo} aberta={p.aberta} painelId={p.painelId} aoAbrir={p.aoAbrir} aoReativar={p.aoReativar}
        capacidades={p.capacidades} aGuardar={p.aGuardar} comItemChamada={p.comItemChamada} aoAbrirDetalhesNegocio={p.aoAbrirDetalhesNegocio}
      />
    ),
    faixa: p.faixa,
  };
}
