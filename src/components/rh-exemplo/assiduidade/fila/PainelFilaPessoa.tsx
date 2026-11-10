/**
 * O painel de UMA pessoa da fila de trabalho do mapa de assiduidade. Resolve-se tudo ali, numa so lista cronologica (horas
 * extra, justificacoes, alertas do fim do dia, desvios a validar), cada item com a etiqueta do seu tipo. A casca (gaveta, foco, lista) e a
 * `PainelFilaBase`, a mesma do ecra de Ausencias; aqui ficam os dialogos e formularios de decisao DESTE ecra.
 *
 * Os dialogos e formularios de decisao sao os que ja existiam, sem os reescrever: `DecidirHoraExtraDialog`,
 * `DialogosDecisaoDia` com `useDecisaoDoDia`, `AccaoDoDesvio` e `RegistarTempoAMaisDialog`. Depois de gravar, a fila
 * le outra vez as tres fontes (`aoRecarregar`) e o mapa o mes (`aoAlterarMapa`).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { dataCurta } from "@/components/rh-exemplo/fluxosC/formatosC";
import { AccaoDoDesvio } from "@/components/rh-exemplo/fluxosB/alertas/AccaoDoDesvio";
import { DialogosDecisaoDia, type PedidoDecisaoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/DialogosDecisaoDia";
import { useDecisaoDoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/useDecisaoDoDia";
import { DecidirHoraExtraDialog, type PedidoDecisao } from "@/components/rh-exemplo/fluxosC/DecidirHoraExtraDialog";
import { RegistarTempoAMaisDialog } from "@/components/rh-exemplo/fluxosC/RegistarTempoAMaisDialog";
import { accoesDoItem, type FonteFila, type IdDeAccao, type ItemFila, type PessoaNaFila } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { ehAccaoDesvio, type AccaoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";
import { useDesviosAcoes } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { AceitarDesvioDialog, type PedidoAceitarDesvio } from "./AceitarDesvioDialog";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";
import { PainelFilaBase, type PessoaAberta } from "./PainelFilaBase";

export type { PessoaAberta } from "./PainelFilaBase";

interface PainelFilaPessoaProps {
  /** A pessoa aberta; `null` com o painel fechado. */
  aberta: PessoaAberta | null;
  /** O que a fila diz dela agora; `null` quando ja nao tem nada por tratar. */
  pessoa: PessoaNaFila | null;
  hoje: string;
  /** As tres fontes leram bem: so entao se pode dizer «Nada por tratar». */
  lidaComSucesso: boolean;
  /** As fontes cuja ultima leitura falhou: os itens delas podem estar desactualizados. */
  fontesComProblema: readonly FonteFila[];
  permissoes: PermissoesAssiduidade;
  locais: LocalTrabalho[];
  minhaPessoaId: string | null;
  /** Relê as tres fontes da fila. */
  aoRecarregar: () => Promise<void>;
  /** O que mexe no mapa do mes (faltas, horas corrigidas): para ele reler. */
  aoAlterarMapa: () => void;
  aoFechar: () => void;
  /** Devolve o foco ao fechar (a lista sabe para onde). */
  aoDevolverFoco: (evento: Event) => void;
}

export function PainelFilaPessoa({ aberta, ...resto }: PainelFilaPessoaProps) {
  if (!aberta) return null;
  return <PainelDeAssiduidade aberta={aberta} {...resto} />;
}

type ConteudoProps = Omit<PainelFilaPessoaProps, "aberta"> & { aberta: PessoaAberta };

function PainelDeAssiduidade({
  aberta,
  pessoa,
  hoje,
  lidaComSucesso,
  fontesComProblema,
  permissoes,
  locais,
  minhaPessoaId,
  aoRecarregar,
  aoAlterarMapa,
  aoFechar,
  aoDevolverFoco,
}: ConteudoProps) {
  const { t } = useTranslation();
  const [pedidoHoraExtra, setPedidoHoraExtra] = useState<PedidoDecisao | null>(null);
  const [pedidoJustificacao, setPedidoJustificacao] = useState<PedidoDecisaoDia | null>(null);
  const [pedidoAlerta, setPedidoAlerta] = useState<{ item: Extract<ItemFila, { tipo: "alerta" }>; accao: AccaoDesvio } | null>(null);
  const [registarAberto, setRegistarAberto] = useState(false);
  const [pedidoAceitar, setPedidoAceitar] = useState<PedidoAceitarDesvio | null>(null);
  const [mensagemDesvio, setMensagemDesvio] = useState<{ texto: string; erro: boolean } | null>(null);
  const { validar: validarDesvio } = useDesviosAcoes();
  const blocoDaAccaoRef = useRef<HTMLDivElement>(null);

  const aposGravar = (): void => {
    void aoRecarregar();
    aoAlterarMapa();
  };
  const { decidir, mensagem, executor } = useDecisaoDoDia(aposGravar);
  /** Recusar devolve uma promessa: quando acaba (bem ou mal) a fila le outra vez. Aceitar relê por `aoCriarFalta`. */
  const decidirERecarregar: typeof decidir = (justificacao, decisao, motivo) => {
    const resposta = decidir(justificacao, decisao, motivo);
    if (resposta instanceof Promise) void resposta.finally(() => void aoRecarregar());
    return resposta;
  };

  // O formulario de uma accao sobre um alerta abre por cima da lista: traz-se a vista para ele.
  useEffect(() => {
    if (pedidoAlerta) blocoDaAccaoRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [pedidoAlerta]);

  const accionar = (item: ItemFila, accao: IdDeAccao): void => {
    if (item.tipo === "hora_extra") {
      setPedidoHoraExtra({ hora: item.hora, decisao: accao === "confirmar" ? "confirmar" : "rejeitar", pessoaNome: aberta.nome });
    } else if (item.tipo === "justificacao") {
      setPedidoJustificacao({ justificacao: item.justificacao, tipo: accao === "aceitar" ? "aceitar" : "recusar", pessoaNome: aberta.nome });
    } else if (item.tipo === "alerta") {
      // So as accoes de desvio abrem este formulario; qualquer outra e ignorada em vez de forcada com um cast.
      if (ehAccaoDesvio(accao)) setPedidoAlerta({ item, accao });
    } else if (item.tipo === "desvio_a_validar") {
      if (accao === "validar_aceitar_desvio") {
        // Aceitar exige um motivo: abre o dialogo.
        setPedidoAceitar({ desvioId: item.validacao.id, pessoaNome: aberta.nome, data: item.data });
      } else {
        void validarDireto(item, accao === "validar_hora_extra" ? "hora_extra" : "normal");
      }
    }
    // «ausencia» nao tem fonte neste ecra: nunca chega aqui.
  };

  /** Normal e hora extra nao pedem motivo: validam logo. O resultado diz-se por extenso (regiao `status`). */
  const validarDireto = async (item: Extract<ItemFila, { tipo: "desvio_a_validar" }>, decisao: "normal" | "hora_extra"): Promise<void> => {
    setMensagemDesvio(null);
    const r = await validarDesvio(item.validacao.id, decisao);
    if (!r.ok) {
      setMensagemDesvio({ texto: r.erro, erro: true });
      void aoRecarregar();
      return;
    }
    setMensagemDesvio({ texto: t(`rhDesvios.validar.ok.${decisao}`, { dia: dataCurta(item.data) }), erro: false });
    aposGravar();
  };

  return (
    <PainelFilaBase
      aberta={aberta}
      pessoa={pessoa}
      hoje={hoje}
      lidaComSucesso={lidaComSucesso}
      fontesComProblema={fontesComProblema}
      accoesDe={(item) => accoesDoItem(item, permissoes, minhaPessoaId)}
      aoAccionar={accionar}
      mensagem={mensagemDesvio ?? mensagem}
      hrefFicha={`/rh-exemplo/pessoas/${aberta.id}?aba=planeamento`}
      chaveFicha="rhFila.painel.abrirFicha"
      blocoExtra={
        pedidoAlerta && (
          <div ref={blocoDaAccaoRef}>
            <AccaoDoDesvio
              key={`${pedidoAlerta.item.id}-${pedidoAlerta.accao}`}
              desvio={pedidoAlerta.item.desvio}
              accao={pedidoAlerta.accao}
              nome={aberta.nome}
              locais={locais}
              onAlterado={aposGravar}
              onFechar={() => setPedidoAlerta(null)}
            />
          </div>
        )
      }
      rodape={
        permissoes.gerir && (
          <div className="border-t p-4">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setRegistarAberto(true)}>
              {t("rhFila.painel.registar")}
            </Button>
          </div>
        )
      }
      aoFechar={aoFechar}
      aoDevolverFoco={aoDevolverFoco}
    >
      <DecidirHoraExtraDialog pedido={pedidoHoraExtra} aoFechar={() => setPedidoHoraExtra(null)} />
      <DialogosDecisaoDia pedido={pedidoJustificacao} aoFechar={() => setPedidoJustificacao(null)} aoDecidir={decidirERecarregar} />
      {executor}
      <AceitarDesvioDialog
        pedido={pedidoAceitar}
        aoFechar={() => setPedidoAceitar(null)}
        aoValidado={(texto) => {
          setMensagemDesvio({ texto, erro: false });
          aposGravar();
        }}
      />
      <RegistarTempoAMaisDialog aberto={registarAberto} aoFechar={() => setRegistarAberto(false)} pessoaIdInicial={aberta.id} />
    </PainelFilaBase>
  );
}
