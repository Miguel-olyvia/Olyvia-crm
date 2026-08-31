/**
 * Os desenhos da página de ajuda.
 *
 * SVG escrito à mão, sem biblioteca de gráficos. São cinco desenhos fixos —
 * uma biblioteca traria 60 kB e uma API para aprender, para desenhar cinco
 * caixas e umas setas que nunca mudam.
 *
 * Regras que valem para todos:
 *
 *  · `viewBox` fixo e largura 100 %. O desenho encolhe no telemóvel em vez de
 *    empurrar a página para o lado; quem os usa põe-nos dentro de um
 *    contentor com `overflow-x-auto` e uma largura mínima;
 *  · cada `<svg>` leva `role="img"` e um `<title>`, porque um fluxograma que
 *    só existe como imagem é um fluxograma que metade das pessoas não lê;
 *  · os `id` dos marcadores de seta levam prefixo por desenho. Sem isso, dois
 *    SVG na mesma página definem `#seta` e o browser usa o primeiro — as setas
 *    do segundo saem da cor errada, sem erro nenhum;
 *  · a paleta é a da aplicação: brand para o caminho novo, vermelho para o que
 *    não acontece, verde para o que fecha, âmbar para o que avisa.
 */

import type { ReactNode } from "react";

const TINTA = {
  brand: "#7c3aed",
  brandClaro: "#ede9fe",
  cinza: "#94a3b8",
  cinzaClaro: "#f1f5f9",
  texto: "#334155",
  textoFraco: "#64748b",
  vermelho: "#ef4444",
  vermelhoClaro: "#fef2f2",
  verde: "#059669",
  verdeClaro: "#ecfdf5",
  ambar: "#d97706",
  ambarClaro: "#fffbeb",
} as const;

/** Um SVG que encolhe em vez de empurrar a página. */
function Quadro({
  titulo,
  largura,
  altura,
  minWidth,
  children,
}: {
  titulo: string;
  largura: number;
  altura: number;
  minWidth: number;
  children: ReactNode;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 py-1">
      <svg
        role="img"
        aria-label={titulo}
        viewBox={`0 0 ${largura} ${altura}`}
        style={{ minWidth, width: "100%", height: "auto" }}
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
      >
        <title>{titulo}</title>
        {children}
      </svg>
    </div>
  );
}

/** Os marcadores de ponta de seta, um por cor, com prefixo próprio. */
function Pontas({ id }: { id: string }) {
  return (
    <defs>
      {(["cinza", "brand", "vermelho", "verde"] as const).map((c) => (
        <marker
          key={c}
          id={`${id}-${c}`}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill={TINTA[c]} />
        </marker>
      ))}
    </defs>
  );
}

interface CaixaProps {
  x: number;
  y: number;
  w: number;
  h?: number;
  texto: string;
  sub?: string;
  tom?: "neutro" | "brand" | "mau" | "bom" | "aviso";
  tracejado?: boolean;
}

function Caixa({ x, y, w, h = 40, texto, sub, tom = "neutro", tracejado }: CaixaProps) {
  const cores = {
    neutro: [TINTA.cinzaClaro, TINTA.cinza, TINTA.texto],
    brand: [TINTA.brandClaro, TINTA.brand, "#4c1d95"],
    mau: [TINTA.vermelhoClaro, TINTA.vermelho, "#991b1b"],
    bom: [TINTA.verdeClaro, TINTA.verde, "#065f46"],
    aviso: [TINTA.ambarClaro, TINTA.ambar, "#92400e"],
  }[tom];

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="8"
        fill={cores[0]}
        stroke={cores[1]}
        strokeWidth="1.5"
        strokeDasharray={tracejado ? "4 3" : undefined}
      />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 4 : y + h / 2 + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="500"
        fill={cores[2]}
      >
        {texto}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 12}
          textAnchor="middle"
          fontSize="10.5"
          fill={TINTA.textoFraco}
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function Seta({
  id,
  de,
  para,
  cor = "cinza",
  rotulo,
  curva,
  rotuloDx = 0,
  rotuloDy = -6,
  rotuloAncora = "middle",
}: {
  id: string;
  de: [number, number];
  para: [number, number];
  cor?: "cinza" | "brand" | "vermelho" | "verde";
  rotulo?: string;
  /** Altura do arco. Positivo curva para baixo, negativo para cima. */
  curva?: number;
  /**
   * Onde fica a palavra, relativamente ao meio da seta.
   *
   * O default (mesmo x, 6px acima) serve setas compridas. Numa seta curta
   * entre duas caixas, a palavra é mais larga do que a seta e cai em cima das
   * caixas — nesses casos sobe-se com `rotuloDy`. Em setas verticais lado a
   * lado, duas palavras centradas ficam uma por cima da outra: aí afasta-se
   * cada uma para o seu lado com `rotuloDx` + `rotuloAncora`.
   */
  rotuloDx?: number;
  rotuloDy?: number;
  rotuloAncora?: "start" | "middle" | "end";
}) {
  const [x1, y1] = de;
  const [x2, y2] = para;
  const d = curva
    ? `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + curva} ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x2} ${y2}`;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={TINTA[cor]}
        strokeWidth="1.5"
        markerEnd={`url(#${id}-${cor})`}
      />
      {rotulo && (
        <text
          x={(x1 + x2) / 2 + rotuloDx}
          y={(y1 + y2) / 2 + (curva ? curva * 0.55 : rotuloDy)}
          textAnchor={rotuloAncora}
          fontSize="10"
          fill={TINTA.textoFraco}
        >
          {rotulo}
        </text>
      )}
    </g>
  );
}

function Rotulo({
  x,
  y,
  children,
  cor = TINTA.textoFraco,
  peso = "500",
  tamanho = 11,
  ancora = "start",
}: {
  x: number;
  y: number;
  children: string;
  cor?: string;
  peso?: string;
  tamanho?: number;
  ancora?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} fontSize={tamanho} fontWeight={peso} fill={cor} textAnchor={ancora}>
      {children}
    </text>
  );
}

/* ══════════════ 1. O que acontece quando algo está mal ══════════════════ */

/**
 * O desenho mais importante de todos: é a diferença que mais dinheiro vale.
 *
 * Em cima, o que acontece hoje no Infraspeak — o relato morre no histórico.
 * Em baixo, o que passa a acontecer. As duas linhas começam iguais de
 * propósito: o trabalho do técnico é o mesmo, o que muda é o que o sistema
 * faz com o que ele encontrou.
 */
export function DiagramaNaoConformidade() {
  const id = "nc";
  return (
    <Quadro
      titulo="Antes e depois: o que acontece quando um técnico encontra um problema"
      largura={720}
      altura={250}
      minWidth={560}
    >
      <Pontas id={id} />

      {/* ── Antes ── */}
      <Rotulo x={0} y={16} cor={TINTA.vermelho} peso="600">
        ANTES · Infraspeak
      </Rotulo>
      <Caixa x={0} y={28} w={120} texto="Inspeção" sub="o técnico vai lá" />
      <Seta id={id} de={[124, 48]} para={[148, 48]} />
      <Caixa x={152} y={28} w={130} texto="Não conforme" sub="o extintor está mau" tom="aviso" />
      <Seta id={id} de={[286, 48]} para={[310, 48]} />
      <Caixa x={314} y={28} w={150} texto="Fica no histórico" sub="escrito, e mais nada" />
      <Seta id={id} de={[468, 48]} para={[492, 48]} cor="vermelho" />
      <Caixa
        x={496}
        y={28}
        w={200}
        texto="Ninguém é avisado"
        sub="o ciclo não fecha"
        tom="mau"
        tracejado
      />
      {/* Ancoradas à direita: centradas na caixa, o texto passava dos 720 do
          viewBox e ficava cortado — sem aviso nenhum, só uma palavra a meio. */}
      <text x={720} y={98} textAnchor="end" fontSize="10.5" fill={TINTA.vermelho}>
        alguém tem de se lembrar, semanas depois
      </text>

      {/* separador */}
      <line x1="0" y1="120" x2="720" y2="120" stroke="#e2e8f0" strokeWidth="1" />

      {/* ── Depois ── */}
      <Rotulo x={0} y={148} cor={TINTA.brand} peso="600">
        DEPOIS · Olyvia
      </Rotulo>
      <Caixa x={0} y={160} w={120} texto="Inspeção" sub="o mesmo trabalho" />
      <Seta id={id} de={[124, 180]} para={[148, 180]} />
      <Caixa x={152} y={160} w={130} texto="Não conforme" sub="o extintor está mau" tom="aviso" />
      <Seta id={id} de={[286, 180]} para={[310, 180]} cor="brand" />
      <Caixa
        x={314}
        y={160}
        w={150}
        texto="Ordem corretiva"
        sub="nasce sozinha"
        tom="brand"
      />
      <Seta id={id} de={[468, 180]} para={[492, 180]} cor="verde" />
      <Caixa
        x={496}
        y={160}
        w={200}
        texto="Aviso no sino, e reparação"
        sub="o ciclo fecha"
        tom="bom"
      />
      <text x={720} y={230} textAnchor="end" fontSize="10.5" fill={TINTA.verde}>
        no mesmo minuto, já com cliente, sítio e equipamento
      </text>
    </Quadro>
  );
}

/* ══════════════════ 2. O tempo de trabalho, e o custo ═══════════════════ */

/**
 * O número mais absurdo que o levantamento encontrou: 5303 horas numa ordem.
 * É fecho menos início, com noites e fins de semana lá dentro.
 *
 * A barra comprida em cima contra as três barrinhas em baixo diz isto sem
 * uma palavra — e o custo por baixo diz o que isso vale.
 */
export function DiagramaTempoDeTrabalho() {
  const id = "tt";
  return (
    <Quadro
      titulo="Antes e depois: como se mede o tempo de trabalho de uma ordem"
      largura={720}
      altura={230}
      minWidth={560}
    >
      <Pontas id={id} />

      <Rotulo x={0} y={16} cor={TINTA.vermelho} peso="600">
        ANTES · &ldquo;tempo de execução&rdquo; = fecho − início
      </Rotulo>

      <rect x="0" y="30" width="640" height="26" rx="6" fill={TINTA.vermelhoClaro}
            stroke={TINTA.vermelho} strokeWidth="1.5" />
      <text x="320" y="47" textAnchor="middle" fontSize="11.5" fontWeight="500" fill="#991b1b">
        5303:05:34 — noites, fins de semana e férias incluídos
      </text>
      <Rotulo x={0} y={72}>3 de janeiro, 09:14</Rotulo>
      <Rotulo x={640} y={72} ancora="end">12 de maio, 16:20</Rotulo>
      <text x="720" y="47" textAnchor="end" fontSize="12" fontWeight="600" fill={TINTA.vermelho}>
        0,00 €
      </text>
      <text x="720" y="61" textAnchor="end" fontSize="9.5" fill={TINTA.textoFraco}>
        custo
      </text>

      <line x1="0" y1="96" x2="720" y2="96" stroke="#e2e8f0" strokeWidth="1" />

      <Rotulo x={0} y={124} cor={TINTA.brand} peso="600">
        DEPOIS · sessões de trabalho reais
      </Rotulo>

      {[
        { x: 0, w: 90, quando: "3 jan", quanto: "2 h 10" },
        { x: 130, w: 74, quando: "8 fev", quanto: "1 h 45" },
        { x: 244, w: 108, quando: "12 mai", quanto: "2 h 25" },
      ].map((s) => (
        <g key={s.quando}>
          <rect x={s.x} y="138" width={s.w} height="26" rx="6" fill={TINTA.brandClaro}
                stroke={TINTA.brand} strokeWidth="1.5" />
          <text x={s.x + s.w / 2} y="155" textAnchor="middle" fontSize="11" fontWeight="500"
                fill="#4c1d95">
            {s.quanto}
          </text>
          <text x={s.x + s.w / 2} y="180" textAnchor="middle" fontSize="10" fill={TINTA.textoFraco}>
            {s.quando}
          </text>
        </g>
      ))}

      {/* o vazio entre sessões, que é o que a conta antiga contava como trabalho */}
      {[
        { x: 90, w: 40 },
        { x: 204, w: 40 },
      ].map((v) => (
        <rect key={v.x} x={v.x} y="146" width={v.w} height="10" rx="3" fill="#f8fafc"
              stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
      ))}

      <text x="380" y="155" fontSize="10.5" fill={TINTA.textoFraco}>
        entre sessões ninguém está a trabalhar
      </text>

      <text x="720" y="152" textAnchor="end" fontSize="12" fontWeight="600" fill={TINTA.verde}>
        139 €
      </text>
      <text x="720" y="166" textAnchor="end" fontSize="9.5" fill={TINTA.textoFraco}>
        6 h 20 no total
      </text>

      <text x="0" y="212" fontSize="10.5" fill={TINTA.textoFraco}>
        A empresa passa a saber quanto lhe custou cada obra — e a comparar com o que orçamentou.
      </text>
    </Quadro>
  );
}

/* ═════════════════════ 3. De onde vem uma ordem ═════════════════════════ */

/**
 * Três origens, um objeto. No Infraspeak são duas coisas diferentes
 * ("Ocorrência" e "Pedido"), com dois ecrãs e dois catálogos de estados, para
 * guardar exatamente os mesmos campos.
 */
export function DiagramaOrigens() {
  const id = "or";
  return (
    <Quadro
      titulo="As três maneiras de nascer uma ordem de trabalho"
      largura={720}
      altura={216}
      minWidth={520}
    >
      <Pontas id={id} />

      <Caixa x={0} y={16} w={190} texto="Plano preventivo" sub="a data chegou" />
      <Caixa x={0} y={80} w={190} texto="O telefone toca" sub="alguém abre a ordem" />
      <Caixa x={0} y={144} w={190} texto="Orçamento aceite" sub="vem do CRM" />

      <Seta id={id} de={[194, 36]} para={[300, 96]} cor="brand" curva={-14} />
      <Seta id={id} de={[194, 100]} para={[300, 100]} cor="brand" />
      <Seta id={id} de={[194, 164]} para={[300, 104]} cor="brand" curva={14} />

      <rect x="304" y="72" width="160" height="56" rx="10" fill={TINTA.brandClaro}
            stroke={TINTA.brand} strokeWidth="2" />
      <text x="384" y="96" textAnchor="middle" fontSize="13" fontWeight="600" fill="#4c1d95">
        Uma ordem
      </text>
      <text x="384" y="112" textAnchor="middle" fontSize="10.5" fill={TINTA.textoFraco}>
        OT-2026-00842
      </text>

      <Seta id={id} de={[468, 100]} para={[496, 100]} cor="brand" />
      <Caixa x={500} y={80} w={220} texto="Uma lista, um ecrã, um relatório"
             sub="os mesmos estados para as três" tom="bom" />

      {/* Abaixo da terceira caixa (acaba em y=184), não por cima dela. */}
      <text x="384" y="206" textAnchor="middle" fontSize="10.5" fill={TINTA.textoFraco}>
        No Infraspeak são duas coisas diferentes, com dois ecrãs e dois catálogos de estados.
      </text>
    </Quadro>
  );
}

/* ══════════════════ 4. O ciclo de vida de uma ordem ═════════════════════ */

/**
 * Para quem usa. Os sete estados e as passagens possíveis entre eles.
 *
 * Vale a pena mostrar isto inteiro porque a máquina de estados é imposta pela
 * base de dados: não há caminho por fora, nem sequer para quem falasse
 * diretamente com o servidor. Ver o desenho é ver as regras todas.
 */
export function DiagramaCicloDaOrdem() {
  const id = "cv";
  return (
    <Quadro
      titulo="O ciclo de vida de uma ordem de trabalho"
      largura={720}
      altura={230}
      minWidth={620}
    >
      <Pontas id={id} />

      {/* As palavras vão ACIMA das caixas (rotuloDy=-28). Uma seta entre duas
          caixas tem 28px, e "aprovar" tem uns 38 — centrada na seta, a palavra
          cai dentro das caixas dos dois lados. */}
      <Caixa x={0} y={70} w={104} texto="Por aprovar" sub="pedida" tom="aviso" />
      <Seta id={id} de={[108, 90]} para={[136, 90]} rotulo="aprovar" rotuloDy={-28} />
      <Caixa x={140} y={70} w={104} texto="Agendada" sub="tem data" />
      <Seta id={id} de={[248, 90]} para={[276, 90]} cor="brand" rotulo="iniciar" rotuloDy={-28} />
      <Caixa x={280} y={70} w={104} texto="Em curso" sub="a trabalhar" tom="brand" />
      <Seta id={id} de={[388, 90]} para={[416, 90]} cor="verde" rotulo="fechar" rotuloDy={-28} />
      <Caixa x={420} y={70} w={104} texto="Fechada" sub="trabalho feito" tom="bom" />
      <Seta id={id} de={[528, 90]} para={[556, 90]} cor="verde" rotulo="confirmar" rotuloDy={-28} />
      <Caixa x={560} y={70} w={160} texto="Confirmada" sub="o cliente aceitou" tom="bom" />

      {/* Pausa, por baixo. As duas setas estão a 34px uma da outra: com as duas
          palavras centradas, ficavam uma por cima da outra. Cada uma foge para
          o seu lado. */}
      <Caixa x={280} y={158} w={104} texto="Pausada" sub="falta material" tom="aviso" />
      <Seta id={id} de={[316, 114]} para={[316, 154]} rotulo="pausar"
            rotuloDx={-6} rotuloAncora="end" />
      <Seta id={id} de={[350, 154]} para={[350, 114]} cor="brand" rotulo="retomar"
            rotuloDx={6} rotuloAncora="start" />

      {/* cancelar */}
      <Caixa x={0} y={158} w={104} texto="Cancelada" sub="não se faz" />
      <Seta id={id} de={[52, 114]} para={[52, 154]} cor="vermelho" rotulo="rejeitar"
            rotuloDx={6} rotuloAncora="start" />

      <text x="0" y="24" fontSize="11" fontWeight="600" fill={TINTA.texto}>
        Só se passa de um estado para o outro por estas setas
      </text>
      <text x="0" y="40" fontSize="10.5" fill={TINTA.textoFraco}>
        A regra está na base de dados, não no ecrã: não há caminho por fora, para ninguém.
      </text>

      <text x="720" y="196" textAnchor="end" fontSize="10.5" fill={TINTA.textoFraco}>
        Responder à primeira tarefa inicia a ordem sozinha.
      </text>
      <text x="720" y="212" textAnchor="end" fontSize="10.5" fill={TINTA.textoFraco}>
        Fechar exige que as tarefas obrigatórias tenham resposta.
      </text>
    </Quadro>
  );
}

/* ═════════════════ 5. Onde vive a informação da empresa ═════════════════ */

/**
 * O desenho para quem decide: hoje a informação está em dois sítios que não
 * se falam, e é por isso que ninguém sabe se uma obra deu lucro.
 */
export function DiagramaOndeVive() {
  const id = "ov";
  return (
    <Quadro
      titulo="Antes e depois: onde vive a informação da empresa"
      largura={720}
      altura={220}
      minWidth={560}
    >
      <Pontas id={id} />

      <Rotulo x={0} y={16} cor={TINTA.vermelho} peso="600">
        ANTES · dois sistemas que não se falam
      </Rotulo>

      <rect x="0" y="28" width="300" height="62" rx="10" fill="#f8fafc" stroke={TINTA.cinza}
            strokeWidth="1.5" />
      <text x="150" y="50" textAnchor="middle" fontSize="12" fontWeight="500" fill={TINTA.texto}>
        Olyvia CRM
      </text>
      <text x="150" y="68" textAnchor="middle" fontSize="10.5" fill={TINTA.textoFraco}>
        clientes · orçamentos · compras · contratos
      </text>

      <rect x="420" y="28" width="300" height="62" rx="10" fill="#f8fafc" stroke={TINTA.cinza}
            strokeWidth="1.5" />
      <text x="570" y="50" textAnchor="middle" fontSize="12" fontWeight="500" fill={TINTA.texto}>
        Infraspeak
      </text>
      <text x="570" y="68" textAnchor="middle" fontSize="10.5" fill={TINTA.textoFraco}>
        ordens · equipamentos · checklists
      </text>

      {/* a ponte que não existe */}
      <line x1="300" y1="59" x2="420" y2="59" stroke={TINTA.vermelho} strokeWidth="1.5"
            strokeDasharray="5 4" />
      <circle cx="360" cy="59" r="11" fill={TINTA.vermelhoClaro} stroke={TINTA.vermelho}
              strokeWidth="1.5" />
      <path d="M 355 54 L 365 64 M 365 54 L 355 64" stroke={TINTA.vermelho} strokeWidth="1.8"
            strokeLinecap="round" />
      <text x="360" y="88" textAnchor="middle" fontSize="10" fill={TINTA.vermelho}>
        copiar à mão
      </text>

      <line x1="0" y1="112" x2="720" y2="112" stroke="#e2e8f0" strokeWidth="1" />

      <Rotulo x={0} y={140} cor={TINTA.brand} peso="600">
        DEPOIS · a mesma base de dados
      </Rotulo>

      <rect x="0" y="152" width="720" height="52" rx="10" fill={TINTA.brandClaro}
            stroke={TINTA.brand} strokeWidth="2" />
      <text x="16" y="174" fontSize="12" fontWeight="600" fill="#4c1d95">
        Olyvia
      </text>
      <text x="16" y="191" fontSize="10.5" fill={TINTA.textoFraco}>
        clientes · orçamentos · compras · contratos · ordens · equipamentos · checklists
      </text>
      <text x="704" y="182" textAnchor="end" fontSize="10.5" fill={TINTA.verde}>
        um orçamento aceite vira obra com um clique
      </text>
    </Quadro>
  );
}

/* ══════════════ 6. O que se faz sozinho, e o que é da pessoa ════════════ */

/**
 * Duas pistas: em cima o que a pessoa faz, em baixo o que o sistema faz a
 * seguir, sem se pedir.
 *
 * Vale a pena separá-las assim porque "abre sozinha" assusta com razão. Ver as
 * duas pistas lado a lado mostra o que é automático (o trabalho chato) e o que
 * continua a ser decisão de alguém — nada na pista de baixo salta uma regra.
 */
export function DiagramaAutomatico() {
  const id = "au";
  const pessoa = 46;
  const sistema = 152;

  return (
    <Quadro
      titulo="O que a pessoa faz, e o que o sistema faz sozinho a seguir"
      largura={720}
      altura={224}
      minWidth={620}
    >
      <Pontas id={id} />

      <Rotulo x={0} y={18} cor={TINTA.texto} peso="600" tamanho={11}>
        A PESSOA
      </Rotulo>
      <Rotulo x={0} y={124} cor={TINTA.brand} peso="600" tamanho={11}>
        O SISTEMA, SOZINHO
      </Rotulo>

      {/* A ordem preventiva nasce antes de haver pessoa nenhuma envolvida. */}
      <Caixa x={0} y={sistema} w={158} texto="Cria a ordem" sub="a data do plano chegou" tom="brand" />

      <Caixa x={178} y={pessoa} w={158} texto="Responde à 1.ª tarefa" sub="chegou ao local" />
      <Caixa x={178} y={sistema} w={158} texto="Inicia a ordem" sub="o cronómetro arranca" tom="brand" />
      <Seta id={id} de={[257, pessoa + 44]} para={[257, sistema - 4]} cor="brand" />

      <Caixa x={356} y={pessoa} w={178} texto="Marca não conforme" sub="encontrou uma avaria" tom="aviso" />
      <Caixa x={356} y={sistema} w={178} texto="Abre a reparação, e avisa" sub="fica POR APROVAR" tom="brand" />
      <Seta id={id} de={[445, pessoa + 44]} para={[445, sistema - 4]} cor="brand" />

      <Caixa x={554} y={pessoa} w={166} texto="Fecha a ordem" sub="o trabalho acabou" />
      <Caixa x={554} y={sistema} w={166} texto="Soma o custo real" sub="das sessões de trabalho" tom="brand" />
      <Seta id={id} de={[637, pessoa + 44]} para={[637, sistema - 4]} cor="brand" />

      <text x="0" y="212" fontSize="10.5" fill={TINTA.textoFraco}>
        Nada na pista de baixo salta uma regra: a reparação nasce por aprovar, e o arranque
        volta a verificar quem pode iniciar.
      </text>
    </Quadro>
  );
}

/* ═══════════════ 7. O que vem do CRM, e o que volta lá ══════════════════ */

/**
 * A pergunta que aparece sempre a seguir a "vive dentro do Olyvia": então o que
 * é que vai lá buscar?
 *
 * Uma seta grossa a entrar, uma fininha a sair. A assimetria é o ponto: o
 * módulo lê muito e escreve uma linha só.
 */
export function DiagramaDoCRM() {
  const id = "crm";
  const linhas = [
    "Clientes, moradas e contactos",
    "Pessoas, e o que cada uma pode",
    "Orçamentos aceites",
    "Catálogo de material e compras",
    "Férias, horários e feriados",
  ];

  return (
    <Quadro
      titulo="O que Operações vai buscar ao CRM, e a única coisa que lá escreve"
      largura={720}
      altura={236}
      minWidth={620}
    >
      <Pontas id={id} />

      {/* ── O CRM ── */}
      <rect x="0" y="24" width="292" height="164" rx="10" fill="#f8fafc"
            stroke={TINTA.cinza} strokeWidth="1.5" />
      <text x="14" y="46" fontSize="12" fontWeight="600" fill={TINTA.texto}>
        Olyvia CRM
      </text>
      {linhas.map((l, i) => (
        <g key={l}>
          <circle cx="20" cy={66 + i * 22} r="2.5" fill={TINTA.cinza} />
          <text x="30" y={70 + i * 22} fontSize="10.5" fill={TINTA.textoFraco}>
            {l}
          </text>
        </g>
      ))}

      {/* ── Operações ── */}
      <rect x="428" y="24" width="292" height="164" rx="10" fill={TINTA.brandClaro}
            stroke={TINTA.brand} strokeWidth="2" />
      <text x="442" y="46" fontSize="12" fontWeight="600" fill="#4c1d95">
        Operações
      </text>
      {[
        "27 tabelas próprias, todas ops_*",
        "Zero chaves estrangeiras para fora",
        "Não altera uma linha do CRM",
      ].map((l, i) => (
        <g key={l}>
          <circle cx="448" cy={70 + i * 22} r="2.5" fill={TINTA.brand} />
          <text x="458" y={74 + i * 22} fontSize="10.5" fill={TINTA.textoFraco}>
            {l}
          </text>
        </g>
      ))}

      {/* ── Lê: grosso ── */}
      <path d="M 296 84 L 420 84" fill="none" stroke={TINTA.brand} strokeWidth="6"
            markerEnd={`url(#${id}-brand)`} opacity="0.85" />
      <text x="358" y="72" textAnchor="middle" fontSize="11" fontWeight="600" fill="#4c1d95">
        lê
      </text>

      {/* ── Escreve: fininho, e no sentido contrário ── */}
      <path d="M 420 142 L 300 142" fill="none" stroke={TINTA.verde} strokeWidth="1.5"
            markerEnd={`url(#${id}-verde)`} />
      <text x="360" y="132" textAnchor="middle" fontSize="11" fontWeight="600" fill={TINTA.verde}>
        escreve
      </text>
      <text x="360" y="160" textAnchor="middle" fontSize="10" fill={TINTA.textoFraco}>
        uma linha no sino
      </text>

      <text x="0" y="212" fontSize="10.5" fill={TINTA.textoFraco}>
        A seta de ida é grossa e a de volta é fina de propósito: o módulo lê muito e escreve
        uma linha só — um aviso, na tabela de notificações que o CRM já tem.
      </text>
      <text x="0" y="228" fontSize="10.5" fill={TINTA.textoFraco}>
        A outra exceção é o armazenamento das fotos, num balde próprio chamado “operacoes”.
      </text>
    </Quadro>
  );
}
