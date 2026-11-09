/**
 * O painel de UMA pessoa na fila do ecra de Ausencias: todos os pedidos dela por decidir numa so lista, com as accoes nos
 * proprios itens. A casca (gaveta, foco, lista, estado) e a `PainelFilaBase`, a mesma do mapa de assiduidade.
 *
 * As decisoes sao as do detalhe do pedido, sem as reescrever: aprovar, recusar e ajustar como chefia; aprovar, recusar e
 * devolver como RH (`decidirChefia` / `decidirRh` do hook da organizacao, que relê a lista depois de gravar). Recusar,
 * ajustar e devolver pedem o MOTIVO (`MotivoDialog`), porque a base o exige. Chefia e RH continuam separadas: cada passo exige
 * a sua permissao e uma accao sem ela fica desactivada com o motivo escrito (`accoesDoItem`).
 *
 * Cancelar, corrigir e ler o motivo do pedido continuam no detalhe («Ver detalhe»).
 */
import { useRef, useState } from "react";
import { MotivoDialog, type ResultadoMotivo } from "@/components/rh-exemplo/ausencias/MotivoDialog";
import { PainelFilaBase, type MensagemDoPainel, type PessoaAberta } from "@/components/rh-exemplo/assiduidade/fila/PainelFilaBase";
import {
  accoesDoItem,
  type FonteAusencias,
  type IdDeAccao,
  type ItemAusencia,
  type ItemFila,
  type PermissoesDaFila,
  type PessoaNaFila,
} from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { useTranslation } from "@/hooks/useTranslation";

type AccaoComMotivo = "recusar_chefia" | "ajustar" | "recusar_rh" | "devolver";

/** O que o painel precisa das decisoes do hook da organizacao (cada uma devolve a mensagem de erro, ou `null`). */
export interface DecisoesDeAusencia {
  decidirChefia: (args: {
    pedidoId: string;
    resultado: "aprovado" | "recusado" | "ajustado";
    motivo?: string | null;
    ajusteDataInicio?: string | null;
    ajusteDataFim?: string | null;
  }) => Promise<string | null>;
  decidirRh: (args: { pedidoId: string; resultado: "aprovado" | "recusado" | "devolvido"; motivo?: string | null }) => Promise<string | null>;
  saving: boolean;
}

interface PainelAusenciasPessoaProps {
  aberta: PessoaAberta | null;
  pessoa: PessoaNaFila | null;
  hoje: string;
  lidaComSucesso: boolean;
  fontesComProblema: readonly FonteAusencias[];
  permissoes: { aprovarChefia: boolean; aprovarRh: boolean };
  decisoes: DecisoesDeAusencia;
  aoAbrirDetalhe: (pedidoId: string) => void;
  aoFechar: () => void;
  aoDevolverFoco: (evento: Event) => void;
}

const CHAVES_DO_DIALOGO: Record<AccaoComMotivo, { titulo: string; descricao: string }> = {
  recusar_chefia: { titulo: "hr.ausencias.accao.recusar", descricao: "hr.ausencias.accao.recusarDescricao" },
  recusar_rh: { titulo: "hr.ausencias.accao.recusar", descricao: "hr.ausencias.accao.recusarDescricao" },
  // Ajustar grava a contraproposta e NAO faz o pedido avancar: a descricao di-lo.
  ajustar: { titulo: "hr.ausencias.accao.ajustar", descricao: "hr.ausencias.accao.ajustarDescricao" },
  devolver: { titulo: "hr.ausencias.accao.devolver", descricao: "hr.ausencias.accao.devolverDescricao" },
};

const ehAccaoComMotivo = (accao: IdDeAccao): accao is AccaoComMotivo =>
  accao === "recusar_chefia" || accao === "ajustar" || accao === "recusar_rh" || accao === "devolver";

export function PainelAusenciasPessoa({ aberta, ...resto }: PainelAusenciasPessoaProps) {
  if (!aberta) return null;
  return <PainelDeAusencias aberta={aberta} {...resto} />;
}

function PainelDeAusencias({
  aberta,
  pessoa,
  hoje,
  lidaComSucesso,
  fontesComProblema,
  permissoes,
  decisoes,
  aoAbrirDetalhe,
  aoFechar,
  aoDevolverFoco,
}: Omit<PainelAusenciasPessoaProps, "aberta"> & { aberta: PessoaAberta }) {
  const { t } = useTranslation();
  const [pedidoMotivo, setPedidoMotivo] = useState<{ item: ItemAusencia; accao: AccaoComMotivo } | null>(null);
  const [mensagem, setMensagem] = useState<MensagemDoPainel | null>(null);
  // O erro da ultima decisao que pediu motivo: aparece dentro do `MotivoDialog`, que fica aberto.
  const [erroDecisao, setErroDecisao] = useState<string | null>(null);
  // Uma decisao de cada vez: um segundo clique enquanto a primeira grava nao a repete.
  const aGravar = useRef(false);

  const permissoesDaFila: PermissoesDaFila = {
    gerir: false,
    corrigir: false,
    faltasEdit: false,
    justificacaoEdit: false,
    aprovarChefia: permissoes.aprovarChefia,
    aprovarRh: permissoes.aprovarRh,
  };

  const comDialogo = pedidoMotivo !== null;
  const executar = async (decidir: () => Promise<string | null>, chaveSucesso: string): Promise<void> => {
    if (aGravar.current) return;
    aGravar.current = true;
    try {
      const erro = await decidir();
      if (erro) {
        // Com o dialogo do motivo aberto, o erro aparece DENTRO dele e o dialogo fica aberto (o motivo escrito nao se perde,
        // e o aviso nao fica escondido atras do dialogo). Sem dialogo (aprovar), vai para a mensagem do painel.
        if (comDialogo) setErroDecisao(erro);
        else setMensagem({ texto: erro, erro: true });
        return;
      }
      setErroDecisao(null);
      setMensagem({ texto: t(chaveSucesso), erro: false });
      setPedidoMotivo(null);
    } finally {
      aGravar.current = false;
    }
  };

  const accionar = (item: ItemFila, accao: IdDeAccao): void => {
    if (item.tipo !== "ausencia") return;
    const pedidoId = item.pedido.id;
    if (accao === "aprovar_chefia") {
      void executar(() => decisoes.decidirChefia({ pedidoId, resultado: "aprovado" }), "hr.ausencias.decisao.aprovadoOk");
    } else if (accao === "aprovar_rh") {
      void executar(() => decisoes.decidirRh({ pedidoId, resultado: "aprovado" }), "hr.ausencias.decisao.aprovadoOk");
    } else if (ehAccaoComMotivo(accao)) {
      setErroDecisao(null);
      setPedidoMotivo({ item, accao });
    }
  };

  const confirmarMotivo = (resultado: ResultadoMotivo): void => {
    if (!pedidoMotivo) return;
    const { item, accao } = pedidoMotivo;
    const pedidoId = item.pedido.id;
    if (accao === "recusar_chefia") {
      void executar(() => decisoes.decidirChefia({ pedidoId, resultado: "recusado", motivo: resultado.motivo }), "hr.ausencias.decisao.recusadoOk");
    } else if (accao === "ajustar") {
      void executar(
        () =>
          decisoes.decidirChefia({
            pedidoId,
            resultado: "ajustado",
            motivo: resultado.motivo,
            ajusteDataInicio: resultado.dataInicio ?? null,
            ajusteDataFim: resultado.dataFim ?? null,
          }),
        "hr.ausencias.decisao.ajustadoOk",
      );
    } else if (accao === "recusar_rh") {
      void executar(() => decisoes.decidirRh({ pedidoId, resultado: "recusado", motivo: resultado.motivo }), "hr.ausencias.decisao.recusadoOk");
    } else {
      void executar(() => decisoes.decidirRh({ pedidoId, resultado: "devolvido", motivo: resultado.motivo }), "hr.ausencias.decisao.devolvidoOk");
    }
  };

  return (
    <PainelFilaBase
      aberta={aberta}
      pessoa={pessoa}
      hoje={hoje}
      lidaComSucesso={lidaComSucesso}
      fontesComProblema={fontesComProblema}
      accoesDe={(item) => accoesDoItem(item, permissoesDaFila, null)}
      aoAccionar={accionar}
      aoAbrirDetalhe={(item) => {
        if (item.tipo === "ausencia") aoAbrirDetalhe(item.pedido.id);
      }}
      mensagem={mensagem}
      hrefFicha={`/rh-exemplo/pessoas/${aberta.id}?aba=ausencias`}
      chaveFicha="rhFila.ausencias.abrirFicha"
      chaveLista="rhFila.ausencias.lista"
      chaveResumo="rhFila.ausencias.painelResumo"
      aoFechar={aoFechar}
      aoDevolverFoco={aoDevolverFoco}
    >
      {pedidoMotivo && (
        <MotivoDialog
          aberto
          titulo={t(CHAVES_DO_DIALOGO[pedidoMotivo.accao].titulo)}
          descricao={t(CHAVES_DO_DIALOGO[pedidoMotivo.accao].descricao)}
          rotuloConfirmar={t(CHAVES_DO_DIALOGO[pedidoMotivo.accao].titulo)}
          comDatas={pedidoMotivo.accao === "ajustar"}
          datasIniciais={{ inicio: pedidoMotivo.item.pedido.data_inicio, fim: pedidoMotivo.item.pedido.data_fim }}
          aGravar={decisoes.saving}
          erro={erroDecisao}
          onFechar={() => { setErroDecisao(null); setPedidoMotivo(null); }}
          onConfirmar={confirmarMotivo}
          idPrefixo={`fila-ausencia-${pedidoMotivo.accao}`}
        />
      )}
    </PainelFilaBase>
  );
}
