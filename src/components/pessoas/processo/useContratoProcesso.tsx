// Os passos do fim do percurso (registar a resposta do cliente e registar a assinatura), ao nível da página: qual diálogo cada passo abre,
// o que cada um faz ao negócio (as transições de `transicoesContrato.ts`, gravadas com `gravarAplicacao`) e o aviso do que mudou
// (`controlo.registar`, que só o diz depois de o diálogo desmontar). O Workflow (a configuração) decide o que acontece ao aceitar.
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { escolhasDaPergunta, type Aplicacao } from "@/components/negocio-metas/negocioAcoes";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { gravarAplicacao } from "@/components/negocio-metas/negociosAlterados";
import { useConfigWorkflow } from "@/components/negocio-metas/useWorkflowExemplo";
import type { ResumoPessoa } from "../pessoasTipos";
import type { TipoAviso } from "./anunciosProcesso";
import { itensDaPessoa } from "./itensProcesso";
import { passoDoItem } from "./passosProcesso";
import type { FaltaProcesso } from "./portoesProcesso";
import { estadoDeAgora, useExtrasProcesso } from "./processoNegocios";
import { RegistarAssinatura } from "./RegistarAssinatura";
import { RespostaCliente } from "./RespostaCliente";
import type { ItemProcesso, NegocioDoPasso, PassoProcesso } from "./tiposProcesso";
import { perguntaAoAceitar, registarAssinatura, registarResposta, type DadosResposta, type ResultadoFase } from "./transicoesContrato";
import type { ControloProcesso } from "./useControloProcesso";

type Dialogo = "resposta" | "assinatura";

/** Que diálogo abre cada passo do fim do percurso. */
const DIALOGO_DO_PASSO = { registarRespostaCliente: "resposta", registarAssinatura: "assinatura" } as const satisfies Partial<Record<PassoProcesso, Dialogo>>;

type PassoDoContrato = keyof typeof DIALOGO_DO_PASSO;

export const ehPassoDoContrato = (passo: PassoProcesso): passo is PassoDoContrato => passo in DIALOGO_DO_PASSO;

interface Aberto {
  dialogo: Dialogo;
  itemId: string;
  pessoaId: string;
}

interface Contexto {
  negocio: NegocioMes;
  item: ItemProcesso;
  info: NegocioDoPasso;
}

interface Entrada {
  hoje: string;
  resumos: readonly ResumoPessoa[];
  controlo: ControloProcesso;
  /** "<passo>: ainda não é possível. <o que falta>": o mesmo texto dos portões da página. */
  textoDoBloqueio: (passo: PassoProcesso, faltas: FaltaProcesso[]) => string;
}

export function useContratoProcesso({ hoje, resumos, controlo, textoDoBloqueio }: Entrada) {
  const { t } = useTranslation();
  const config = useConfigWorkflow();
  const extras = useExtrasProcesso();
  const [aberto, setAberto] = useState<Aberto | null>(null);

  const doAberto = ((): Contexto | null => {
    const resumo = aberto && resumos.find((r) => r.pessoa.id === aberto.pessoaId);
    const negocio = resumo?.abertos.find((n) => n.id === aberto?.itemId);
    const item = resumo && itensDaPessoa(resumo, hoje, extras).find((i) => i.id === aberto?.itemId);
    if (!resumo || !negocio || !item) return null;
    return { negocio, item, info: { id: negocio.id, nome: resumo.pessoa.nome, trabalho: item.trabalho?.trim() || t("pessoasPagina.deals.kind.deal") } };
  })();
  // Enquanto o diálogo sai, o aberto já é `null` mas o conteúdo continua a ser o do negócio de que era.
  const ultimo = useRef(doAberto);
  if (doAberto) ultimo.current = doAberto;
  const ctx = doAberto ?? ultimo.current;

  const abrir = (item: ItemProcesso, passo: PassoDoContrato) => setAberto({ dialogo: DIALOGO_DO_PASSO[passo], itemId: item.id, pessoaId: item.pessoaId });
  const explicar = (faltas: FaltaProcesso[]) => textoDoBloqueio(ctx ? passoDoItem(ctx.item).id : "registarRespostaCliente", faltas);

  /** O negócio como está agora no store (e não o do último render), para dois passos seguidos não se pisarem. */
  const negocioDeAgora = (c: Contexto): NegocioMes => estadoDeAgora(c.negocio).negocio;

  /**
   * Grava o que a transição deu e avisa (depois de o diálogo desmontar). Devolve o que falta; se o negócio já não está em aberto
   * diz-o, em vez de deixar o diálogo a parecer que guardou.
   */
  const concluir = (c: Contexto, r: ResultadoFase, aviso: TipoAviso, mensagem?: (a: Aplicacao) => string): FaltaProcesso[] => {
    if (!r.ok) {
      // Nada a explicar: o negócio já não está neste passo (não acontece com o diálogo aberto); fecha-se sem gravar.
      if (r.emFalta.length === 0) setAberto(null);
      return r.emFalta;
    }
    gravarAplicacao(r.aplicacao, hoje);
    controlo.registar(aviso, c.item.pessoaId, mensagem?.(r.aplicacao), c.item.id);
    setAberto(null);
    return [];
  };

  const aoRegistarResposta = (dados: DadosResposta): FaltaProcesso[] => {
    if (!doAberto) return ["negocioDesapareceu"];
    const r = registarResposta(negocioDeAgora(doAberto), doAberto.item, dados, config, hoje);
    const nome = doAberto.info.nome;
    const recusa = (a: Aplicacao) => t("pessoasPagina.done.refused", { name: nome, reason: a.tipo === "perdido" ? a.motivo : "" });
    return concluir(doAberto, r, dados.resposta === "recusada" ? "recusa" : "resposta", dados.resposta === "recusada" ? recusa : undefined);
  };
  const aoConfirmarAssinatura = (): FaltaProcesso[] => {
    if (!doAberto) return ["negocioDesapareceu"];
    return concluir(doAberto, registarAssinatura(negocioDeAgora(doAberto), doAberto.item, config, hoje), "assinatura");
  };

  const negocioDe = (dialogo: Dialogo) => (ctx && aberto?.dialogo === dialogo ? ctx.info : null);
  const escolhas = ctx && perguntaAoAceitar(config, negocioDeAgora(ctx)) ? escolhasDaPergunta(config, "aceitarProposta").map((e) => e.valor) : [];

  const dialogos: ReactNode = (
    <>
      <RespostaCliente
        negocio={negocioDe("resposta")} motivos={config.motivosPerda} escolhas={escolhas} aoRegistar={aoRegistarResposta} explicar={explicar}
        aoFechar={() => setAberto(null)} aoDevolverFoco={controlo.aoDevolverFoco}
      />
      <RegistarAssinatura
        negocio={negocioDe("assinatura")} aoConfirmar={aoConfirmarAssinatura} explicar={explicar} aoFechar={() => setAberto(null)}
        aoDevolverFoco={controlo.aoDevolverFoco}
      />
    </>
  );
  return { abrir, dialogos };
}
