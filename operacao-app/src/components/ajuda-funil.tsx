import { Link } from "react-router-dom";
import { Badge, Card, cx } from "./ui";
import { CheckCircle, ChevronRight, Robo } from "./icons";

/**
 * O funil, de uma ponta à outra.
 *
 * A pergunta que ninguém sabia responder sem estar ao lado de alguém: onde é
 * que isto começa, e onde é que acaba. As outras abas explicam o porquê e as
 * peças; esta segue **um trabalho** do princípio ao fim, pela ordem por que
 * acontece, e diz em cada passo o que a pessoa faz e o que a aplicação faz
 * sozinha.
 *
 * O que se ganha está no fim, e não no princípio: quem acabou de perceber o
 * caminho reconhece as vantagens; quem as lê primeiro não tem onde as pendurar.
 */

/* ────────────────────────────── O desenho ──────────────────────────────── */

function DiagramaDoFunil() {
  return (
    <svg viewBox="0 0 720 216" className="h-auto w-full" role="img"
         aria-label="Do Olyvia à Operação e de volta ao cliente">
      <defs>
        <marker id="seta-funil" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="#a78bfa" />
        </marker>
      </defs>

      {/* Olyvia */}
      <rect x="8" y="52" width="150" height="112" rx="12" fill="#f1f5f9" stroke="#cbd5e1" />
      <text x="83" y="76" textAnchor="middle" fontSize="12" fontWeight="700" fill="#334155">
        Olyvia (CRM)
      </text>
      {["Cliente", "Contacto", "Agenda", "Fornecedor"].map((t, i) => (
        <text key={t} x="83" y={98 + i * 17} textAnchor="middle" fontSize="11" fill="#64748b">
          {t}
        </text>
      ))}

      <line x1="162" y1="108" x2="196" y2="108" stroke="#a78bfa" strokeWidth="2"
            markerEnd="url(#seta-funil)" />
      <text x="179" y="99" textAnchor="middle" fontSize="9" fill="#7c3aed">lê</text>

      {/* Operações */}
      <rect x="200" y="16" width="320" height="184" rx="12" fill="#faf5ff" stroke="#d8b4fe" />
      <text x="360" y="38" textAnchor="middle" fontSize="12" fontWeight="700" fill="#6d28d9">
        Operações
      </text>

      {[
        ["1", "Nasce", 232],
        ["2", "Aprova", 292],
        ["3", "Executa", 352],
        ["4", "Fecha", 412],
        ["5", "Confirma", 472],
      ].map(([n, t, x], i, todos) => (
        <g key={n}>
          <circle cx={x as number} cy="96" r="15" fill="#7c3aed" />
          <text x={x as number} y="101" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
            {n}
          </text>
          <text x={x as number} y="132" textAnchor="middle" fontSize="10" fill="#4c1d95">
            {t}
          </text>
          {i < todos.length - 1 && (
            <line x1={(x as number) + 17} y1="96" x2={(x as number) + 41} y2="96"
                  stroke="#c4b5fd" strokeWidth="2" markerEnd="url(#seta-funil)" />
          )}
        </g>
      ))}

      <text x="360" y="166" textAnchor="middle" fontSize="10" fill="#7c3aed">
        o técnico responde no telemóvel · o escritório aceita
      </text>

      <line x1="524" y1="108" x2="558" y2="108" stroke="#a78bfa" strokeWidth="2"
            markerEnd="url(#seta-funil)" />

      {/* Cliente */}
      <rect x="562" y="66" width="150" height="84" rx="12" fill="#ecfdf5" stroke="#a7f3d0" />
      <text x="637" y="98" textAnchor="middle" fontSize="12" fontWeight="700" fill="#065f46">
        O cliente
      </text>
      <text x="637" y="118" textAnchor="middle" fontSize="10" fill="#047857">
        recebe o relatório
      </text>
      <text x="637" y="133" textAnchor="middle" fontSize="10" fill="#047857">
        sem ninguém o mandar
      </text>
    </svg>
  );
}

/* ─────────────────────────────── Os passos ─────────────────────────────── */

interface Passo {
  n: number;
  titulo: string;
  onde: string;
  href?: string;
  quem: string;
  texto: string;
  automatico?: string[];
}

const PASSOS: Passo[] = [
  {
    n: 1,
    titulo: "A ordem nasce",
    onde: "Ordens › Nova ordem",
    href: "/ordens/nova",
    quem: "Quem atende, ou ninguém",
    texto:
      "Escolhe-se o cliente e o local — que vêm do Olyvia, e não se escrevem outra vez. Mas na maior parte das vezes ninguém cria nada: a ordem aparece sozinha.",
    automatico: [
      "Um plano preventivo gera as ordens dele até 120 dias à frente",
      "Uma resposta “não conforme” abre logo a corretiva, ligada à original",
      "Um orçamento aceite vira obra",
    ],
  },
  {
    n: 2,
    titulo: "Alguém aprova e marca",
    onde: "Ordens › Por aprovar",
    href: "/ordens?vista=por-aprovar",
    quem: "Quem coordena",
    texto:
      "Aprova-se, escolhe-se quem faz e quando. A agenda avisa se a pessoa está de férias, fora de horário, num feriado, ou já com outra coisa marcada à mesma hora.",
    automatico: [
      "A pessoa escolhida recebe o aviso no sino do Olyvia",
      "O choque de agenda aparece antes de se marcar, não depois",
    ],
  },
  {
    n: 3,
    titulo: "O técnico faz o trabalho",
    onde: "Hoje, no telemóvel",
    href: "/",
    quem: "Quem está no local",
    texto:
      "Abre a ordem, carrega em “Como lá chegar”, responde às tarefas, tira fotos, lança material. Os valores medidos são comparados com os limites na hora.",
    automatico: [
      "A ordem inicia-se sozinha à primeira resposta — ninguém se esquece do botão",
      "Sem rede, a resposta fica guardada no telemóvel e sai quando houver sinal",
      "O tempo conta-se das sessões de trabalho, e vira custo de mão de obra",
    ],
  },
  {
    n: 4,
    titulo: "O técnico entrega",
    onde: "Na ficha da ordem",
    quem: "Quem está no local",
    texto:
      "Carrega em Fechar. Se o cliente estiver presente, assina no telemóvel — fica com o nome, a qualidade e o momento.",
    automatico: [
      "As ordens de um tipo marcado como “fecha sozinha” fecham-se quando as obrigatórias estiverem respondidas",
      "O custo de mão de obra recalcula-se ao fechar",
    ],
  },
  {
    n: 5,
    titulo: "O escritório aceita",
    onde: "Ordens › Por confirmar",
    href: "/ordens?vista=por-confirmar",
    quem: "Quem coordena",
    texto:
      "Revê e carrega em Confirmar. É o passo que muita gente não espera, e é de propósito: fechar é o técnico a dizer que acabou, confirmar é a casa a dizer que está bem.",
    automatico: [
      "O relatório vai ao cliente por email, se isso estiver ligado",
      "Fica registado quem confirmou, quando, e para que endereço o email saiu",
    ],
  },
];

/* ───────────────────────────── As vantagens ────────────────────────────── */

const VANTAGENS: { titulo: string; texto: string }[] = [
  {
    titulo: "O ciclo fecha-se",
    texto:
      "Uma não conformidade abre a corretiva no momento em que é respondida. No Infraspeak essa caixa existe e está desligada — as não conformidades morrem no histórico e ninguém volta lá.",
  },
  {
    titulo: "Uma coisa em vez de duas",
    texto:
      "Preventivo e corretivo são a mesma ordem, com origens diferentes. Lá são dois objetos, com dois ecrãs, dois catálogos de estados e dois relatórios — para guardar os mesmos campos.",
  },
  {
    titulo: "Os dados são os do Olyvia",
    texto:
      "Clientes, contactos, utilizadores, permissões, agenda e fornecedores. Não há sincronizações, não há contas a duplicar, e não há duas versões da morada do mesmo cliente.",
  },
  {
    titulo: "O trabalho não se perde",
    texto:
      "Numa cave sem rede, a resposta fica guardada no telemóvel e sai sozinha depois. Antes, fechar a aplicação apagava a manhã inteira.",
  },
  {
    titulo: "O custo existe",
    texto:
      "O tempo vem das sessões de trabalho e o material lança-se na ordem. Lá, o campo “custo por hora” existe e nunca foi preenchido: o custo de mão de obra é 0,00 € em todas as ordens da instância.",
  },
  {
    titulo: "Tudo fica registado",
    texto:
      "Criar, atribuir, iniciar, pausar, fechar, confirmar, lançar custo, anexar, assinar, mudar um equipamento de sítio, ligar o envio ao cliente. Com quem, quando, e o antes e o depois.",
  },
];

/* ──────────────────────────── O que é novo ─────────────────────────────── */

const NOVO: { o: string; onde: string; href?: string; texto: string }[] = [
  {
    o: "Mapa da agenda",
    onde: "Agenda › Mapa",
    href: "/agenda",
    texto: "Onde está o trabalho da semana, e se está todo na mesma zona.",
  },
  {
    o: "O dia pela estrada",
    onde: "Agenda › Dia",
    href: "/agenda",
    texto:
      "Quantos quilómetros custa o dia, e se outra ordem de visita custaria menos — dizendo quantas horas teriam de ser remarcadas.",
  },
  {
    o: "Ficha do local",
    onde: "Locais › Abrir ficha",
    href: "/locais",
    texto: "Os equipamentos daquele sítio, o que já lá se fez, e como lá chegar.",
  },
  {
    o: "Duplicar",
    onde: "Ordens, Locais, Planos",
    texto:
      "O mesmo plano para doze edifícios iguais. Copia-se o molde, nunca o que aconteceu.",
  },
  {
    o: "Tipo de trabalho e centro de custo",
    onde: "Definições › Tipos e custos",
    href: "/definicoes?ver=tipos",
    texto:
      "Os nove tipos que a operação já usava. O centro de custo fica no equipamento, e a ordem herda-o.",
  },
  {
    o: "Documentos na ordem",
    onde: "Na ficha da ordem",
    texto: "Word, Excel, PDF e CSV, além das fotos e das notas de voz.",
  },
];

/* ─────────────────────────────── O ecrã ────────────────────────────────── */

export default function AjudaFunil() {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">
          Um trabalho, do princípio ao fim
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Começa no Olyvia, passa por Operações, e volta ao cliente. Cinco passos, e três deles
          acontecem sem ninguém carregar em nada.
        </p>
        <div className="mt-4">
          <DiagramaDoFunil />
        </div>
      </Card>

      <div className="space-y-3">
        {PASSOS.map((p) => (
          <Card key={p.n} className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                {p.n}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold text-slate-900">{p.titulo}</h3>
                  {p.href ? (
                    <Link
                      to={p.href}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 transition-colors hover:bg-slate-200"
                    >
                      {p.onde} <ChevronRight width={11} height={11} />
                    </Link>
                  ) : (
                    <Badge>{p.onde}</Badge>
                  )}
                  <span className="text-xs text-slate-400">{p.quem}</span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-slate-700">{p.texto}</p>

                {/* O que acontece sozinho é o que faz isto valer a pena, e por
                    isso está marcado, e não escondido no meio do texto. */}
                {p.automatico && (
                  <div className="mt-3 rounded-lg bg-emerald-50/70 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      <Robo width={13} height={13} />
                      Sozinho, aqui
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {p.automatico.map((a) => (
                        <li key={a} className="flex gap-1.5 text-sm leading-relaxed text-emerald-900">
                          <CheckCircle width={13} height={13} className="mt-1 shrink-0" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">
          O que isto muda, agora que já se viu o caminho
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {VANTAGENS.map((v) => (
            <div key={v.titulo} className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{v.titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{v.texto}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O que há de novo</h2>
        <p className="mt-1 text-sm text-slate-500">
          Coisas que não existiam no Infraspeak, ou existiam sem servir para nada.
        </p>
        <ul className="mt-3 divide-y divide-slate-100">
          {NOVO.map((n) => (
            <li key={n.o} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5">
              <span className="text-sm font-medium text-slate-800">{n.o}</span>
              {n.href ? (
                <Link
                  to={n.href}
                  className={cx(
                    "rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600",
                    "transition-colors hover:bg-slate-200"
                  )}
                >
                  {n.onde}
                </Link>
              ) : (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {n.onde}
                </span>
              )}
              <span className="w-full text-sm leading-relaxed text-slate-600">{n.texto}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
