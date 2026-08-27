import { useState } from "react";
import { Card, Badge, Input, cx } from "../components/ui";
import {
  Search,
  ChevronRight,
  Check,
  FileText,
  Settings,
  Building,
  Paperclip,
} from "../components/icons";

import type { ComponentType, ReactNode, SVGProps } from "react";

/* Estrutura de cada secção de ajuda. `text` junta título+corpo para a pesquisa. */
type Section = {
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  summary: string;
  body: ReactNode;
  /** Texto puro usado só para filtrar (título + resumo + passos). */
  text: string;
};

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
    <div className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50/70 px-3 py-2 text-sm text-brand-900 ring-1 ring-inset ring-brand-100">
      <Badge className="bg-brand text-white ring-brand">Dica</Badge>
      <span>{children}</span>
    </div>
  );
}

const SECTIONS: Section[] = [
  {
    id: "o-que-e",
    icon: FileText,
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
    icon: FileText,
    title: "Etapas e Rastreio",
    summary: "Cada etapa tem os seus campos; o Rastreio mostra onde está.",
    text: "etapas rastreio campos onde está o duc progresso preenchimento estado atual",
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
    title: "Fechar uma etapa",
    summary: "Confirmação, assinatura de quem fechou e campos obrigatórios.",
    text: "fechar etapa confirmação assinatura quem fechou quando registo campos obrigatórios validação",
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
    icon: FileText,
    title: "Vista Kanban",
    summary: "Arraste DUCs entre etapas; avançar fecha as anteriores em cascata.",
    text: "vista kanban arrastar duc entre etapas colunas cascata fechar anteriores avançar",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Na <strong>Vista Kanban</strong>, cada etapa é uma coluna e cada DUC é
          um cartão. Pode <strong>arrastar</strong> um cartão de uma coluna para
          outra para o mover na etapa.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Ao arrastar um DUC <strong>para a frente</strong>, todas as etapas
          anteriores que ainda estavam abertas são <strong>fechadas em
          cascata</strong> automaticamente — o percurso fica coerente, sem saltos.
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
    title: "Fases de pagamento",
    summary: "Na etapa Financeiro: %, valor, vencimento e nota, com o botão '+'.",
    text: "fases de pagamento financeiro percentagem valor vencimento nota adicionar lista faturação",
    body: (
      <>
        <p className="text-sm text-slate-600">
          Na etapa <strong>Financeiro</strong> pode definir{" "}
          <strong>fases de pagamento</strong>. Use o botão{" "}
          <strong>"+"</strong> para adicionar cada fase à lista.
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
    icon: Settings,
    title: "Notificações por etapa",
    summary: "Emails ao entrar/fechar e alertas se a etapa ficar parada.",
    text: "notificações por etapa email membros externos entrar fechar alertas parada dias configurações",
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
          esquecido.
        </Tip>
      </>
    ),
  },
  {
    id: "configuracao",
    icon: Building,
    title: "Configuração do fluxo",
    summary: "Em /config, um editor visual do fluxo por organização.",
    text: "configuração config editor visual fluxo organização etapas campos personalizar",
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
    title: "No telemóvel",
    summary: "Cartões, barra de ações fixa e tudo responsivo.",
    text: "mobile telemóvel responsivo cartões barra de ações fixa toque ecrã pequeno",
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

export default function Help() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(SECTIONS[0]?.id ?? null);

  const q = query.trim().toLowerCase();
  const visible = q
    ? SECTIONS.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.text.includes(q)
      )
    : SECTIONS;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      {/* Cabeçalho com leve gradiente */}
      <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-brand-50 p-6 ring-1 ring-slate-200/70 sm:p-8">
        <div className="flex items-center gap-2 text-brand">
          <FileText width={22} height={22} />
          <Badge className="bg-white/70 text-brand-800 ring-brand-100">
            Centro de Ajuda
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-slate-800 sm:text-3xl">
          Como funciona o DUC
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-500">
          Tudo o que precisa de saber sobre o Documento Único de Cliente — das
          etapas e do rastreio às notificações e à configuração do fluxo.
        </p>

        {/* Pesquisa por tópico */}
        <div className="relative mt-5">
          <Search
            width={16}
            height={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar um tópico… (ex.: fechar etapa, kanban, pagamento)"
            className="pl-9"
          />
        </div>
      </header>

      {/* Acordeão de secções */}
      <div className="mt-6 space-y-3">
        {visible.length === 0 ? (
          <Card className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              Sem resultados para "{query}"
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Tente outra palavra, como "etapa", "kanban" ou "notificações".
            </p>
          </Card>
        ) : (
          visible.map((s) => {
            const isOpen = open === s.id;
            const Icon = s.icon;
            return (
              <Card
                key={s.id}
                className={cx(
                  "overflow-hidden transition-all",
                  isOpen && "ring-2 ring-brand-100"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50/70 sm:px-5"
                >
                  <span
                    className={cx(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                      isOpen
                        ? "bg-brand text-white"
                        : "bg-brand-50 text-brand ring-1 ring-brand-100"
                    )}
                  >
                    <Icon width={18} height={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800">
                      {s.title}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {s.summary}
                    </span>
                  </span>
                  <ChevronRight
                    width={18}
                    height={18}
                    className={cx(
                      "shrink-0 text-slate-400 transition-transform duration-200",
                      isOpen && "rotate-90 text-brand"
                    )}
                  />
                </button>

                {/* Corpo expansível (transição suave via grid-rows) */}
                <div
                  className={cx(
                    "grid transition-all duration-300 ease-in-out",
                    isOpen
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
              </Card>
            );
          })
        )}
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">
        Ainda com dúvidas? Fale com o administrador da sua organização.
      </p>
    </div>
  );
}
