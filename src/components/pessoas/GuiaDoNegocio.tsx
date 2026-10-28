// O guia do passo seguinte de um NEGÓCIO aberto: liga o ecrã de apresentação (`GuiaDoPasso`) ao que o negócio já tem. O botão primário faz o passo
// no próprio ecrã: criar o orçamento abre o editor real (o mesmo executor do Quadro e da Lista), «Fazer o levantamento» abre o painel «Visita e
// levantamento» ligado ao negócio e à pessoa; no Pipeline não há «Ganhar o negócio» nem «Fechar agora». Enviar a proposta, a resposta do cliente,
// criar o contrato e a assinatura abrem o seu diálogo por cima do guia (`DocumentosDoNegocioReal`), sem navegar. Nada se grava aqui: o guia só
// escolhe qual painel abrir. Com `cabecalhoFicha` é o ÚNICO cabeçalho da ficha com o negócio aberto: o nome da pessoa e o serviço (a linha), o valor e o
// comercial no passo, e o paginador e as ações da pessoa (Email, Mais) no cabeçalho.
import { useMemo, type MouseEvent, type ReactNode, type Ref } from "react";
import { useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { registosDoNegocio } from "@/components/negocio-metas/acoesRegistos";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { saudeDoNegocio } from "@/components/negocio-metas/saudeNegocio";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { useDocumentosDoNegocio } from "@/components/pessoas-processo/DocumentosDoNegocioReal";
import { ehPassoDeDocumento } from "@/components/pessoas-processo/documentosGuia";
import { useLevantamentoDoNegocio } from "@/components/pessoas-processo/LevantamentoDoNegocioReal";
import { ContactoDoGuia } from "./assistente/ContactoDoGuia";
import { levantamentoMaisRecente, visitaMarcadaMaisRecente } from "./assistente/hidratarAssistente";
import { VisitaDoGuia } from "./assistente/VisitaDoGuia";
import type { PecasCabecalhoFicha } from "./CabecalhoGuiaFicha";
import type { FaseDoNegocio } from "./fasesDoNegocio";
import { GuiaDoPasso, type AberturaDoAssistente } from "./GuiaDoPasso";
import { leituraDoPasso } from "./assistente/LeituraDoContacto";
import { acontecimentosDoGuia, clienteDoGuia, dadosDoGuia } from "./guiaDados";
import { useMarcarVisita, type AberturaVisita } from "./marcarVisitaContexto";
import { moradaDaLead } from "./moradaVisita";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";
import { itemComFaseConcluida, itemComFaseDaAbordagem, type LigadosDoNegocio } from "./processo/abordagemDoNegocio";
import { calcularPassoGuiado } from "./processo/passoGuiado";
import { passoDoItem } from "./processo/passosProcesso";
import { useAcaoDoPasso } from "./processo/processoContexto";
import type { ItemProcesso, PassoProcesso } from "./processo/tiposProcesso";
import { Prazo } from "./SeccoesResumo";
import { barraUnica } from "./negocioEmylia/barraUnica";
import { EstadoHonesto } from "./negocioEmylia/EstadoHonesto";
import { FASES_EMYLIA, itemDoPosContrato, type FaseEmylia } from "./negocioEmylia/faseEmylia";
import { PassarParaNegocio } from "./negocioEmylia/PassarParaNegocio";
import { NegocioEmyliaDoGuia } from "./negocioEmylia/NegocioEmyliaDoGuia";
import type { DadosDaAbordagem } from "./negocioEmylia/passagemParaNegocio";
import { useNegocioEmyliaDoGuia } from "./negocioEmylia/useNegocioEmyliaDoGuia";

interface GuiaDoNegocioProps {
  negocio: NegocioMes;
  hoje: string;
  /** O item do processo do negócio; sem ele (um negócio ganho ou perdido) o guia fica sem passo: o cabeçalho, a barra de fases e o cartão do cliente. */
  item?: ItemProcesso;
  /** As fases do negócio (as reais: sem Financeiro nem Obra), com a atual marcada. */
  fases: readonly FaseDoNegocio[];
  /** Pode agir neste negócio (aberto e com permissão de editar): sem isto os passos de escrita ficam desativados com a razão. */
  podeEditar: boolean;
  /** A pessoa e a atividade da ficha: o cartão do cliente e os últimos acontecimentos. Sem elas (o exemplo) vale o que o negócio traz. */
  pessoa?: Pessoa;
  atividade?: readonly ItemAtividade[];
  /** «Perder negócio», quando se pode. */
  acaoPerder?: ReactNode;
  /** O cabeçalho único da ficha (título, selos, paginador, Email e Mais): sem isto o guia desenha o nome da pessoa. */
  cabecalhoFicha?: PecasCabecalhoFicha;
  /** O h3 que recebe o foco (a linha do serviço, ou o nome sem cabeçalho da ficha). */
  tituloRef?: Ref<HTMLHeadingElement>;
  /** Sem passo a fazer (negócio fechado, ou terminado) mesmo que haja item. */
  semPasso?: boolean;
  /** A faixa fina por baixo do cabeçalho (a perda, os avisos do negócio e os alertas da pessoa); sem isto vale a do cabeçalho da ficha. */
  faixa?: ReactNode;
  /** Abre o registo da chamada da ficha (o passo «Registar a chamada» de um negócio por contactar e o botão do assistente); `origem` é o botão a que o foco volta. */
  aoRegistarChamada?: (origem: HTMLElement | null) => void;
  /** O que acompanha o guia (a nota do fecho, o bloco de fecho): vai no fim da coluna do meio, a que rola em ecrã largo. */
  rodape?: ReactNode;
}

export function GuiaDoNegocio({ negocio, hoje, item, fases, podeEditar, pessoa, atividade, acaoPerder, cabecalhoFicha, tituloRef, semPasso = false, faixa, aoRegistarChamada, rodape }: GuiaDoNegocioProps) {
  const { t } = useTranslation();
  const fonte = useFontePessoas();
  const registos = useRegistosPessoa();
  const levantamento = useLevantamentoDoNegocio();
  const documentos = useDocumentosDoNegocio();
  // A fase da abordagem DO NEGÓCIO (Por contactar, Contactado, Visita): o Pipeline só tem negócios, e um negócio sem orçamento está onde o que tem ligado o põe.
  const doNegocio = registosDoNegocio(registos, negocio.id);
  const ligados: LigadosDoNegocio = {
    contactos: doNegocio.contactos.length, visitasMarcadas: doNegocio.visitas.filter((v) => v.estado !== "cancelada").length,
    levantamentos: doNegocio.levantamentos.length, comLevantamentoEscrito: Boolean(negocio.levantamento),
  };
  // E a fase que se conclui com a ficha aberta (uma chamada registada, uma visita marcada, o levantamento guardado) passa à seguinte no momento, sem esperar pelo quadro.
  const itemDaAbordagem = item ? itemComFaseConcluida(itemComFaseDaAbordagem(item, ligados), ligados) : item;
  // Do Negócio em diante (Orçamento, Proposta, Contrato, Financeiro, Obra) o conteúdo e as regras são os da Emylia, lidos e gravados pelo caminho do Ben
  // (negocioEmylia/): a fase vem do negócio lido da base e, com documentos do CRM ou por ler, do que o CRM prova (contrato assinado = Financeiro).
  // A ponte da abordagem: o que a passagem Visita → Negócio leva para a Emylia (pedido, email) e as contagens que ficam como referência.
  const dadosDaAbordagem: DadosDaAbordagem = {
    pedidoCliente: negocio.pedidoCliente ?? "", email: pessoa?.contacto.email ?? "",
    chamadas: ligados.contactos, visitas: ligados.visitasMarcadas, levantamentos: ligados.levantamentos,
  };
  const emylia = useNegocioEmyliaDoGuia(negocio, {
    faseDoItem: itemDaAbordagem?.fase ?? null, podeEditar, dados: dadosDaAbordagem,
    // o levantamento guardado (ligado ou escrito) é o que abre a saída «Passar para o Negócio»
    levantamentoGuardado: ligados.levantamentos > 0 || ligados.comLevantamentoEscrito,
  });
  const faseEmylia = emylia.faseEmylia;
  // A fase do Negócio em diante que o guia mostra: a da Emylia ou, enquanto a leitura não acaba (ou falhou), a que o CRM mostra, com o estado dito.
  const faseNova = faseEmylia ?? (emylia.leituraBloqueia ? emylia.faseDoCrm : null);
  // Um negócio ganho não tem item de processo: com fase nova ganha um, só para o guia ter fase, barra e «Fases feitas».
  const itemGuia = itemDaAbordagem ?? (faseNova !== null && pessoa ? itemDoPosContrato(negocio, pessoa.id) : undefined);
  const acao = useAcaoDoPasso(itemGuia, () => undefined);
  const permissoesFecho = fonte.modo === "real" ? fonte.permissoesFecho : undefined;
  const passoAtual = itemGuia ? passoDoItem(itemGuia).id : null;
  const comDocumento = passoAtual !== null && ehPassoDeDocumento(passoAtual) && documentos?.pode(passoAtual, negocio.id) === true;
  // UMA só barra: Por contactar, Contactado, Visita, Orçamento, Proposta, Contrato, Financeiro, Obra (o Levantamento é o fim da Visita).
  const contratoAssinado = negocio.contrato?.estado === "assinado" && negocio.estadoReal !== "perdido";
  // A fase atual vem da MESMA função que o quadro usa (faseDoPipeline): a mais avançada entre a da Emylia, a da coluna, a do que o negócio tem e a gravada em negocios.fase.
  const fasesDoGuia = barraUnica({
    faseDoItem: itemGuia?.fase ?? null, fasesDoNegocio: fases, faseEmylia: faseNova, perdido: negocio.estadoReal === "perdido",
    tem: { chamadas: ligados.contactos, visitas: ligados.visitasMarcadas, levantamento: ligados.levantamentos > 0 || ligados.comLevantamentoEscrito, orcamentos: itemGuia?.orcamentos ?? 0, proposta: false, contrato: contratoAssinado },
    faseGravada: emylia.e.d?.fase ?? null,
  });
  const doPassoBase = itemGuia && (!semPasso || faseNova !== null) ? calcularPassoGuiado(itemGuia, {
    dados: dadosDoGuia(pessoa ?? { nome: negocio.pessoa, contacto: negocio.contacto }, doNegocio, t, negocio),
    fases: fasesDoGuia,
    podeEditar, podeCriar: false, permissoesFecho, pessoaFechada: false,
    ligados: ligadosDoNegocio(itemGuia, acao.executa, levantamento?.pode === true && pessoa !== undefined, comDocumento, aoRegistarChamada !== undefined),
  }) : null;
  // No Levantamento a coluna da esquerda continua a chamar-se «Levantamento» (o texto da abordagem não muda), mesmo que a barra diga Visita.
  const doPasso = doPassoBase && itemGuia?.fase === "levantamento" ? { ...doPassoBase, faseRotuloChave: "pessoasPagina.phases.levantamento" } : doPassoBase;
  const aoAcao = (e: MouseEvent<HTMLElement>): void => {
    if (!doPasso) return;
    // O levantamento faz-se no assistente de passos (sem botão do passo): sem o assistente não há nada a abrir.
    if (doPasso.passo === "fazerLevantamento") return;
    if (doPasso.passo === "registarChamada") { aoRegistarChamada?.(e.currentTarget); return; }
    if (ehPassoDeDocumento(doPasso.passo)) documentos?.abrir(doPasso.passo, negocio.id);
    else acao.aoClicar(e);
  };
  const { cliente, local } = clienteDoGuia(pessoa ?? { contacto: negocio.contacto }, negocio.servico);
  const acontecimentos = useMemo(() => acontecimentosDoGuia(t, atividade ?? []), [t, atividade]);
  // O assistente de passos da fase Visita: no negócio em Levantamento, no lugar do «Fazer o levantamento» único. Os passos da secção e o último gravam
  // o levantamento do negócio (um por negócio) sem abrir o painel «Visita e levantamento».
  const marcar = useMarcarVisita();
  const nivel = cabecalhoFicha?.nomeEl !== undefined ? "h3" : "h2";
  const abrirAgenda = marcar && podeEditar && pessoa
    ? (preparar?: AberturaVisita["preparar"]) => marcar.pedir({
      pessoaId: pessoa.id, nome: pessoa.nome, moradaLead: moradaDaLead(pessoa), negocioId: negocio.id, ...(preparar ? { preparar } : {}),
    })
    : undefined;
  // Qual assistente abre: numa fase feita que se VÊ, o dessa fase (só para ler); senão o da fase atual (Contactado, ou a Visita/Levantamento).
  const assistenteDe = (faseVista: string | null): "contacto" | "visita" | null => {
    if (faseVista !== null) return faseVista === "contactado" || faseVista === "contacto" ? "contacto" : faseVista === "visita" ? "visita" : null;
    return itemGuia?.fase === "contactado" ? "contacto" : doPasso?.passo === "fazerLevantamento" ? "visita" : null;
  };
  // A fase da Emylia que se vê: a atual, ou uma já feita que se escolheu (as fases da abordagem continuam a ser dos assistentes de sempre).
  const faseEmyliaVista = (faseVista: string | null): FaseEmylia | null => {
    if (faseNova === null) return null;
    if (faseVista === null) return faseNova;
    return (FASES_EMYLIA as readonly string[]).includes(faseVista) ? (faseVista as FaseEmylia) : null;
  };
  const assistente = doPasso && pessoa
    ? ({ aoVerFase, extra: extraDoGuia, faseVista, aoVoltarAoAtual, focarAoMontar }: AberturaDoAssistente): ReactNode => {
      const daEmylia = faseEmyliaVista(faseVista);
      if (daEmylia !== null && faseNova !== null) {
        return (
          <NegocioEmyliaDoGuia
            fase={daEmylia} atual={faseNova} e={emylia.e} org={emylia.org} podeEditar={podeEditar} feitas={doPasso.feitas} faseVista={faseVista}
            aoVerFase={aoVerFase} aoVoltarAoAtual={aoVoltarAoAtual} nivel={nivel} extra={extraDoGuia} aPassar={emylia.aPassar} repetirGravacao={emylia.repetirGravacao}
            abordagem={{ email: dadosDaAbordagem.email, chamadas: ligados.contactos, visitasMarcadas: ligados.visitasMarcadas, levantamentos: ligados.levantamentos }}
          />
        );
      }
      const qual = assistenteDe(faseVista);
      if (qual === null) return null;
      const feita = faseVista !== null ? doPasso.feitas.find((f) => f.id === faseVista) : undefined;
      // Uma fase feita que o guia não tem entre as suas (não devia acontecer) fica com a leitura de sempre.
      if (faseVista !== null && !feita) return null;
      const fasePassada = feita ? { id: feita.id, aoVoltar: aoVoltarAoAtual } : undefined;
      const rotulo = feita ? feita.rotuloChave : doPasso.faseRotuloChave;
      // A chave separa a fase atual de cada fase feita: o passo escolhido e o que se escreveu não passam de uma para a outra.
      return qual === "contacto" ? (
        <ContactoDoGuia
          key={faseVista ?? "atual"} fasePassada={fasePassada} focarAoMontar={focarAoMontar}
          pessoa={pessoa} negocio={{ id: negocio.id, pedidoCliente: negocio.pedidoCliente, qualificacaoGravada: negocio.qualificacaoGravada }}
          chamadas={ligados.contactos} historicoChamadas={doNegocio.contactos} visita={visitaMarcadaMaisRecente(doNegocio.visitas)} levantamento={levantamentoMaisRecente(doNegocio.levantamentos) ?? null} visitaMarcada={ligados.visitasMarcadas > 0} ultimoResultado={dadosDoGuia(pessoa, doNegocio).ultimoResultado}
          podeEditar={podeEditar} podeRegistarChamada={aoRegistarChamada !== undefined} aoRegistarChamada={(origem) => aoRegistarChamada?.(origem)}
          aoMarcarVisita={abrirAgenda ? (preparar) => abrirAgenda(preparar) : undefined}
          faseRotuloChave={rotulo} feitas={doPasso.feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extraDoGuia}
        />
      ) : (
        <VisitaDoGuia
          key={faseVista ?? "atual"} fasePassada={fasePassada} focarAoMontar={focarAoMontar}
          pessoa={pessoa} negocio={{ id: negocio.id }} visitas={doNegocio.visitas} levantamentoGuardado={doNegocio.levantamentos.length > 0 || Boolean(negocio.levantamento)} levantamentos={doNegocio.levantamentos}
          ficha={levantamento?.ficha ?? null} podeEditar={podeEditar}
          aoMarcarOutra={abrirAgenda ? () => abrirAgenda() : undefined}
          faseRotuloChave={rotulo} feitas={doPasso.feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extraDoGuia}
        />
      );
    }
    : undefined;
  // Os passos da fase Por contactar não têm assistente: o centro mostra o MESMO ecrã do passo, preenchido, e não uma lista de rótulo e valor.
  const leitura = pessoa
    ? (p: { faseId: string; itemId: string; faseFeita: boolean }): ReactNode => leituraDoPasso(pessoa, p)
    : undefined;
  return (
    <GuiaDoPasso
      passo={doPasso} fases={fasesDoGuia} aoAcao={aoAcao} atributosAcao={acao.atributos} acaoPerder={acaoPerder} assistente={assistente} leitura={leitura}
      explicacao={acao.bloqueio && acao.idBloqueio ? { id: acao.idBloqueio, texto: acao.bloqueio } : null}
      cabecalho={{ nome: pessoa?.nome ?? negocio.pessoa, linha: negocio.servico, telefone: cliente.telefone, local }} cliente={cliente} acontecimentos={acontecimentos}
      tituloSecao={t("pessoasPagina.deal.next")} tituloRef={tituloRef} {...cabecalhoFicha} faixa={faixa ?? cabecalhoFicha?.faixa} rodape={rodape}
      extra={(
        <div className="space-y-2">
          <Prazo prazo={negocio.proximoPrazo} hoje={hoje} />
          {/* «Sem orçamento escolhido» é o normal de um negócio ainda na abordagem: não é um alerta a mostrar no guia. */}
          {saudeDoNegocio(negocio, hoje) !== "semOrcamento" && <SaudeTag negocio={negocio} hoje={hoje} />}
          {/* A saída da Visita: com o levantamento guardado, «Passar para o Negócio» (o que falta responder é opcional e não bloqueia). Acrescenta-se ao que o
              assistente mostra; não muda nenhum passo da Visita nem do Levantamento. */}
          <PassarParaNegocio acao={emylia.passar} erro={emylia.e.gravacao.k === "erro" ? emylia.e.gravacao.t : null} />
          {/* A leitura acabou e a organização não devolveu o negócio: fica o fluxo do CRM, mas diz-se (e deixa tentar outra vez). */}
          {emylia.semNegocioNaEmylia && (
            <EstadoHonesto titulo={t("pessoasPagina.real.neg.porLer.titulo")}>
              {t("pessoasPagina.real.neg.porLer.texto")}{" "}
              <button type="button" onClick={() => { emylia.e.reler(); }} className="min-h-11 rounded-lg border border-input px-4 font-medium">{t("pessoasPagina.real.neg.tentar")}</button>
            </EstadoHonesto>
          )}
        </div>
      )}
    />
  );
}

/**
 * Os passos que este ecrã sabe fazer: os que o processo executa, o levantamento (com o painel ligado ao negócio) e os
 * de documento (diálogo por cima do guia, quando o negócio tem o documento). O levantamento, o ganho e os documentos têm o seu caminho: o executor do
 * processo não conta para eles (e, para os documentos, é ele que levava a /proposals e /client-contracts).
 */
function ligadosDoNegocio(item: ItemProcesso, executa: boolean, levantamento: boolean, documento: boolean, chamada: boolean): ReadonlySet<PassoProcesso> {
  const ligados = new Set<PassoProcesso>();
  const passo = passoDoItem(item).id;
  if (executa && passo !== "fazerLevantamento" && passo !== "ganharNegocio" && !ehPassoDeDocumento(passo)) ligados.add(passo);
  if (levantamento) ligados.add("fazerLevantamento");
  if (documento) ligados.add(passo);
  // «Registar a chamada» de um negócio por contactar abre o registo da ficha (o executor do processo não o conhece no Pipeline).
  if (chamada && passo === "registarChamada") ligados.add(passo);
  return ligados;
}
