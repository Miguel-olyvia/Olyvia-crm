import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Badge, Input, cx } from "../components/ui";
import {
  Search,
  ChevronRight,
  Check,
  FileText,
  Settings,
  Building,
  Paperclip,
  Bell,
  Chart,
  Clock,
  AlertTriangle,
  Printer,
  ExternalLink,
  DucMark,
} from "../components/icons";

import type { ComponentType, ReactNode, SVGProps } from "react";

/* ------------------------------------------------------------------ tipos -- */

/* Estrutura de cada secção de ajuda. `text` junta título+corpo para a pesquisa. */
type Section = {
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Tom do quadradinho do ícone — variedade cromática coerente com a marca. */
  tone: "brand" | "teal" | "slate" | "amber";
  title: string;
  summary: string;
  body: ReactNode;
  /** Texto puro usado só para filtrar (título + resumo + passos). */
  text: string;
};

/* --------------------------------------------------------------- pequenos -- */

/* Lista de passos com marcadores "check" para um visual mais dinâmico. */
function Steps({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand ring-1 ring-brand-100">
            <Check width={11} height={11} />
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/* Etiqueta "Dica" reutilizável. */
function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-sm text-brand-800 ring-1 ring-inset ring-brand-100">
      <Badge className="shrink-0 bg-brand text-white ring-brand">Dica</Badge>
      <span>{children}</span>
    </div>
  );
}

/* Mapa de cores para os quadradinhos de ícone (fechado / aberto). */
const TONE: Record<
  Section["tone"],
  { closed: string; open: string; chip: string }
> = {
  brand: {
    closed: "bg-brand-50 text-brand ring-1 ring-brand-100",
    open: "bg-brand text-white",
    chip: "text-brand",
  },
  teal: {
    closed: "bg-teal-50 text-teal-600 ring-1 ring-teal-100",
    open: "bg-teal-500 text-white",
    chip: "text-teal-600",
  },
  slate: {
    closed: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
    open: "bg-slate-700 text-white",
    chip: "text-slate-500",
  },
  amber: {
    closed: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
    open: "bg-amber-500 text-white",
    chip: "text-amber-600",
  },
};

/* ---------------------------------------------------------------- secções -- */

const SECTIONS: Section[] = [
  {
    id: "o-que-e",
    icon: FileText,
    tone: "brand",
    title: "O que é o DUC",
    summary: "Um documento único por cliente, do início ao fim.",
    text: "o que é o duc documento único de cliente percurso etapas comercial operação pós-venda fluxo",
    body: (
      <>
        <p className="text-sm text-slate-600">
          O DUC — <strong>Documento Único de Cliente</strong> — reúne num só
          sítio todo o percurso de um cliente. Em vez de espalhar informação por
          folhas, emails e pastas, cada cliente tem um documento que acompanha o
          fluxo do início ao fim: da fase <strong>comercial</strong>, para a{" "}
          <strong>operação</strong>, até ao <strong>pós-venda</strong>.
        </p>
        <Steps
          items={[
            "Um documento por cliente, sempre atualizado.",
            "Organizado por etapas, na ordem do vosso processo.",
            "Toda a equipa vê o mesmo estado, em tempo real.",
          ]}
        />
        <Tip>
          Pense no DUC como a "capa do processo" do cliente: abre-a e vê logo
          onde está e o que falta.
        </Tip>
      </>
    ),
  },
  {
    id: "etapas-rastreio",
    icon: Chart,
    tone: "teal",
    title: "Etapas e Rastreio",
    summary: "Cada etapa tem os seus campos; o Rastreio mostra onde está.",
    text: "etapas rastreio campos onde está o duc progresso preenchimento estado atual barra",
    body: (
      <>
        <p className="text-sm text-slate-600">
          O percurso está dividido em <strong>etapas</strong>. Cada etapa tem os
          seus <strong>campos</strong> a preencher (datas, valores, notas,
          responsáveis…). À medida que a equipa trabalha, os campos vão sendo
          completados.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          O <strong>Rastreio</strong> é a barra que mostra, de relance, em que
          ponto do percurso está o DUC: que etapas já fecharam, qual é a etapa
          atual e o que ainda falta.
        </p>
        <Steps
          items={[
            "Etapas fechadas aparecem marcadas como concluídas.",
            "A etapa atual está destacada.",
            "As etapas seguintes ficam como pendentes.",
          ]}
        />
      </>
    ),
  },
  {
    id: "fechar-etapa",
    icon: Check,
    tone: "brand",
    title: "Fechar uma etapa",
    summary: "Confirmação, assinatura de quem fechou, ordem e obrigatórios.",
    text: "fechar etapa confirmação assinatura quem fechou quando registo campos obrigatórios validação ordem sequência",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Quando uma etapa está completa, use o botão{" "}
          <strong>"Fechar etapa"</strong>. O sistema pede{" "}
          <strong>confirmação</strong> e regista automaticamente uma{" "}
          <strong>assinatura</strong>: <em>quem</em> fechou e <em>quando</em>.
          Assim fica sempre claro quem deu cada passo por concluído.
        </p>
        <Steps
          items={[
            "As etapas fecham pela ordem do fluxo — não se salta a que está a meio.",
            "Preencha os campos obrigatórios da etapa (sem isso não fecha).",
            'Clique em "Fechar etapa" e confirme.',
            "Fica registada a assinatura: nome e data/hora.",
          ]}
        />
        <Tip>
          Se faltar algum campo obrigatório, o sistema avisa e indica o que falta
          antes de deixar fechar.
        </Tip>
      </>
    ),
  },
  {
    id: "vista-fluxo",
    icon: FileText,
    tone: "slate",
    title: "Vista Fluxo",
    summary: "Diagrama read-only das etapas: fechada, atual ou pendente.",
    text: "vista fluxo diagrama read-only só leitura etapas fechada atual pendente panorâmica",
    body: (
      <>
        <p className="text-sm text-slate-600">
          A <strong>Vista Fluxo</strong> mostra o percurso como um{" "}
          <strong>diagrama</strong>, só para consulta (read-only). É a forma mais
          rápida de perceber o estado geral sem editar nada.
        </p>
        <Steps
          items={[
            "Cada etapa aparece com o seu estado: fechada, atual ou pendente.",
            "Ideal para uma leitura panorâmica do processo.",
            "Não altera dados — serve para ver, não para editar.",
          ]}
        />
      </>
    ),
  },
  {
    id: "vista-kanban",
    icon: Chart,
    tone: "teal",
    title: "Vista Kanban",
    summary: "Arraste DUCs entre etapas; avançar fecha as anteriores em cascata.",
    text: "vista kanban arrastar duc entre etapas colunas cascata fechar anteriores avançar cartões drag",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Na <strong>Vista Kanban</strong>, cada etapa é uma coluna e cada DUC é
          um cartão. Pode <strong>arrastar</strong> um cartão de uma coluna para
          outra para o mover na etapa.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Ao arrastar um DUC <strong>para a frente</strong>, todas as etapas
          anteriores que ainda estavam abertas são{" "}
          <strong>fechadas em cascata</strong> automaticamente — o percurso fica
          coerente, sem saltos.
        </p>
        <Steps
          items={[
            "Arraste o cartão para a etapa pretendida.",
            "Avançar fecha as etapas anteriores em cascata.",
            "Rápido para gerir muitos clientes ao mesmo tempo.",
          ]}
        />
        <Tip>
          Ideal para uma reunião de equipa: veem todos os clientes e movem-nos
          conforme evoluem.
        </Tip>
      </>
    ),
  },
  {
    id: "fases-pagamento",
    icon: Paperclip,
    tone: "amber",
    title: "Fases de pagamento",
    summary: "Na etapa Financeiro: %, valor, vencimento e nota, com o botão '+'.",
    text: "fases de pagamento financeiro percentagem valor vencimento nota adicionar lista faturação sinal intermédio final",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Na etapa <strong>Financeiro</strong> pode definir{" "}
          <strong>fases de pagamento</strong>. Use o botão <strong>"+"</strong>{" "}
          para adicionar cada fase à lista.
        </p>
        <Steps
          items={[
            "Percentagem (%) do total que corresponde à fase.",
            "Valor a pagar nessa fase.",
            "Data de vencimento.",
            "Nota livre (ex.: condições ou referência).",
          ]}
        />
        <Tip>
          Pode criar tantas fases quantas precisar — por exemplo, sinal,
          intermédio e valor final.
        </Tip>
      </>
    ),
  },
  {
    id: "notificacoes",
    icon: Bell,
    tone: "amber",
    title: "Notificações e alertas",
    summary: "Emails ao entrar/fechar cada etapa e alertas se ficar parada.",
    text: "notificações por etapa email membros externos entrar fechar alertas parada dias configurações avisos lembrete",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Em <strong>Configurações</strong> define, por etapa, quem recebe{" "}
          <strong>email</strong>. Os destinatários podem ser{" "}
          <strong>membros</strong> da equipa ou <strong>externos</strong> (ex.:
          um parceiro ou o próprio cliente).
        </p>
        <Steps
          items={[
            "Avisar ao entrar na etapa.",
            "Avisar ao fechar a etapa.",
            "Alertar se a etapa ficar parada mais de N dias.",
          ]}
        />
        <Tip>
          Os alertas de "etapa parada" ajudam a não deixar nenhum cliente
          esquecido. As suas notificações vivem em{" "}
          <strong>/notificacoes</strong>.
        </Tip>
      </>
    ),
  },
  {
    id: "chat",
    icon: Bell,
    tone: "brand",
    title: "Conversa e @menções",
    summary: "Fale sobre o DUC no chat e chame alguém com @nome.",
    text: "chat conversa comentários mensagens @menções mencionar arroba notificar colega discussão fio thread",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Cada DUC tem um <strong>fio de conversa</strong>. Deixe recados,
          combine próximos passos ou registe decisões — tudo fica junto do
          processo, ao contrário de emails que se perdem.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Escreva <strong>@</strong> e o nome para <strong>mencionar</strong>{" "}
          alguém: essa pessoa recebe uma notificação e vai direta à mensagem.
        </p>
        <Steps
          items={[
            "Escreva a mensagem no fim da conversa.",
            "Use @nome para chamar quem precisa de responder.",
            "A menção gera notificação para essa pessoa.",
          ]}
        />
        <Tip>
          A @menção é a forma mais rápida de passar a bola: a pessoa é avisada e
          entra logo no contexto certo.
        </Tip>
      </>
    ),
  },
  {
    id: "colaboradores-externos",
    icon: ExternalLink,
    tone: "teal",
    title: "Colaboradores externos",
    summary: "Convide parceiros ou clientes por magic link, sem criar conta.",
    text: "colaboradores externos convidar parceiro cliente magic link acesso limitado sem conta partilhar convite",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Pode dar acesso a quem está <strong>fora</strong> da organização —
          um parceiro, um fornecedor ou o próprio cliente — através de um{" "}
          <strong>magic link</strong>. Não precisam de criar conta nem de
          palavra-passe.
        </p>
        <Steps
          items={[
            "Convide o colaborador externo a partir do DUC.",
            "Ele recebe um link mágico que abre o acesso diretamente.",
            "Vê apenas o que lhe é permitido — o resto fica reservado.",
          ]}
        />
        <Tip>
          Ótimo para partilhar o ponto de situação com o cliente sem lhe dar
          acesso a tudo o resto.
        </Tip>
      </>
    ),
  },
  {
    id: "dashboard",
    icon: Chart,
    tone: "teal",
    title: "Dashboard",
    summary: "Visão geral: quantos DUCs, em que etapas e o que está parado.",
    text: "dashboard painel visão geral indicadores métricas quantos duc por etapa parados totais resumo estatísticas",
    body: (
      <>
        <p className="text-sm text-slate-600">
          O <strong>Dashboard</strong> dá-lhe a fotografia do momento: quantos
          DUCs estão ativos, como se distribuem pelas etapas e onde há
          processos <strong>parados</strong> a precisar de atenção.
        </p>
        <Steps
          items={[
            "Totais e distribuição por etapa num relance.",
            "Identifica rapidamente os processos parados.",
            "Ponto de partida ideal para começar o dia.",
          ]}
        />
      </>
    ),
  },
  {
    id: "historico",
    icon: Clock,
    tone: "slate",
    title: "Histórico e auditoria",
    summary: "Cada alteração fica registada: quem, o quê e quando.",
    text: "histórico auditoria registo alterações quem o quê quando rasto trilho log evento assinatura rastreabilidade",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Nada se perde: cada <strong>alteração</strong> ao DUC — fechar uma
          etapa, mudar um campo, adicionar uma fase — fica registada com{" "}
          <strong>quem</strong>, <strong>o quê</strong> e <strong>quando</strong>.
        </p>
        <Steps
          items={[
            "Trilho completo de eventos por DUC.",
            "As assinaturas de fecho ficam guardadas.",
            "Transparência total para toda a equipa.",
          ]}
        />
        <Tip>
          Em caso de dúvida sobre "o que aconteceu aqui?", o histórico responde.
        </Tip>
      </>
    ),
  },
  {
    id: "exportar-pdf",
    icon: Printer,
    tone: "brand",
    title: "Exportar em PDF",
    summary: "Gere um PDF do DUC completo ou só de uma etapa.",
    text: "exportar pdf imprimir documento gerar descarregar partilhar completo por etapa relatório impressão",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Precisa de partilhar ou arquivar? Gere um <strong>PDF</strong> do DUC.
          Pode exportar o <strong>documento completo</strong> ou apenas uma{" "}
          <strong>etapa</strong> específica.
        </p>
        <Steps
          items={[
            "PDF completo — todo o percurso do cliente num ficheiro.",
            "PDF por etapa — só a parte que interessa nesse momento.",
            "Ideal para enviar ao cliente ou juntar ao arquivo.",
          ]}
        />
        <Tip>
          O PDF respeita o que está preenchido, incluindo assinaturas de fecho e
          fases de pagamento.
        </Tip>
      </>
    ),
  },
  {
    id: "configuracao",
    icon: Building,
    tone: "slate",
    title: "Configuração do fluxo",
    summary: "Em /config, um editor visual do fluxo por organização.",
    text: "configuração config editor visual fluxo organização etapas campos personalizar reordenar obrigatórios",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Em <strong>/config</strong> encontra um <strong>editor visual</strong>{" "}
          do fluxo. Cada <strong>organização</strong> desenha o seu processo:
          quais são as etapas, por que ordem aparecem e que campos cada uma tem.
        </p>
        <Steps
          items={[
            "Adicione, renomeie ou reordene etapas.",
            "Defina os campos de cada etapa e quais são obrigatórios.",
            "As alterações refletem-se em todos os DUCs da organização.",
          ]}
        />
        <Tip>
          Comece simples e vá ajustando o fluxo à medida que o processo real da
          equipa fica mais claro.
        </Tip>
      </>
    ),
  },
  {
    id: "mobile",
    icon: FileText,
    tone: "teal",
    title: "No telemóvel",
    summary: "Cartões, barra de ações fixa e tudo responsivo.",
    text: "mobile telemóvel responsivo cartões barra de ações fixa toque ecrã pequeno tablet",
    body: (
      <>
        <p className="text-sm text-slate-600">
          O DUC funciona bem no <strong>telemóvel</strong>. Em ecrãs pequenos, a
          informação organiza-se em <strong>cartões</strong> fáceis de percorrer,
          e as ações principais ficam numa <strong>barra fixa</strong> ao fundo,
          sempre ao alcance do polegar.
        </p>
        <Steps
          items={[
            "Cartões em vez de tabelas largas.",
            "Barra de ações fixa para os botões mais usados.",
            "Tudo se adapta ao tamanho do ecrã.",
          ]}
        />
      </>
    ),
  },
];

/* ------------------------------------------------------------------- página -- */

export default function Help() {
  const [query, setQuery] = useState("");
  // Várias secções podem estar abertas ao mesmo tempo (Set de ids).
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(SECTIONS[0] ? [SECTIONS[0].id] : [])
  );
  // Referências às secções para o scroll suave a partir do índice/pesquisa.
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      q
        ? SECTIONS.filter(
            (s) =>
              s.title.toLowerCase().includes(q) ||
              s.summary.toLowerCase().includes(q) ||
              s.text.includes(q)
          )
        : SECTIONS,
    [q]
  );
  // IDs que dão match, para abrir automaticamente durante a pesquisa.
  const matchIds = useMemo(() => new Set(visible.map((s) => s.id)), [visible]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Uma secção está aberta se: em pesquisa → deu match; sem pesquisa → no Set.
  const isOpen = (id: string) => (q ? matchIds.has(id) : open.has(id));

  // Salta para a secção a partir do índice e garante que fica aberta.
  const goTo = (id: string) => {
    setOpen((prev) => new Set(prev).add(id));
    // Espera o próximo frame para o corpo já ter expandido antes do scroll.
    requestAnimationFrame(() => {
      refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      {/* ---------------------------------------------------------- Hero --- */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-brand-600 to-teal-500 p-6 text-white shadow-elevated sm:p-9">
        {/* Brilhos decorativos */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-teal-300/20 blur-2xl" />

        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <DucMark width={24} height={24} className="text-white" />
            </span>
            <Badge className="bg-white/15 text-white ring-white/30">
              Centro de Ajuda
            </Badge>
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-4xl">
            Como funciona o DUC
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/85 sm:text-base">
            Tudo o que precisa de saber sobre o Documento Único de Cliente — das
            etapas e do rastreio à conversa, notificações, PDF e configuração do
            fluxo.
          </p>

          {/* Pesquisa integrada e destacada */}
          <div className="relative mt-6">
            <Search
              width={18}
              height={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar um tópico… (ex.: fechar etapa, kanban, @menções, PDF)"
              className="border-transparent bg-white/95 py-2.5 pl-11 text-slate-800 shadow-lg backdrop-blur focus:ring-white/50"
            />
          </div>
          {!q && (
            <p className="mt-2 text-xs text-white/70">
              {SECTIONS.length} tópicos disponíveis — comece pelo índice abaixo.
            </p>
          )}
        </div>
      </header>

      {/* --------------------------------------------- Índice / navegação --- */}
      {!q && (
        <nav className="mt-6" aria-label="Índice de tópicos">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Navegação rápida
          </p>
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goTo(s.id)}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-brand-100 hover:bg-brand-50 hover:text-brand-800"
                >
                  <Icon
                    width={13}
                    height={13}
                    className={cx(TONE[s.tone].chip, "shrink-0")}
                  />
                  {s.title}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ------------------------------------------------------ Acordeão --- */}
      <div className="mt-6 space-y-3">
        {visible.length === 0 ? (
          <Card className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Search width={20} height={20} />
            </div>
            <p className="text-sm font-medium text-slate-700">
              Sem resultados para "{query}"
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Tente outra palavra, como "etapa", "kanban" ou "notificações".
            </p>
          </Card>
        ) : (
          visible.map((s) => {
            const opened = isOpen(s.id);
            const Icon = s.icon;
            const tone = TONE[s.tone];
            return (
              <Card
                key={s.id}
                className={cx(
                  "scroll-mt-4 overflow-hidden transition-all",
                  opened && "ring-2 ring-brand-100"
                )}
              >
                {/* wrapper com ref para o scroll do índice */}
                <div ref={(el) => (refs.current[s.id] = el)}>
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-expanded={opened}
                    className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50/70 sm:px-5"
                  >
                    <span
                      className={cx(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                        opened ? tone.open : tone.closed
                      )}
                    >
                      <Icon width={19} height={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">
                        {s.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {s.summary}
                      </span>
                    </span>
                    <ChevronRight
                      width={18}
                      height={18}
                      className={cx(
                        "shrink-0 text-slate-400 transition-transform duration-300",
                        opened && "rotate-90 text-brand"
                      )}
                    />
                  </button>

                  {/* Corpo expansível (transição suave via grid-rows) */}
                  <div
                    className={cx(
                      "grid transition-all duration-300 ease-in-out",
                      opened
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-slate-100 px-4 pb-5 pt-4 sm:px-5">
                        {s.body}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* -------------------------------------------------- Rodapé/atalhos --- */}
      <div className="mt-8">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
            <p className="text-sm font-semibold text-slate-800">Atalhos úteis</p>
            <p className="text-xs text-slate-400">
              Salte direto para onde precisa de trabalhar.
            </p>
          </div>
          <div className="grid gap-2.5 p-4 sm:grid-cols-2">
            <ShortcutLink
              to="/"
              tone="brand"
              icon={<DucMark width={18} height={18} />}
              title="Criar um DUC"
              desc="Comece um novo processo de cliente"
              highlight
            />
            <ShortcutLink
              to="/dashboard"
              tone="teal"
              icon={<Chart width={18} height={18} />}
              title="Dashboard"
              desc="Visão geral e processos parados"
            />
            <ShortcutLink
              to="/notificacoes"
              tone="amber"
              icon={<Bell width={18} height={18} />}
              title="Notificações"
              desc="Menções e alertas de etapas"
            />
            <ShortcutLink
              to="/config"
              tone="slate"
              icon={<Settings width={18} height={18} />}
              title="Configuração"
              desc="Editor visual do fluxo"
            />
          </div>
        </Card>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
        <AlertTriangle width={13} height={13} />
        Ainda com dúvidas? Fale com o administrador da sua organização.
      </p>
    </div>
  );
}

/* --------------------------------------------------------- atalho (rodapé) -- */

function ShortcutLink({
  to,
  icon,
  title,
  desc,
  tone,
  highlight,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  desc: string;
  tone: Section["tone"];
  highlight?: boolean;
}) {
  const t = TONE[tone];
  return (
    <Link
      to={to}
      className={cx(
        "group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all",
        highlight
          ? "border-brand-100 bg-brand-50/60 hover:bg-brand-50"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      <span
        className={cx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105",
          t.closed
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          {title}
          {highlight && (
            <Badge className="bg-brand text-white ring-brand">Novo</Badge>
          )}
        </span>
        <span className="block truncate text-xs text-slate-400">{desc}</span>
      </span>
      <ChevronRight
        width={16}
        height={16}
        className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
      />
    </Link>
  );
}
