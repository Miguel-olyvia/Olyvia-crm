import { Card } from "./ui";
import { AlertTriangle, Check, ExternalLink, X } from "./icons";

/**
 * O separador para quem vai a uma reunião vender isto.
 *
 * É diferente do "Porquê mudar", e a diferença importa. O "Porquê mudar" é a
 * prova recolhida da instância do Infraspeak: serve para uma decisão interna,
 * é técnico, e é feito de evidência. Este é o outro lado da mesa — o que se
 * diz a alguém que não conhece nem uma coisa nem outra, e que só quer saber o
 * que ganha e o que arrisca.
 *
 * Duas decisões ao escrever isto:
 *
 *  · **Vende-se pelas perguntas, não pelas funcionalidades.** "Agenda com
 *    mapa" não vende nada. "Onde está a minha equipa agora" vende. Uma lista
 *    de funcionalidades é a maneira mais rápida de perder uma reunião.
 *
 *  · **O que NÃO se promete está aqui dentro, escrito.** Não é modéstia: uma
 *    promessa que falha na primeira semana custa mais do que a venda valia, e
 *    quem vai à reunião tem de saber onde parar antes de chegar lá.
 */

/** A página que se abre em frente ao cliente. */
const PAGINA =
  "https://claude.ai/code/artifact/ed8b541e-9f00-487e-b27b-5152d7d0a65b";

export default function AjudaVender() {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          A frase com que se abre
        </p>
        <p className="mt-2 max-w-prose text-xl font-semibold leading-snug tracking-tight text-slate-900">
          &ldquo;O trabalho faz-se sempre. O que se perde é a prova.&rdquo;
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600">
          A equipa vai lá, resolve, tira uma foto e manda-a por WhatsApp. Três meses depois o
          cliente pergunta o que foi feito — e a resposta está numa conversa que ninguém
          consegue encontrar. Toda a gente do outro lado da mesa já viveu isto. É por aqui
          que se começa, e não por funcionalidades.
        </p>

        <a
          href={PAGINA}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
        >
          Abrir a página para mostrar
          <ExternalLink width={14} height={14} />
        </a>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Feita para projetar numa reunião ou enviar por email. Não tem dados de clientes
          nenhuns lá dentro — pode ir para fora sem ninguém rever.
        </p>
      </Card>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Vende-se pelas perguntas, não pelas funcionalidades
        </h2>
        <div className="space-y-3">
          {PERGUNTAS.map((p) => (
            <Card key={p.pergunta} className="p-4 sm:p-5">
              <h3 className="text-base font-semibold text-slate-900">
                &ldquo;{p.pergunta}&rdquo;
              </h3>
              <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">
                {p.resposta}
              </p>
              <p className="mt-2.5 border-t border-dashed border-slate-200 pt-2.5 text-sm leading-relaxed text-slate-500">
                <span className="font-medium text-slate-600">Hoje, sem isto:</span> {p.hoje}
              </p>
            </Card>
          ))}
        </div>
        <p className="mt-2 px-1 text-xs leading-relaxed text-slate-500">
          Uma lista de funcionalidades é a maneira mais rápida de perder uma reunião. Ninguém
          compra &ldquo;agenda com mapa&rdquo;; compra saber onde está a equipa.
        </p>
      </div>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          As três objeções, e o que responder
        </h2>
        <div className="space-y-3">
          {OBJECOES.map((o) => (
            <Card key={o.diz} className="p-4 sm:p-5">
              <p className="text-sm font-medium text-slate-500">Vão dizer:</p>
              <p className="mt-0.5 text-base font-semibold text-slate-900">
                &ldquo;{o.diz}&rdquo;
              </p>
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
                <Check width={14} height={14} className="mt-0.5 shrink-0 text-brand-600" />
                <span>{o.responde}</span>
              </p>
            </Card>
          ))}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">A demonstração, em meia hora</h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">
          A melhor demonstração não é um passeio pelos ecrãs — é <strong>uma obra real
          deles</strong>, do princípio ao fim. Cria-se antes da reunião, com o nome de um
          cliente que eles conheçam.
        </p>
        <ol className="mt-3 space-y-2.5">
          {DEMO.map((d, i) => (
            <li key={d.o} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
                {i + 1}
              </span>
              <span className="min-w-0 text-sm leading-relaxed text-slate-700">
                <strong className="font-medium text-slate-900">{d.o}</strong> — {d.porque}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3.5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-600">
          O momento que fecha a venda é o <strong>número 6</strong>. Toda a gente já viu
          software de manutenção; quase ninguém já viu quanto custou a obra ao fim de a
          fechar.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <AlertTriangle width={16} height={16} className="text-amber-600" />O que NÃO prometer
        </h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">
          Isto não é modéstia. Uma promessa que falha na primeira semana custa mais do que a
          venda valia — e quem vai à reunião tem de saber onde parar <em>antes</em> de lá
          chegar. Dizer o limite em voz alta compra credibilidade para tudo o resto.
        </p>
        <ul className="mt-3 space-y-2.5">
          {NAO_PROMETER.map((n) => (
            <li key={n.o} className="flex gap-2.5">
              <X width={15} height={15} className="mt-0.5 shrink-0 text-red-500" />
              <span className="min-w-0 text-sm leading-relaxed text-slate-700">
                <strong className="font-medium text-slate-900">{n.o}</strong> — {n.mas}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const PERGUNTAS = [
  {
    pergunta: "Esta obra deu lucro?",
    resposta:
      "O custo real de cada ordem: as horas cronometradas ao custo/hora de cada pessoa, mais o material e os serviços. Se veio de um orçamento, o previsto fica congelado ao lado do gasto, linha a linha.",
    hoje:
      "o orçamento está num sítio e a despesa noutro, e ninguém junta os dois. Sabe-se se a empresa deu lucro ao fim do ano; não se sabe qual obra é que o comeu.",
  },
  {
    pergunta: "Isto já deu problemas antes?",
    resposta:
      "Cada equipamento tem ficha própria, com tudo o que já se lhe fez e a evolução das leituras. Uma etiqueta QR colada nele abre essa ficha com a câmara de qualquer telemóvel, sem instalar nada.",
    hoje:
      "está na cabeça de quem lá foi da última vez. Se essa pessoa sair da empresa, sai com ela.",
  },
  {
    pergunta: "Onde está a minha equipa agora?",
    resposta:
      "A agenda por dia, semana e mês, com a carga em horas de cada pessoa, as férias e os feriados. E um mapa com as visitas da semana, que mostra quem está a atravessar a cidade em vão.",
    hoje: "um telefonema por pessoa.",
  },
  {
    pergunta: "O cliente recebeu prova?",
    resposta:
      "Relatório com o que se fez, quando, por quem, as leituras, as fotos e a assinatura recolhida no local. Sai por email sozinho quando o escritório confirma a ordem — ou à mão, quando o cliente liga a pedir.",
    hoje: "alguém tem de se lembrar, e escrevê-lo à noite.",
  },
];

const OBJECOES = [
  {
    diz: "E o que é que parte no dia em que ligarmos isto?",
    responde:
      "Nada. O módulo vive em tabelas próprias e não toca no que já existe — há verificações automáticas que falham se alguém tentar. É o mesmo início de sessão, os mesmos clientes, a mesma agenda. E começa vazio: o envio de emails ao cliente vem desligado, para ninguém escrever a um cliente por engano no primeiro dia.",
  },
  {
    diz: "Os meus técnicos não vão usar isto.",
    responde:
      "É a objeção certa, e é onde se gastou o cuidado todo. Uma resposta é um toque, não é escolher-e-gravar. O ecrã diz o que vai acontecer antes de acontecer. Sem rede continua a funcionar, e sai tudo quando a rede volta. E quando não se pode fazer alguma coisa, diz o passo em falta em vez de dizer que não. Vale a pena mostrar esta parte no telemóvel, não no computador.",
  },
  {
    diz: "Já temos um sistema.",
    responde:
      "A pergunta a devolver não é qual é melhor. É: consegue responder às quatro perguntas de cima com o que tem hoje, em dois minutos, à frente de mim? Se o custo de mão de obra der zero em todas as obras, o sistema existe mas não está a medir nada.",
  },
];

const DEMO = [
  { o: "Abre um pedido", porque: "com o nome de um cliente que eles conheçam. Trinta segundos." },
  { o: "Marca na agenda", porque: "para mostrar as férias e os choques de horário a aparecerem sozinhos." },
  { o: "Passa para o telemóvel", porque: "é aqui que se ganha ou perde a reunião. Responder a uma tarefa com um toque." },
  { o: "Falha uma leitura de propósito", porque: "e a ordem de reparação nasce à frente deles, já com o problema escrito." },
  { o: "Fecha e assina", porque: "com o dedo, no ecrã. É a prova que hoje lhes falta." },
  { o: "Mostra o custo", porque: "as horas, o material, e o orçamentado ao lado. É o momento que fecha a venda." },
  { o: "Manda o relatório", porque: "para o email deles, ali. Deixa-os receber a coisa na caixa de entrada durante a reunião." },
];

const NAO_PROMETER = [
  {
    o: "Portal do cliente",
    mas:
      "o cliente recebe relatórios por email; não entra na plataforma nem abre pedidos sozinho. Se isso for condição do negócio, é um projeto à parte e diz-se isso.",
  },
  {
    o: "Abrir a aplicação sem rede",
    mas:
      "responder a tarefas e a leituras sem rede já funciona, e sai tudo quando a rede volta. Mas a aplicação tem de ter aberto com rede pelo menos uma vez nesse dia. Prometer 'funciona offline' sem esta distinção é prometer o que não há.",
  },
  {
    o: "Fotos sem rede",
    mas: "uma foto não cabe na mesma fila que uma resposta de texto. Ainda não está feito.",
  },
  {
    o: "Stock, compras e vendas",
    mas:
      "não existem, e é por decisão. Se a operação deles depender de gestão de armazém, isso continua onde já está.",
  },
  {
    o: "Ligação ao WhatsApp",
    mas:
      "a conversa da ordem é entre colegas, dentro da ordem. Não vai buscar nem manda nada ao WhatsApp.",
  },
];
