// Os passos do orçamento e da proposta (Fase 4), ao nível da página: qual diálogo cada passo abre (o editor, a verificação, a Direção
// simulada, enviar a proposta), o que cada um faz ao negócio (as transições, gravadas com `gravarTransicao`: o `NegocioMes` e os extras
// juntos) e o aviso do que mudou (`controlo.registar`, que só o diz depois de o diálogo desmontar). Só exemplo, em memória.
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { ResumoPessoa } from "../pessoasTipos";
import type { TipoAviso } from "./anunciosProcesso";
import { chaveDoTrabalho, linhasDoLevantamento } from "./catalogoTrabalhos";
import { condicoesIniciais, type CondicoesForm } from "./condicoesProposta";
import { DirecaoSimulada } from "./DirecaoSimulada";
import { criarEspera } from "./esperaDeDialogo";
import { EditorOrcamento, type OrcamentoInicial } from "./EditorOrcamento";
import { EnviarProposta } from "./EnviarProposta";
import { itensDaPessoa } from "./itensProcesso";
import { rotuloDoTrabalho } from "./nomesOrcamento";
import { totaisDoOrcamento } from "./orcamentoCalculo";
import { orcamentoDoNegocio, type OrcamentoDetalhado } from "./orcamentoDetalhado";
import { passoDoItem } from "./passosProcesso";
import type { FaltaProcesso } from "./portoesProcesso";
import { estadoDeAgora, gravarTransicao, useExtrasProcesso } from "./processoNegocios";
import type { ItemProcesso, NegocioDoPasso, PassoProcesso } from "./tiposProcesso";
import {
  enviarProposta, guardarOrcamento, pedirAprovacaoDirecao, responderDirecao, verificarOrcamento, type DadosDoOrcamento, type EstadoTransicao,
  type Transicao,
} from "./transicoes";
import type { ControloProcesso } from "./useControloProcesso";
import { VerificarOrcamento } from "./VerificarOrcamento";

type Dialogo = "editor" | "verificar" | "direcao" | "proposta";

/** Que diálogo abre cada passo do orçamento e da proposta. */
const DIALOGO_DO_PASSO = {
  criarOrcamento: "editor", verificarOrcamento: "verificar", aguardarDirecao: "direcao", enviarProposta: "proposta",
} as const satisfies Partial<Record<PassoProcesso, Dialogo>>;

type PassoDoOrcamento = keyof typeof DIALOGO_DO_PASSO;

export const ehPassoDoOrcamento = (passo: PassoProcesso): passo is PassoDoOrcamento => passo in DIALOGO_DO_PASSO;

/** O diálogo aberto e o item que o abriu. */
interface Aberto {
  dialogo: Dialogo;
  itemId: string;
  pessoaId: string;
}

/** Tudo o que os diálogos precisam de saber do negócio do item aberto. */
interface Contexto {
  negocio: NegocioMes;
  item: ItemProcesso;
  /** O orçamento detalhado do orçamento escolhido (os negócios de exemplo não o têm). */
  orcamento: OrcamentoDetalhado | undefined;
  info: NegocioDoPasso;
}

const ORCAMENTO_VAZIO: OrcamentoInicial = { linhas: [], desconto: 0, vendaDireta: false, versao: 1 };
const CONDICOES_VAZIAS: CondicoesForm = condicoesIniciais([]);

interface Entrada {
  hoje: string;
  resumos: readonly ResumoPessoa[];
  controlo: ControloProcesso;
  /** "<passo>: ainda não é possível. <o que falta>": o mesmo texto dos portões da página. */
  textoDoBloqueio: (passo: PassoProcesso, faltas: FaltaProcesso[]) => string;
}

export function useOrcamentoProcesso({ hoje, resumos, controlo, textoDoBloqueio }: Entrada) {
  const { t } = useTranslation();
  const extras = useExtrasProcesso();
  const [aberto, setAberto] = useState<Aberto | null>(null);
  // "Editar o orçamento", na verificação: fecha esta e abre o editor DEPOIS de ela desmontar (dois diálogos nunca se sobrepõem). A
  // espera sabe de que diálogo veio: o fecho de outro não a consome.
  const [espera] = useState(() => criarEspera<Dialogo, Aberto>());

  const doAberto = ((): Contexto | null => {
    const resumo = aberto && resumos.find((r) => r.pessoa.id === aberto.pessoaId);
    const negocio = resumo?.abertos.find((n) => n.id === aberto?.itemId);
    const item = resumo && itensDaPessoa(resumo, hoje, extras).find((i) => i.id === aberto?.itemId);
    if (!resumo || !negocio || !item) return null;
    const info = { id: negocio.id, nome: resumo.pessoa.nome, trabalho: item.trabalho?.trim() || t("pessoasPagina.deals.kind.deal") };
    return { negocio, item, orcamento: orcamentoDoNegocio(negocio, extras), info };
  })();
  // Enquanto o diálogo sai, o aberto já é `null` mas o conteúdo continua a ser o do negócio de que era.
  const ultimo = useRef(doAberto);
  if (doAberto) ultimo.current = doAberto;
  const ctx = doAberto ?? ultimo.current;

  const abrir = (item: ItemProcesso, passo: PassoDoOrcamento) =>
    setAberto({ dialogo: DIALOGO_DO_PASSO[passo], itemId: item.id, pessoaId: item.pessoaId });

  const explicar = (faltas: FaltaProcesso[]) => textoDoBloqueio(ctx ? passoDoItem(ctx.item).id : "criarOrcamento", faltas);

  /**
   * Corre uma transição com o estado de agora (o negócio lido do store neste momento, não o do último render) e, se deu certo,
   * grava-a (o negócio e os extras juntos). Com `aviso` o passo acabou: diz-se (depois de o diálogo desmontar) e o diálogo fecha;
   * sem ele o diálogo fica (um ajuste na verificação). Devolve o que falta; se o negócio já não está em aberto diz-o, em vez de
   * deixar o diálogo a parecer que guardou.
   */
  const aplicar = (transicao: (estado: EstadoTransicao, item: ItemProcesso) => Transicao, aviso?: TipoAviso): FaltaProcesso[] => {
    if (!doAberto) return ["negocioDesapareceu"];
    const estado = estadoDeAgora(doAberto.negocio);
    const r = transicao(estado, doAberto.item);
    if (r.ok === false) {
      // Nada a explicar: o negócio já não está neste passo (não acontece com o diálogo aberto); fecha-se sem gravar.
      if (r.emFalta.length === 0) setAberto(null);
      return r.emFalta;
    }
    gravarTransicao(estado, r);
    if (aviso) {
      controlo.registar(aviso, doAberto.item.pessoaId, undefined, doAberto.item.id);
      setAberto(null);
    }
    return [];
  };

  /** O diálogo `dialogo` fechou e desmontou: abre o que estava à espera DELE (e não devolve o foco) ou devolve o foco ao botão certo. */
  const aoDevolverFocoDe = (dialogo: Dialogo) => (): boolean => {
    const proximo = espera.consumir(dialogo);
    if (proximo === null) return controlo.aoDevolverFoco();
    setAberto(proximo);
    return true;
  };

  const aoFechar = () => setAberto(null);
  const aoEditar = () => {
    if (!aberto) return;
    espera.guardar(aberto.dialogo, { ...aberto, dialogo: "editor" });
    setAberto(null);
  };
  /** O negócio de um diálogo: só o do diálogo aberto o tem (os outros ficam fechados). */
  const negocioDe = (dialogo: Dialogo) => (ctx && aberto?.dialogo === dialogo ? ctx.info : null);

  const dialogos: ReactNode = (
    <>
      <EditorOrcamento
        negocio={negocioDe("editor")} inicial={ctx ? inicialDoEditor(ctx, t) : ORCAMENTO_VAZIO} explicar={explicar} aoFechar={aoFechar}
        aoGuardar={(dados: DadosDoOrcamento) => aplicar((e, i) => guardarOrcamento(e, i, dados, hoje), "orcamento")} aoDevolverFoco={aoDevolverFocoDe("editor")}
      />
      <VerificarOrcamento
        negocio={negocioDe("verificar")} orcamento={ctx?.orcamento} explicar={explicar} aoFechar={aoFechar} aoEditar={aoEditar} aoDevolverFoco={aoDevolverFocoDe("verificar")}
        aoAjustar={(dados) => aplicar((e, i) => guardarOrcamento(e, i, dados, hoje))}
        aoPedirDirecao={() => aplicar(pedirAprovacaoDirecao, "direcaoPedida")} aoVerificar={() => aplicar(verificarOrcamento, "verificado")}
      />
      <DirecaoSimulada
        negocio={negocioDe("direcao")} margem={ctx?.orcamento ? totaisDoOrcamento(ctx.orcamento).margem : 0} explicar={explicar}
        aoResponder={(aprovada) => aplicar((e, i) => responderDirecao(e, i, { aprovada }), aprovada ? "direcaoAprovada" : "direcaoRecusada")}
        aoFechar={aoFechar} aoDevolverFoco={aoDevolverFocoDe("direcao")}
      />
      <EnviarProposta
        negocio={negocioDe("proposta")} total={ctx ? valorDoNegocio(ctx.negocio) : 0} hoje={hoje} explicar={explicar} aoFechar={aoFechar}
        iniciais={ctx?.orcamento ? condicoesIniciais(ctx.orcamento.linhas) : CONDICOES_VAZIAS} aoDevolverFoco={aoDevolverFocoDe("proposta")}
        aoEnviar={(condicoes) => aplicar((e, i) => enviarProposta(e, i, condicoes, hoje), "proposta")}
      />
    </>
  );
  return { abrir, dialogos };
}

/** O orçamento com que o editor abre: o já guardado, ou as linhas do levantamento da visita (se o negócio as tem), ou vazio. */
function inicialDoEditor(ctx: Contexto, t: Traduzir): OrcamentoInicial {
  const o = ctx.orcamento;
  if (o) return { linhas: o.linhas, desconto: o.desconto, vendaDireta: o.vendaDireta, versao: o.versao };
  const linhas = linhasDoLevantamento(ctx.negocio.levantamento?.linhas ?? [], (texto) => chaveDoTrabalho(texto, (c) => rotuloDoTrabalho(t, c)));
  return { ...ORCAMENTO_VAZIO, linhas };
}
