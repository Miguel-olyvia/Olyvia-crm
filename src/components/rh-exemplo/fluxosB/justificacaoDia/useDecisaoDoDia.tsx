/**
 * A decisão do RH sobre uma justificação de dia, para os dois ecrãs que a tomam (a fila e o painel do dia da ficha).
 *
 * Tudo se decide na base e uma decisão é UMA chamada. Recusar exige motivo (valida-se antes de ir à base) e não toca em faltas.
 * Aceitar monta `AceitarComFaltaReal` enquanto dura: a base marca a falta, regista a justificação e decide-a na mesma
 * transacção, por isso ou fica tudo feito ou nada fica escrito, e a mensagem diz qual dos dois. A fila, o contador e o
 * calendário acompanham sozinhos (as leituras relêem quando uma decisão é gravada). Enquanto uma aceitação corre não se aceita outra.
 *
 * MÊS FECHADO: a base recusa aceitar sem confirmação (`rhJust.erro.mesFechado`, nada escrito). Aqui isso não é um erro: abre-se
 * um diálogo de confirmação, e só «Aceitar na mesma» volta a chamar a base, agora com `confirmarMesFechado`. Cancelar não decide
 * nada. O diálogo vem dentro do `executor`, por isso os dois ecrãs que o montam têm-no sem mudar nada.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { useAccoesJustificacaoDia } from "@/components/rh-exemplo/hooks/useJustificacoesDoDia";
import { criaFalta, type DecisaoQueCriaFalta } from "@/components/rh-exemplo/lib/faltaDaAceitacao";
import { motivoValido } from "@/components/rh-exemplo/lib/horarioTipos";
import { CHAVE_ERRO_MES_FECHADO, type DecisaoJustificacaoDia, type JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { AceitarComFaltaReal, type ResultadoDaAceitacao } from "./AceitarComFaltaReal";
import { textoDaDecisao } from "./textoDaDecisao";

export interface MensagemDeDecisao {
  texto: string;
  erro: boolean;
}

interface Execucao {
  justificacao: JustificacaoDia;
  decisao: DecisaoQueCriaFalta;
  /** Já confirmado que se aceita num mês fechado (segunda chamada, depois do diálogo). */
  confirmarMesFechado: boolean;
}

/** A chave do erro, ou `null` quando ficou decidida. É uma promessa quando a decisão ainda vai à base. */
export type RespostaDaDecisao = string | null | Promise<string | null>;

/** `aoCriarFalta`: chamado quando a base ficou com uma falta nova, para o ecrã reler o dia (o mapa, o mês). */
export function useDecisaoDoDia(aoCriarFalta?: () => void) {
  const { t } = useTranslation();
  const { decidir: decidirNaBase } = useAccoesJustificacaoDia();
  const [execucao, setExecucao] = useState<Execucao | null>(null);
  // A aceitação que a base parou por o mês estar fechado, à espera da resposta do RH no diálogo.
  const [porConfirmar, setPorConfirmar] = useState<Execucao | null>(null);
  // O mesmo, fora do ciclo de renderização: «Aceitar na mesma» fecha o diálogo e o `onOpenChange(false)` que se segue não
  // pode ser lido como «Cancelar».
  const aConfirmar = useRef<Execucao | null>(null);
  const [aRecusar, setARecusar] = useState(false);
  const [mensagem, setMensagem] = useState<MensagemDeDecisao | null>(null);

  const recusar = useCallback(
    (j: JustificacaoDia, motivo: string): RespostaDaDecisao => {
      if (!motivoValido(motivo)) {
        const chave = "rhExemplo.pic.erro.motivoCurto";
        setMensagem({ texto: t(chave), erro: true });
        return chave;
      }
      setARecusar(true);
      return decidirNaBase({ justificacaoId: j.id, decisao: "recusar", motivo: motivo.trim() }).then((r) => {
        setARecusar(false);
        if (r.erro) {
          setMensagem({ texto: t(r.erro), erro: true });
          return r.erro;
        }
        setMensagem({ texto: textoDaDecisao(t, "recusar", r), erro: false });
        return null;
      });
    },
    [decidirNaBase, t],
  );

  /** Devolve a chave do erro quando a decisão não pôde sequer começar; `null` quando ficou decidida ou está a correr. */
  const decidir = useCallback(
    (j: JustificacaoDia, decisao: DecisaoJustificacaoDia, motivo = ""): RespostaDaDecisao => {
      if (!criaFalta(decisao)) return recusar(j, motivo);
      if (execucao || porConfirmar) return null;
      setMensagem({ texto: t("rhJust.rh.aMarcarFalta"), erro: false });
      setExecucao({ justificacao: j, decisao, confirmarMesFechado: false });
      return null;
    },
    [execucao, porConfirmar, recusar, t],
  );

  const concluir = useCallback(
    (r: ResultadoDaAceitacao) => {
      const em = execucao;
      setExecucao(null);
      if (!em) return;
      if (r.erro === CHAVE_ERRO_MES_FECHADO && !em.confirmarMesFechado) {
        // Nada ficou escrito: a base pede confirmação antes de aceitar num mês fechado.
        setMensagem(null);
        aConfirmar.current = em;
        setPorConfirmar(em);
        return;
      }
      if (r.erro) {
        // A decisão é uma transacção: se falhou, nada ficou escrito (nem a falta, nem a decisão).
        setMensagem({ texto: t("rhJust.erro.aceitarFalhou", { motivo: t(r.erro) }), erro: true });
        return;
      }
      aoCriarFalta?.();
      setMensagem({ texto: textoDaDecisao(t, em.decisao, r), erro: false });
    },
    [execucao, t, aoCriarFalta],
  );

  const confirmarMesFechado = useCallback(() => {
    const em = aConfirmar.current;
    aConfirmar.current = null;
    setPorConfirmar(null);
    if (!em) return;
    setMensagem({ texto: t("rhJust.rh.aMarcarFalta"), erro: false });
    setExecucao({ ...em, confirmarMesFechado: true });
  }, [t]);

  const cancelarMesFechado = useCallback(() => {
    // Já confirmado (o fecho do diálogo depois de «Aceitar na mesma»): não há nada a cancelar.
    if (!aConfirmar.current) return;
    aConfirmar.current = null;
    setPorConfirmar(null);
    setMensagem({ texto: t("rhJust.rh.mesFechadoCancelado"), erro: false });
  }, [t]);

  // `null` quando não há nada a correr nem a confirmar: quem o monta usa isso para saber se o bloco tem algo a mostrar.
  const executor: ReactNode = execucao === null && porConfirmar === null ? null : (
    <>
      {execucao && (
        <AceitarComFaltaReal
          // A confirmação é outra chamada: outra chave, para o executor voltar a correr.
          key={`${execucao.justificacao.id}-${String(execucao.confirmarMesFechado)}`}
          justificacao={execucao.justificacao}
          decisao={execucao.decisao}
          confirmarMesFechado={execucao.confirmarMesFechado}
          aoConcluir={concluir}
        />
      )}
      <AlertDialog open={porConfirmar !== null} onOpenChange={(aberto) => !aberto && cancelarMesFechado()}>
        <AlertDialogContent data-testid="rhjd-mes-fechado">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rhJust.rh.mesFechadoTitulo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("rhJust.rh.mesFechadoDescricao", { dia: porConfirmar ? formatarData(porConfirmar.justificacao.data) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="min-h-11">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={confirmarMesFechado}>{t("rhJust.rh.mesFechadoConfirmar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { decidir, mensagem, executor, aOcupar: execucao !== null || porConfirmar !== null || aRecusar };
}
