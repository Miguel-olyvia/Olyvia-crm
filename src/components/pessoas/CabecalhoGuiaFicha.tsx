// O cabeçalho ÚNICO da ficha real: o título da ficha (nome, com o foco inicial) e a descrição («Lead · Por contactar»), os selos, o estado de uma pessoa
// perdida ou encerrada, o paginador «1 de N» com Fechar e as ações secundárias (Email, WhatsApp, Mais). Tudo isto era o cabeçalho e a barra de ações
// de antes; agora entra no cabeçalho do guia (`GuiaDoPasso`), passado como elementos para o guia não depender do painel (Sheet) nos seus testes.
import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { AcoesSecundariasFicha } from "./BarraAcoesFicha";
import { BotoesNavegacao } from "./BotoesNavegacao";
import { textoLinhaCabecalho } from "./formatoPessoas";
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
  aoCriarNegocio?: () => void;
  capacidades?: CapacidadesFicha;
  aGuardar?: boolean;
  /** «Registar chamada» vai para o menu «Mais»: o botão do passo não é o da chamada (um cliente, uma perdida, um negócio aberto, ou o passo é a visita). */
  comItemChamada: boolean;
}

/** Monta as peças do cabeçalho único da ficha. Tem de correr dentro do painel (o título e a descrição são os do diálogo). */
export function useCabecalhoGuiaFicha(p: CabecalhoGuiaFichaEntrada): PecasCabecalhoFicha {
  const { t } = useTranslation();
  const { pessoa } = p.resumo;
  const comSelos = Boolean(pessoa.empresa || pessoa.perdida || pessoa.encerrada);
  return {
    nomeEl: <SheetTitle tabIndex={-1} data-ficha-nome className="break-words text-xl outline-none">{pessoa.nome}</SheetTitle>,
    descricaoEl: <SheetDescription className="text-[15px]">{textoLinhaCabecalho(t, p.resumo)}</SheetDescription>,
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
        aoCriarNegocio={p.aoCriarNegocio} capacidades={p.capacidades} aGuardar={p.aGuardar} comItemChamada={p.comItemChamada}
      />
    ),
  };
}
