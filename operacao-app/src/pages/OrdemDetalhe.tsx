import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import {
  ErroDeDados,
  alvosDaOrdem,
  localDaOrdem,
  type LocalRow,
  listarClientes,
  listarEquipa,
  medicoesDaOrdem,
  obterOrdem,
  opcoesDeMedicoes,
  anexosDaOrdem,
  custoDaOrdem,
  pessoasDaOrdem,
  previstoDaOrdem,
  sessoesDaOrdem,
  tarefasDaOrdem,
  type AlvoDaOrdem,
  type MedicaoDaTarefa,
  type MembroEquipa,
  type Anexo,
  type CustoDaOrdem,
  type LinhaPrevista,
  type OpcaoDeMedicao,
  type OrdemCompleta,
  type SessaoDaOrdem,
  type TarefaDaOrdem,
} from "../lib/dados";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  EstadoOrdem,
  Modal,
  OrigemOrdem,
  PrioridadeOrdem,
  Skeleton,
  Textarea,
  Input,
  Select,
  Field,
  cx,
} from "../components/ui";
import { linkParaIr, temSitio } from "../domain/mapa";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronLeft,
  Clock,
  MapPin,
  Pause,
  Play,
  User,
} from "../components/icons";
import { avaliar, transicoesPossiveis, type Transicao } from "../domain/estados";
import { formatarDuracao, tempoTotalSegundos, type Sessao } from "../domain/tempo";
import { alertasDaOrdem } from "../domain/alertas";
import { podeResponder } from "../domain/respostas";
import PainelTarefas from "../components/PainelTarefas";
import PainelClassificacao from "../components/PainelClassificacao";
import BotaoDuplicar from "../components/BotaoDuplicar";
import BotaoRelatorio from "../components/BotaoRelatorio";
import {
  duplicarOrdem,
  listarMotivosDePausa,
  type MotivoDePausa,
} from "../lib/config";
import PainelDespacho from "../components/PainelDespacho";
import PainelCusto from "../components/PainelCusto";
import PainelAnexos from "../components/PainelAnexos";
import PainelAssinatura from "../components/PainelAssinatura";
import PainelMensagens from "../components/PainelMensagens";
import PainelCustos from "../components/PainelCustos";
import { comparacaoPorItem, custosDaOrdem, type ComparacaoPorItem, type LinhaDeCusto } from "../lib/custos";
import type { Estado, EstadoTarefa } from "../domain/tipos";

/**
 * Ficha de ordem — uma só, para as três origens.
 *
 * Esta página não escreve em tabela nenhuma. Tudo o que muda estado passa por
 * uma RPC `SECURITY DEFINER` — transitar a ordem, responder a uma tarefa,
 * registar uma leitura — e cada uma dessas tabelas tem um trigger que recusa
 * um UPDATE direto. O que o browser calcula (que botões mostrar, que veredicto
 * um valor vai ter) serve para responder de imediato; quem decide é a base.
 */

export default function OrdemDetalhe() {
  const { codigo = "" } = useParams();
  const { activeOrgId, businessUserId, funcao } = useAuth();

  const [ordem, setOrdem] = useState<OrdemCompleta | null>(null);
  const [alvos, setAlvos] = useState<AlvoDaOrdem[]>([]);
  const [local, setLocal] = useState<LocalRow | null>(null);
  const [tarefas, setTarefas] = useState<TarefaDaOrdem[]>([]);
  const [sessoes, setSessoes] = useState<SessaoDaOrdem[]>([]);
  const [medicoes, setMedicoes] = useState<MedicaoDaTarefa[]>([]);
  const [opcoes, setOpcoes] = useState<OpcaoDeMedicao[]>([]);
  const [naOrdem, setNaOrdem] = useState<string[]>([]);
  const [custo, setCusto] = useState<CustoDaOrdem | null>(null);
  const [previsto, setPrevisto] = useState<LinhaPrevista[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [custos, setCustos] = useState<LinhaDeCusto[]>([]);
  const [porItem, setPorItem] = useState<ComparacaoPorItem[]>([]);
  const [equipa, setEquipa] = useState<Map<string, MembroEquipa>>(new Map());
  const [cliente, setCliente] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [recarga, setRecarga] = useState(0);

  const [dialogo, setDialogo] = useState<Transicao | null>(null);
  const [motivo, setMotivo] = useState("");
  /* Os motivos que ESTA pessoa pode usar. A lista completa tem motivos que são
     decisão de quem gere, e a base filtra-os — aqui só se desenha o que veio. */
  const [motivos, setMotivos] = useState<MotivoDePausa[]>([]);
  const [motivoId, setMotivoId] = useState("");
  const [retoma, setRetoma] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setACarregar(true);
    setErro(null);
    try {
      const o = await obterOrdem(codigo, activeOrgId);
      if (!o) {
        setErro("Ordem não encontrada, ou sem permissão para a ver.");
        setOrdem(null);
        return;
      }
      const [als, loc, tfs, sss, eq, cls, pes] = await Promise.all([
        alvosDaOrdem(o.id),
        localDaOrdem(o.local_id),
        tarefasDaOrdem(o.id),
        sessoesDaOrdem(o.id),
        listarEquipa(activeOrgId),
        listarClientes(activeOrgId),
        pessoasDaOrdem(o.id),
      ]);
      // As leituras e as suas opções vêm num segundo passo porque dependem
      // das tarefas. Duas consultas, não uma por tarefa.
      const meds = await medicoesDaOrdem(tfs.map((t) => t.id));
      const ops = await opcoesDeMedicoes([
        ...new Set(meds.filter((m) => m.tipo === "escolha").map((m) => m.medicao_def_id)),
      ]);

      // Os custos vêm vazios para quem não os pode ver, e isso não é um erro:
      // é a resposta certa. Por isso não passam por `rebentar()`.
      const [cst, prv, anx, lin, cmp] = await Promise.all([
        custoDaOrdem(o.id),
        previstoDaOrdem(o.id),
        anexosDaOrdem(o.id),
        custosDaOrdem(o.id),
        comparacaoPorItem(o.id),
      ]);

      setOrdem(o);
      setAlvos(als);
      setLocal(loc);
      setTarefas(tfs);
      setSessoes(sss);
      setMedicoes(meds);
      setOpcoes(ops);
      setEquipa(new Map(eq.map((m) => [m.utilizador_id, m])));
      setNaOrdem(pes.map((p) => p.utilizador_id));
      setCusto(cst);
      setPrevisto(prv);
      setAnexos(anx);
      setCustos(lin);
      setPorItem(cmp);
      setCliente(cls.find((c) => c.id === o.cliente_id)?.nome ?? null);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar a ordem.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, codigo, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    void listarMotivosDePausa(activeOrgId).then((m) => {
      if (vivo) setMotivos(m);
    });
    return () => {
      vivo = false;
    };
  }, [activeOrgId]);

  const contexto = useMemo(
    () => ({
      funcao: funcao ?? "tecnico",
      atribuido:
        !!businessUserId &&
        (ordem?.responsavel_id === businessUserId ||
          sessoes.some((s) => s.utilizador_id === businessUserId)),
      tarefas: tarefas.map((t) => ({
        estado: t.estado as EstadoTarefa,
        obrigatoria: t.obrigatoria,
      })),
    }),
    [funcao, businessUserId, ordem, sessoes, tarefas]
  );

  const possiveis = ordem ? transicoesPossiveis(ordem.estado, contexto) : [];

  // A mesma pergunta que a base vai fazer. Aqui serve para explicar porquê,
  // com o passo em falta — "Inicia a ordem para começares a responder" diz
  // mais do que um botão apagado.
  const permissaoResponder = podeResponder({
    estadoOrdem: ordem?.estado ?? "",
    funcao: contexto.funcao,
    atribuido: contexto.atribuido,
  });

  const sessoesDominio: Sessao[] = sessoes.map((s) => ({
    utilizadorId: s.utilizador_id,
    inicio: new Date(s.inicio),
    fim: s.fim ? new Date(s.fim) : null,
  }));
  const tempoTotal = tempoTotalSegundos(sessoesDominio);

  const executar = async (t: Transicao) => {
    if (!ordem || !businessUserId) return;

    /* Numa pausa com lista, o texto que vai para a base é o nome do motivo
       mais o detalhe. Assim o histórico continua a ler-se sozinho, sem ter de
       ir buscar o nome a outra tabela. */
    const escolhido = nomeDoMotivo(motivos, motivoId);
    const detalhe = motivo.trim();
    const texto =
      t === "pausar" && escolhido
        ? detalhe
          ? `${escolhido} — ${detalhe}`
          : escolhido
        : detalhe;

    if (t === "pausar" && motivos.length > 0) {
      if (!motivoId) {
        setErroAcao("Escolhe o motivo da pausa.");
        return;
      }
      if (escolhido === "Outro" && !detalhe) {
        setErroAcao('“Outro” sem detalhe não diz nada. Escreve o que se passa.');
        return;
      }
    }

    const ctx = {
      ...contexto,
      motivo: texto || null,
      retomaPrevista: retoma ? new Date(retoma) : null,
    };
    const decisao = avaliar(ordem.estado, t, ctx);
    if (!decisao.ok) {
      setErroAcao(decisao.motivo);
      return;
    }

    setAGravar(true);
    setErroAcao(null);

    // UMA chamada. A base valida outra vez, muda o estado, abre ou encerra a
    // sessão de trabalho, recalcula o custo de mão de obra e escreve o
    // histórico — tudo na mesma transação.
    //
    // O `avaliar()` acima continua a existir para responder de imediato e
    // desenhar os botões certos, mas quem manda é a RPC: um UPDATE direto ao
    // estado é recusado por trigger.
    try {
      const { error } = await supabase.rpc("rpc_ops_transitar_ordem", {
        p_ordem_id: ordem.id,
        p_transicao: t,
        p_motivo: ctx.motivo,
        p_retoma_prevista: ctx.retomaPrevista?.toISOString() ?? null,
      });

      if (error) {
        // A RPC devolve mensagens escritas para quem as vai ler ("Pausar exige
        // um motivo."). Mostrar a do servidor é melhor do que a genérica.
        setErroAcao(error.message || "Não foi possível concluir a operação.");
        return;
      }

      /* O id do motivo grava-se à parte: não é estado, e o estado é a única
         coisa que a base tranca. Falhar aqui não desfaz a pausa — o texto já
         lá está, e é o que uma pessoa lê. */
      if (t === "pausar" && motivoId) {
        const { error: e2 } = await supabase
          .from("ops_ordem")
          .update({ pausa_motivo_id: motivoId })
          .eq("id", ordem.id);
        if (e2) {
          // eslint-disable-next-line no-console
          console.warn("[Operações] motivo da pausa sem id:", e2.message);
        }
      }

      setDialogo(null);
      setMotivo("");
      setMotivoId("");
      setRetoma("");
      setRecarga((r) => r + 1);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[Operações] falha na transição:", e);
      setErroAcao("Não foi possível falar com o servidor. Tenta outra vez.");
    } finally {
      setAGravar(false);
    }
  };

  if (aCarregar && !ordem) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (erro || !ordem) {
    return (
      <div className="space-y-4">
        <Voltar />
        <ErrorState message={erro ?? "Ordem não encontrada."} onRetry={() => setRecarga((r) => r + 1)} />
      </div>
    );
  }

  const alertas = alertasDaOrdem(
    {
      estado: ordem.estado,
      agendadaPara: ordem.agendada_para ? new Date(ordem.agendada_para) : null,
      iniciadaEm: ordem.iniciada_em ? new Date(ordem.iniciada_em) : null,
      ultimaAtividadeEm: new Date(ordem.atualizada_em),
      pausaRetomaPrevista: ordem.pausa_retoma_prevista
        ? new Date(ordem.pausa_retoma_prevista)
        : null,
      criadaEm: new Date(ordem.criada_em),
    },
    new Date()
  );

  const responsavel = ordem.responsavel_id ? equipa.get(ordem.responsavel_id) : null;

  return (
    <div className="space-y-4">
      <Voltar />

      {/* Cabeçalho */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium tabular text-slate-500">{ordem.codigo}</span>
          <OrigemOrdem origem={ordem.origem} />
          <EstadoOrdem estado={ordem.estado} />
          <PrioridadeOrdem prioridade={ordem.prioridade} />
          {alertas.map((a) => (
            <Badge
              key={a.chave}
              className={
                a.severidade === "critico"
                  ? "bg-red-50 text-red-700 ring-red-200"
                  : "bg-amber-50 text-amber-800 ring-amber-200"
              }
            >
              <AlertTriangle width={11} height={11} />
              {a.texto}
            </Badge>
          ))}
        </div>

        <h1 className="mt-2 text-lg font-semibold tracking-tight text-slate-900">{ordem.titulo}</h1>

        {ordem.descricao && (
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {ordem.descricao}
          </p>
        )}

        {/* Ações — só as que a máquina de estados permite mesmo */}
        {possiveis.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {possiveis.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={t === "cancelar" || t === "rejeitar" ? "secondary" : "primary"}
                onClick={() => {
                  setErroAcao(null);
                  setMotivo("");
                  setRetoma("");
                  // Motivo/retoma obrigatórios? Abre diálogo. Senão, executa já.
                  if (t === "pausar" || t === "cancelar" || t === "rejeitar") setDialogo(t);
                  else void executar(t);
                }}
                disabled={aGravar}
              >
                {ICONE_ACAO[t]}
                {ROTULO_ACAO[t]}
              </Button>
            ))}
          </div>
        )}

        {/* O relatório só faz sentido quando há trabalho feito para mostrar.
            Antes disso o botão seria uma promessa vazia. */}
        {["fechada", "confirmada"].includes(ordem.estado) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <BotaoDuplicar
              rotulo="Duplicar"
              titulo="Duplicar a ordem"
              nomeSugerido={ordem.titulo}
              oQueNaoLeva={[
                "as respostas — as tarefas vão por fazer",
                "os custos, os anexos e a assinatura",
                "as datas de início e de fecho",
                "o histórico",
              ]}
              duplicar={(nome) => duplicarOrdem(ordem.id, nome)}
              paraOnde={(r) => `/ordens/${r.codigo}`}
            />
            <Link
              to={`/ordens/${ordem.codigo}/relatorio`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:border-slate-300"
            >
              Relatório para o cliente
            </Link>
            {/* Ver o relatório e mandá-lo são a mesma decisão em dois passos:
                por isso o botão está ao lado, e não noutro ecrã. */}
            <BotaoRelatorio
              ordemId={ordem.id}
              podeMandar={funcao === "gestor" || funcao === "admin"}
            />
          </div>
        )}

        {erroAcao && !dialogo && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>
        )}
      </Card>

      {/* Contexto — campos próprios, não texto solto nas observações */}
      <Card className="divide-y divide-slate-100">
        <Linha rotulo="Cliente" valor={cliente ?? "—"} />
        {/* Onde é, e o botão que o técnico carrega no carro: abre a navegação
            já apontada. Usa o ponto no mapa quando o local o tem — uma morada
            escrita à mão tem gralhas e ruas com o mesmo nome noutra cidade. */}
        {local && temSitio(local) && (
          <div className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
            <span className="w-36 shrink-0 text-xs uppercase tracking-wide text-slate-400">
              Onde é
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="min-w-0 text-sm text-slate-700">
                {local.morada?.trim() || local.nome}
              </span>
              <a
                href={linkParaIr(local) ?? "#"}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200"
              >
                <MapPin width={13} height={13} />
                Como lá chegar
              </a>
            </div>
          </div>
        )}
        {responsavel && (
          <Linha
            rotulo="Responsável"
            valor={responsavel.nome}
            icone={<User width={14} height={14} />}
          />
        )}
        {(ordem.area || ordem.tipo) && (
          <Linha rotulo="Área e tipo" valor={[ordem.area, ordem.tipo].filter(Boolean).join(" › ")} />
        )}
        {ordem.contacto_nome && (
          <Linha
            rotulo="Contacto no local"
            valor={[ordem.contacto_nome, ordem.contacto_telefone].filter(Boolean).join(" · ")}
          />
        )}
        {(ordem.janela_inicio || ordem.janela_fim) && (
          <Linha
            rotulo="Janela de visita"
            valor={formatarJanela(ordem.janela_inicio, ordem.janela_fim)}
            icone={<Clock width={14} height={14} />}
          />
        )}
        {ordem.estado === "pausada" && ordem.pausa_motivo && (
          <Linha
            rotulo="Motivo da pausa"
            valor={`${ordem.pausa_motivo}${
              ordem.pausa_retoma_prevista
                ? ` · retoma ${new Date(ordem.pausa_retoma_prevista).toLocaleDateString("pt-PT")}`
                : ""
            }`}
          />
        )}
        {ordem.motivo_cancelamento && (
          <Linha rotulo="Motivo do cancelamento" valor={ordem.motivo_cancelamento} />
        )}
      </Card>

      {/* Orçamentado contra gasto — só aparece se houve orçamento */}
      <PainelCusto custo={custo} previsto={previsto} porItem={porItem} />

      {/* O que se gastou, e de onde veio */}
      <PainelCustos
        ordemId={ordem.id}
        estado={ordem.estado}
        custos={custos}
        podeVer={custo !== null || custos.length > 0}
        aoMudar={() => setRecarga((r) => r + 1)}
      />

      {/* Quem vai, e quando */}
      <PainelDespacho
        ordemId={ordem.id}
        estado={ordem.estado}
        responsavelId={ordem.responsavel_id}
        equipaDaOrdem={naOrdem}
        agendadaPara={ordem.agendada_para}
        janelaInicio={ordem.janela_inicio}
        janelaFim={ordem.janela_fim}
        equipa={[...equipa.values()]}
        podeDespachar={contexto.funcao !== "tecnico"}
        aoGravar={() => setRecarga((r) => r + 1)}
      />

      {/* Onde o trabalho acontece */}
      {/* A classificação antes das tarefas: quem abre a ordem para trabalhar
          passa por ela, e quem a abre para a arrumar não tem de a ir procurar
          ao fim de tudo. */}
      <PainelClassificacao
        ordemId={ordem.id}
        orgId={ordem.organization_id}
        tipoTrabalhoId={ordem.tipo_trabalho_id}
        centroCustoId={ordem.centro_custo_id}
        fornecedorId={ordem.fornecedor_id}
        fechaAutomatico={ordem.fecha_automatico}
        podeEditar={funcao === "admin" || funcao === "gestor" || funcao === "operador"}
        aoGravar={() => setRecarga((r) => r + 1)}
      />

      <PainelTarefas
        ordemId={ordem.id}
        tarefas={tarefas}
        medicoes={medicoes}
        opcoes={opcoes}
        permissao={permissaoResponder}
        aoGravar={() => setRecarga((r) => r + 1)}
      />

      {/* Fotos e ficheiros */}
      <PainelAnexos
        ordemId={ordem.id}
        organizationId={activeOrgId ?? ""}
        estado={ordem.estado}
        anexos={anexos}
        equipa={equipa}
        podeAnexar={!!businessUserId}
        aoMudar={() => setRecarga((r) => r + 1)}
      />

      {/* A assinatura de quem recebeu o trabalho. Só aparece depois de fechar:
          antes disso o trabalho não acabou, e uma assinatura a meio prova o quê? */}
      <PainelAssinatura
        ordemId={ordem.id}
        organizationId={activeOrgId ?? ""}
        fechada={ordem.estado === "fechada"}
        podeAssinar={!!businessUserId}
      />

      {/* A conversa. Fica a seguir à assinatura e antes das sessões: é onde
          se explica o que os números não explicam. */}
      <PainelMensagens ordemId={ordem.id} equipa={equipa} euId={businessUserId ?? null} />

      {/* Sessões — o que faz o custo de mão de obra existir */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Sessões de trabalho</h2>
          <span className="font-mono text-sm font-medium tabular text-slate-700">
            {formatarDuracao(tempoTotal)}
          </span>
        </div>

        {sessoes.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">
            Ainda ninguém trabalhou nesta ordem. O tempo conta-se a partir de quem a inicia.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {sessoes.map((s) => {
              const membro = equipa.get(s.utilizador_id);
              const dur = formatarDuracao(
                Math.max(
                  0,
                  Math.floor(
                    ((s.fim ? new Date(s.fim) : new Date()).getTime() -
                      new Date(s.inicio).getTime()) / 1000
                  )
                )
              );
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">
                    {membro?.nome ?? "—"}
                    {!s.fim && (
                      <Badge className="ml-2 bg-brand-50 text-brand-800 ring-brand-200">a decorrer</Badge>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular text-slate-500">
                    {new Date(s.inicio).toLocaleString("pt-PT", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <span className="ml-2 text-slate-700">{dur}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {alvos.length > 0 && (
        <p className="px-1 text-xs text-slate-400">
          {alvos.length === 1 ? "1 alvo" : `${alvos.length} alvos`} nesta ordem.
        </p>
      )}

      {/* Diálogo para as transições que exigem justificação */}
      {dialogo && (
        <Modal
          title={ROTULO_ACAO[dialogo]}
          onClose={() => setDialogo(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialogo(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void executar(dialogo)} disabled={aGravar}>
                {aGravar ? "A gravar…" : "Confirmar"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {/* Numa pausa, o motivo vem de uma lista. Texto livre dava oito
                maneiras de escrever "à espera de material", e nenhum relatório
                as consegue somar. */}
            {dialogo === "pausar" && motivos.length > 0 && (
              <Field label="Motivo" hint="Obrigatório. Sem motivo ninguém sabe porque parou.">
                <Select
                  value={motivoId}
                  onChange={(e) => setMotivoId(e.target.value)}
                  className="w-full"
                >
                  <option value="">— escolhe —</option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              label={dialogo === "pausar" && motivos.length > 0 ? "Detalhe" : "Motivo"}
              hint={
                dialogo === "pausar"
                  ? motivos.length > 0
                    ? nomeDoMotivo(motivos, motivoId) === "Outro"
                      ? "Obrigatório: “Outro” sem detalhe não diz nada."
                      : "Opcional. O que falta, ao certo."
                    : "Obrigatório. Sem motivo ninguém sabe porque parou."
                  : "Obrigatório."
              }
            >
              <Textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={
                  dialogo === "pausar" ? "Ex.: falta o regulador" : "Ex.: pedido duplicado"
                }
              />
            </Field>

            {dialogo === "pausar" && (
              <Field
                label="Retoma prevista"
                hint="Obrigatória. É o que permite avisar quando a data passa."
              >
                <Input
                  type="datetime-local"
                  value={retoma}
                  onChange={(e) => setRetoma(e.target.value)}
                />
              </Field>
            )}

            {erroAcao && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** O nome do motivo escolhido, ou vazio se não houver lista nem escolha. */
function nomeDoMotivo(motivos: readonly MotivoDePausa[], id: string): string {
  return motivos.find((m) => m.id === id)?.nome ?? "";
}

const ROTULO_ACAO: Record<Transicao, string> = {
  aprovar: "Aprovar",
  rejeitar: "Rejeitar",
  iniciar: "Iniciar",
  pausar: "Pausar",
  retomar: "Retomar",
  fechar: "Fechar",
  reabrir: "Reabrir",
  confirmar: "Confirmar",
  cancelar: "Cancelar ordem",
};

const ICONE_ACAO: Record<Transicao, JSX.Element | null> = {
  aprovar: <Check width={15} height={15} />,
  rejeitar: null,
  iniciar: <Play width={14} height={14} />,
  pausar: <Pause width={14} height={14} />,
  retomar: <Play width={14} height={14} />,
  fechar: <CheckCircle width={15} height={15} />,
  reabrir: null,
  confirmar: <CheckCircle width={15} height={15} />,
  cancelar: null,
};

function Voltar() {
  return (
    <Link
      to="/ordens"
      className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-brand"
    >
      <ChevronLeft width={16} height={16} /> Ordens
    </Link>
  );
}

function Linha({
  rotulo,
  valor,
  icone,
}: {
  rotulo: string;
  valor: string;
  icone?: JSX.Element;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
      <span className="w-36 shrink-0 text-xs uppercase tracking-wide text-slate-400">{rotulo}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-slate-700">
        {icone && <span className="shrink-0 text-slate-400">{icone}</span>}
        <span className="min-w-0 truncate">{valor}</span>
      </span>
    </div>
  );
}

function formatarJanela(inicio: string | null, fim: string | null): string {
  if (!inicio) return "—";
  const i = new Date(inicio);
  const data = i.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
  const hi = i.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  if (!fim) return `${data} ${hi}`;
  const hf = new Date(fim).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  return `${data} ${hi} – ${hf}`;
}

export type { Estado };
