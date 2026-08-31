import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Card, cx } from "../components/ui";
import { AlertTriangle, Check, ChevronDown, ChevronRight, X } from "../components/icons";
import {
  DiagramaAutomatico,
  DiagramaCicloDaOrdem,
  DiagramaDoCRM,
  DiagramaNaoConformidade,
  DiagramaOndeVive,
  DiagramaOrigens,
  DiagramaTempoDeTrabalho,
} from "../components/diagramas";

/**
 * Esta página é lida por duas pessoas muito diferentes, e é por isso que tem
 * três portas em vez de uma.
 *
 *  · **Quem decide** — o dono da empresa. Não vai clicar em nada aqui dentro.
 *    Quer saber o que a empresa ganha em sair do Infraspeak, e o que arrisca.
 *    Fala-se-lhe de dinheiro, de contratos e de risco, com a prova ao lado.
 *
 *  · **Quem usa** — o gestor e o técnico. Querem saber onde é que se carrega,
 *    e porque é que o botão antigo mudou de sítio. Fala-se-lhes de passos.
 *
 * Uma regra ao escrever isto: cada afirmação traz a EVIDÊNCIA. Não "o
 * Infraspeak é confuso", mas "existe em produção um plano preventivo chamado
 * PMP CORRETIVA". A evidência é o que torna a mudança discutível em vez de uma
 * questão de gosto — e o que permite a alguém dizer que estamos errados.
 *
 * Os desenhos vivem em `components/diagramas.tsx`. Um fluxograma explica em
 * três segundos o que um parágrafo explica em três leituras, e isto tem de ser
 * lido por quem não tem três leituras para dar.
 */

type Separador = "porque" | "funciona" | "usar";

/** Os nomes antigos continuam a funcionar — houve links partilhados com eles. */
const ANTIGOS: Record<string, Separador> = { mudou: "porque", tutorial: "usar" };

export default function Ajuda() {
  const [params, setParams] = useSearchParams();
  const bruto = params.get("ver") ?? "";
  const ver: Separador =
    bruto === "porque" || bruto === "funciona" || bruto === "usar"
      ? bruto
      : (ANTIGOS[bruto] ?? "porque");

  const trocar = (s: Separador) => {
    const p = new URLSearchParams(params);
    p.set("ver", s);
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Operações, explicado
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          O que a empresa ganha, como funciona por dentro, e como se faz cada coisa.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Aba ligado={ver === "porque"} onClick={() => trocar("porque")}>
          Porquê mudar
          <span className="ml-1.5 hidden text-[11px] font-normal opacity-70 sm:inline">
            para quem decide
          </span>
        </Aba>
        <Aba ligado={ver === "funciona"} onClick={() => trocar("funciona")}>
          Como funciona
        </Aba>
        <Aba ligado={ver === "usar"} onClick={() => trocar("usar")}>
          Como se usa
          <span className="ml-1.5 hidden text-[11px] font-normal opacity-70 sm:inline">
            passo a passo
          </span>
        </Aba>
      </div>

      {ver === "porque" && <PorqueMudar />}
      {ver === "funciona" && <ComoFunciona />}
      {ver === "usar" && <Tutorial />}
    </div>
  );
}

/* ══════════════════════════ 1 · Porquê mudar ════════════════════════════ */

function PorqueMudar() {
  return (
    <div className="space-y-4">
      {/* A abertura. Isto é lido por quem tem trinta segundos, e a versão
          anterior eram dois parágrafos — que ninguém lia.
          Um número grande, quatro trocas, uma linha. */}
      <Card className="p-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          O custo de mão de obra registado no Infraspeak
        </p>
        {/* Figuras proporcionais, não tabulares: `tabular-nums` dá a cada
            algarismo a largura de um zero, e a este tamanho o número sai frouxo. */}
        <p className="mt-1 text-5xl font-semibold tracking-tight text-slate-900">0,00 €</p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-slate-600">
          Em <strong className="font-medium text-slate-800">todas</strong> as ordens da vossa
          instância. Não é avaria: o campo existe e nunca foi preenchido — e por isso
          ninguém sabe quanto custa uma obra.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {TROCAS.map((t) => (
            <Troca key={t.o} {...t} />
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Cada número aqui saiu da vossa instância real. O que se segue explica cada um,
          com a prova ao lado.
        </p>
      </Card>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Quatro perguntas que o Infraspeak não responde
        </h2>
        <div className="space-y-3">
          {PERGUNTAS.map((p) => (
            <Pergunta key={p.pergunta} {...p} />
          ))}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">
          O que acontece quando um técnico encontra um problema
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          É a diferença que mais dinheiro vale. O trabalho do técnico é o mesmo nas duas
          linhas — o que muda é o que o sistema faz com o que ele encontrou.
        </p>
        <div className="mt-3">
          <DiagramaNaoConformidade />
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-medium">A prova:</strong> o histórico dos vossos
            equipamentos está cheio de relatos de técnicos — portões avariados, geradores que
            não arrancam — que nunca viraram ordem nenhuma. A funcionalidade existe no
            Infraspeak: na opção &ldquo;Não Conforme&rdquo; do extintor, a caixa que abriria a
            reparação está <strong>desligada</strong>.
          </span>
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">
          Quanto custou, de verdade, esta obra
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          O Infraspeak mede o tempo de uma ordem como fecho menos início. Uma ordem aberta em
          janeiro e fechada em maio conta noites, fins de semana e férias como trabalho.
        </p>
        <div className="mt-3">
          <DiagramaTempoDeTrabalho />
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-medium">A prova:</strong> há uma ordem na vossa instância
            com <strong className="font-mono">5303:05:34</strong> de tempo de execução. E o
            campo &ldquo;custo por hora&rdquo; existe na ficha de cada utilizador, mas nunca foi
            preenchido — por isso o custo de mão de obra é <strong>0,00 €</strong> em todas as
            ordens.
          </span>
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Onde vive a informação</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          A razão de fundo pela qual ninguém sabe se uma obra deu lucro: o orçamento está num
          sistema e o custo está noutro.
        </p>
        <div className="mt-3">
          <DiagramaOndeVive />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          As duas metades já existiam. As linhas de orçamento do CRM já guardavam o custo de
          material e de mão de obra; ninguém as tinha ligado ao que se gasta a sério. Um
          orçamento aceite passa a virar obra com um clique, com o previsto congelado ao lado
          do gasto.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O resultado, em números</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">&nbsp;</th>
                <th className="pb-2 text-center font-medium">Infraspeak</th>
                <th className="pb-2 text-center font-medium">Olyvia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ["Conceitos que o utilizador tem de perceber", "13", "7"],
                ["Entradas de menu", "13", "8"],
                ["Ecrãs de “trabalho a fazer”", "3", "1"],
                ["Catálogos de estados", "2", "1"],
                ["Níveis fixos de hierarquia física", "4", "os que forem precisos"],
                ["Motores de relatório", "2", "1"],
                ["Sistemas onde a informação vive", "2", "1"],
              ].map(([o, a, b]) => (
                <tr key={o}>
                  <td className="py-2 pr-3 text-slate-700">{o}</td>
                  <td className="py-2 text-center font-mono tabular text-slate-500">{a}</td>
                  <td className="py-2 text-center font-mono tabular font-semibold text-brand">
                    {b}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Menos conceitos não é uma questão de estética. Cada conceito a mais é uma decisão que
          alguém tem de tomar em cima de um telhado, com o telemóvel numa mão.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O que NÃO muda</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Porque a pergunta a seguir a &ldquo;o que ganhamos&rdquo; é sempre &ldquo;o que
          arriscamos&rdquo;.
        </p>
        <ul className="mt-3 space-y-2">
          {NAO_MUDA.map((x) => (
            <li key={x.o} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 shrink-0 text-emerald-600">
                <Check width={14} height={14} />
              </span>
              <span>
                <strong className="font-medium text-slate-800">{x.o}</strong>
                <span className="text-slate-600"> — {x.detalhe}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          As mudanças, uma a uma
        </h2>
        <p className="mb-3 px-1 text-sm text-slate-600">
          Catorze diferenças, cada uma com o que o Infraspeak faz, o que passa a acontecer, e a
          prova. Carrega para abrir.
        </p>
        <div className="space-y-3">
          {DIFERENCAS.map((d, i) => (
            <Diferenca key={d.titulo} numero={i + 1} {...d} />
          ))}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O que ainda não está feito</h2>
        <p className="mt-2 text-sm text-slate-600">
          Para não haver surpresas. Nada disto impede a equipa de trabalhar; são coisas que o
          Infraspeak tem e nós ainda não.
        </p>
        <ul className="mt-3 space-y-2">
          {POR_FAZER.map((x) => (
            <li key={x.o} className="flex items-start gap-2.5 text-sm">
              <span className="mt-1 shrink-0 text-slate-300">
                <X width={13} height={13} />
              </span>
              <span>
                <strong className="font-medium text-slate-800">{x.o}</strong>
                <span className="text-slate-600"> — {x.porque}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/**
 * Uma troca, lida num relance: o que o Infraspeak dá, o que o Olyvia dá.
 *
 * A cor vive num quadrado pequeno ao lado do nome, e não no texto. O texto usa
 * sempre tinta normal — um valor pintado de vermelho lê-se como um alarme, e
 * estes não são alarmes, são factos. O nome ao lado do quadrado é que carrega
 * a identidade, e por isso isto continua a ler-se sem cor nenhuma.
 */
function Troca({ o, antes, depois }: { o: string; antes: string; depois: string }) {
  return (
    <div className="rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/70">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{o}</p>
      <div className="mt-2 flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            <span className="h-2 w-2 shrink-0 rounded-[3px] bg-[#b91c1c]" aria-hidden="true" />
            Infraspeak
          </p>
          <p className="mt-0.5 text-sm leading-snug text-slate-500">{antes}</p>
        </div>
        <ChevronRight
          width={16}
          height={16}
          className="mt-4 shrink-0 self-start text-slate-300"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            <span className="h-2 w-2 shrink-0 rounded-[3px] bg-[#5b21b6]" aria-hidden="true" />
            Olyvia
          </p>
          <p className="mt-0.5 text-sm font-medium leading-snug text-slate-900">{depois}</p>
        </div>
      </div>
    </div>
  );
}

const TROCAS = [
  {
    o: "Uma avaria encontrada",
    antes: "fica escrita no histórico, e morre lá",
    depois: "abre a reparação sozinha",
  },
  {
    o: "O tempo de uma ordem",
    antes: "5303 h — fecho menos início",
    depois: "6 h 20 de trabalho a sério",
  },
  {
    o: "A manutenção cumprida",
    antes: "conta-se à mão, ordem a ordem",
    depois: "uma percentagem por cliente",
  },
  {
    o: "Onde vive a informação",
    antes: "dois sistemas que não se falam",
    depois: "a mesma base de dados",
  },
] as const;

function Pergunta({
  pergunta,
  infraspeak,
  agora,
  prova,
}: {
  pergunta: string;
  infraspeak: string;
  agora: string;
  prova?: string;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-slate-900">{pergunta}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-red-50/70 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-red-700">
            Infraspeak
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{infraspeak}</p>
        </div>
        <div className="rounded-lg bg-brand-50 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-800">
            Com o Olyvia
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{agora}</p>
        </div>
      </div>
      {prova && (
        <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
          <strong className="font-medium text-slate-600">A prova:</strong> {prova}
        </p>
      )}
    </Card>
  );
}

const PERGUNTAS = [
  {
    pergunta: "Esta obra deu lucro?",
    infraspeak: "Ninguém sabe. O orçamento vive no comercial, o que se gastou vive na manutenção, e nada os liga. O custo de mão de obra é zero em todas as ordens.",
    agora:
      "O orçamento aceite vira obra com o custo previsto congelado ao lado. No fim: previsto, gasto, e o desvio em euros e em percentagem, linha a linha.",
    prova:
      "as linhas de orçamento do CRM já guardavam custo de material e de mão de obra. A informação existia; faltava juntá-la.",
  },
  {
    pergunta: "A manutenção deste cliente foi feita?",
    infraspeak: "Conta-se à mão, ordem a ordem, quando o cliente pergunta ou quando o contrato está para renovar.",
    agora:
      "Uma percentagem por cliente e por mês, com a lista das que ficaram por fazer. É o indicador pelo qual um contrato se renova.",
  },
  {
    pergunta: "Aquela avaria que o técnico reportou já foi resolvida?",
    infraspeak: "O relato fica escrito no histórico do equipamento e morre lá. Alguém tem de se lembrar dele.",
    agora:
      "Uma tarefa não conforme abre uma ordem de reparação sozinha, já com o cliente, o sítio, o equipamento e o que o técnico escreveu. E as duas ficam ligadas.",
  },
  {
    pergunta: "Este equipamento compensa reparar outra vez, ou substituir?",
    infraspeak: "Decide-se de cabeça. As leituras estão guardadas, mas espalhadas por ordens, sem ninguém as somar.",
    agora:
      "A ficha do equipamento mostra tudo o que já se lhe fez e a evolução das leituras. Três avarias em doze meses levantam a pergunta sozinhas.",
  },
] as const;

const NAO_MUDA = [
  {
    o: "A mesma base de dados",
    detalhe:
      "os clientes, os utilizadores e as permissões são os do Olyvia. Não há sincronizações nem contas a duplicar.",
  },
  {
    o: "O CRM fica intocado",
    detalhe:
      "o módulo só acrescenta. Não altera uma tabela do CRM, e há testes automáticos que falham se alguém tentar.",
  },
  {
    o: "Quem entra é quem já entrava",
    detalhe:
      "as permissões são as do Olyvia. Uma pessoa sem acesso a Operações não vê a área sequer.",
  },
  {
    o: "Os dados são vossos",
    detalhe: "estão na vossa base de dados, e saem dela quando quiserem, sem pedir a ninguém.",
  },
  {
    o: "O Infraspeak pode continuar ligado",
    detalhe:
      "nada aqui apaga nada de lá. Dá para correr os dois em paralelo durante o tempo que for preciso.",
  },
] as const;

/* ═════════════════════════ 2 · Como funciona ════════════════════════════ */

function ComoFunciona() {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">De onde vem uma ordem</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Três maneiras de nascer, um objeto só. É a simplificação que mais se nota no
          dia-a-dia.
        </p>
        <div className="mt-3">
          <DiagramaOrigens />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          No Infraspeak, o trabalho preventivo é uma &ldquo;Ocorrência&rdquo; e o corretivo é um
          &ldquo;Pedido&rdquo;: dois ecrãs, dois catálogos de estados, dois catálogos de motivos
          de pausa, dois relatórios — para guardar exatamente os mesmos campos.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O ciclo de vida de uma ordem</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Sete estados, e as únicas passagens possíveis entre eles.
        </p>
        <div className="mt-3">
          <DiagramaCicloDaOrdem />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          Isto não é uma sugestão do ecrã. A regra está gravada na base de dados: uma tentativa
          de mudar o estado por fora é recusada, mesmo vinda de alguém que falasse diretamente
          com o servidor. É o que faz de um registo uma prova, e não uma opinião.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O que acontece sozinho</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          “Abre sozinha” assusta com razão, por isso vale a pena ver as duas pistas lado a
          lado: o que continua a ser decisão de alguém, e o que o sistema faz a seguir.
        </p>
        <div className="mt-3">
          <DiagramaAutomatico />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">O que se faz sozinho</th>
                <th className="pb-2 font-medium">Quando</th>
                <th className="pb-2 font-medium">O que NÃO faz</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {AUTOMATICO.map(([o, quando, nao]) => (
                <tr key={o}>
                  <td className="py-2 pr-4 font-medium text-slate-800">{o}</td>
                  <td className="py-2 pr-4 text-slate-600">{quando}</td>
                  <td className="py-2 text-slate-500">{nao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <Check width={14} height={14} className="mt-0.5 shrink-0" />
          <span>
            A reparação automática nasce sempre <strong>por aprovar</strong>. Trabalho novo que
            aparece do nada passa por alguém antes de entrar na fila — e essa pessoa recebe o
            aviso no sino no mesmo minuto.
          </span>
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O que vem do CRM</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          A pergunta que aparece sempre a seguir a “vive dentro do Olyvia”: então o que é que
          vai lá buscar, e o que é que mexe?
        </p>
        <div className="mt-3">
          <DiagramaDoCRM />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">O que vem de lá</th>
                <th className="pb-2 font-medium">Para quê</th>
                <th className="pb-2 text-center font-medium">Escreve?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DO_CRM.map(([o, paraque, escreve]) => (
                <tr key={o}>
                  <td className="py-2 pr-4 font-medium text-slate-800">{o}</td>
                  <td className="py-2 pr-4 text-slate-600">{paraque}</td>
                  <td className="py-2 text-center text-xs text-slate-500">{escreve}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-medium">Privacidade:</strong> o CRM guarda o motivo de uma
            ausência, e isso pode ser uma baixa médica. Quem marca uma visita só vê as{" "}
            <strong>datas</strong> — o motivo nunca sai de lá. Há um teste que falha se sair.
          </span>
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">
          Porque é que ninguém pode falsificar um registo
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Três fechaduras diferentes, uma a seguir à outra. Uma sozinha não chegava.
        </p>
        <ol className="mt-3 space-y-2.5">
          {CAMADAS.map((c, i) => (
            <li key={c.titulo} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[11px] font-semibold text-brand-800">
                {i + 1}
              </span>
              <span>
                <strong className="font-medium text-slate-800">{c.titulo}</strong>
                <span className="text-slate-600"> — {c.texto}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Na prática: quem responde a uma tarefa fica registado com nome e hora, e o valor
          anterior fica guardado ao lado do novo. Ninguém apaga, ninguém reescreve.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Quem pode fazer o quê</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">&nbsp;</th>
                <th className="pb-2 text-center font-medium">Técnico</th>
                <th className="pb-2 text-center font-medium">Gestor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ["Ver as ordens em que está", true, true],
                ["Responder a tarefas e medições", true, true],
                ["Tirar fotos", true, true],
                ["Abrir uma ordem", "fica por aprovar", true],
                ["Atribuir e marcar datas", false, true],
                ["Ver custos", false, "com permissão"],
                ["Ver análises e PMP", false, true],
                ["Criar locais, checklists, equipa", false, true],
              ].map(([o, t, g]) => (
                <tr key={String(o)}>
                  <td className="py-2 pr-3 text-slate-700">{o}</td>
                  <td className="py-2 text-center">
                    <Marca v={t} />
                  </td>
                  <td className="py-2 text-center">
                    <Marca v={g} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Um técnico nem vê a entrada de Análises no menu. Não é só permissão: no telemóvel a
          navegação é uma barra fixa, e cada entrada a mais rouba espaço às outras.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Quem é avisado, e quando</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Os avisos aparecem no <strong>sino do Olyvia</strong>, o mesmo que a equipa já abre
          todos os dias. Não há um segundo sino para ninguém se lembrar de espreitar.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Quando</th>
                <th className="pb-2 font-medium">Quem recebe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {AVISOS.map(([quando, quem]) => (
                <tr key={quando}>
                  <td className="py-2 pr-4 text-slate-700">{quando}</td>
                  <td className="py-2 text-slate-500">{quem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Os três últimos são os que hoje se perdem em silêncio: não acontece nada que os
          denuncie, só o relógio a passar. O sistema olha para o relógio de hora a hora.
        </p>
      </Card>
    </div>
  );
}

const AUTOMATICO: readonly (readonly [string, string, string])[] = [
  [
    "Nascem as ordens preventivas",
    "todos os dias, 120 dias à frente",
    "não inventa datas — segue a regra do plano",
  ],
  [
    "Nasce uma reparação",
    "quando uma tarefa fica não conforme",
    "não entra na fila: fica por aprovar",
  ],
  [
    "A ordem inicia-se",
    "à primeira resposta do técnico",
    "não salta a verificação de quem pode iniciar",
  ],
  [
    "A tarefa acerta-se",
    "quando a última medição entra",
    "não decide por ti — o veredicto sai dos limites",
  ],
  [
    "Soma-se o custo de mão de obra",
    "ao fechar cada sessão de trabalho",
    "não conta noites nem fins de semana",
  ],
  [
    "Avisa de atrasos e pausas expiradas",
    "de hora a hora",
    "não repete enquanto o primeiro estiver por ler",
  ],
] as const;

const DO_CRM: readonly (readonly [string, string, string])[] = [
  ["Clientes, moradas e contactos", "abrir uma ordem sem escrever a morada à mão", "não"],
  ["Pessoas e permissões", "quem entra, e o que cada um pode fazer", "não"],
  ["Orçamentos aceites", "um clique transforma-o em obra", "não"],
  ["Catálogo de material", "lançar custos sem inventar preços", "não"],
  ["Compras e faturas de fornecedor", "o material que se comprou para aquela obra", "não"],
  ["Férias, horários e feriados", "avisar antes de marcar uma visita a quem não está", "não"],
  ["Notificações (o sino)", "o aviso chega onde a equipa já olha", "✓ uma linha"],
  ["Armazenamento de ficheiros", "as fotos, num balde próprio", "✓ balde próprio"],
] as const;

const CAMADAS = [
  {
    titulo: "Quem chega à linha",
    texto:
      "a base de dados só devolve as ordens dos clientes a que a pessoa tem acesso. Não é o ecrã a esconder: a linha não sai da base.",
  },
  {
    titulo: "Como se escreve",
    texto:
      "nenhuma escrita é direta. Tudo passa por uma operação com nome — iniciar, responder, fechar — que volta a verificar quem é a pessoa e se aquilo é permitido naquele momento.",
  },
  {
    titulo: "A fechadura de trás",
    texto:
      "e se alguém tentar escrever por fora, um guarda na própria tabela recusa. Foi feito de propósito para não haver caminho nenhum sem passar pelas regras.",
  },
] as const;

const AVISOS: readonly (readonly [string, string])[] = [
  ["Uma ordem passa a ser tua", "quem a recebe"],
  ["Uma não conformidade gerou trabalho novo", "quem coordena"],
  ["Uma ordem passou da hora e não começou", "o responsável, ou quem coordena"],
  ["Uma pausa expirou e ninguém retomou", "o responsável e quem coordena"],
  ["Um plano preventivo falhou a gerar ordens", "quem coordena"],
] as const;

/* ═══════════════════ Peça comum: uma diferença ══════════════════════════ */

function Diferenca({
  numero,
  titulo,
  infraspeak,
  olyvia,
  evidencia,
  porque,
  feito,
}: {
  numero: number;
  titulo: string;
  infraspeak: string;
  olyvia: string;
  evidencia?: string;
  porque: string;
  feito: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50"
        aria-expanded={aberto}
      >
        <span className="mt-0.5 shrink-0 font-mono text-xs tabular text-slate-300">
          {String(numero).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{titulo}</span>
            {feito ? (
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                <Check width={11} height={11} /> feito
              </Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-500 ring-slate-200">por fazer</Badge>
            )}
          </span>
          <span className="mt-1 block text-sm text-slate-600">{porque}</span>
        </span>
        <span className="mt-0.5 shrink-0 text-slate-400">
          {aberto ? <ChevronDown width={16} height={16} /> : <ChevronRight width={16} height={16} />}
        </span>
      </button>

      {aberto && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4 pl-11">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">No Infraspeak</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{infraspeak}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-brand">Aqui</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{olyvia}</p>
            </div>
          </div>

          {evidencia && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-medium">A prova:</strong> {evidencia}
              </span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

const DIFERENCAS = [
  {
    titulo: "Uma ordem de trabalho, não duas",
    porque: "Preventiva e corretiva eram o mesmo objeto com dois nomes.",
    infraspeak:
      "“Ocorrência” para o preventivo e “Pedido” para o corretivo. Dois ecrãs, dois catálogos de estados, dois catálogos de motivos de pausa, dois relatórios — para guardar exatamente os mesmos campos.",
    olyvia:
      "Uma ordem só, com um campo que diz de onde veio: preventiva, corretiva ou obra. Uma lista, um conjunto de estados, um relatório.",
    evidencia:
      "existe na instância um plano PREVENTIVO chamado “PMP CORRETIVA — INPOST AVEIRO”. Alguém precisou de escrever no nome aquilo que o modelo não deixava dizer.",
    feito: true,
  },
  {
    titulo: "A “intervenção” desapareceu",
    porque: "Quatro níveis passaram a três, sem se perder nada.",
    infraspeak:
      "Ocorrência → Ativo → Intervenção → Tarefa. A “intervenção” não é nada do mundo real: é só a checklist aplicada àquele equipamento naquela ordem.",
    olyvia:
      "Ordem → Equipamento → Tarefa. O alvo da ordem é a intervenção. Um nível a menos para aprender e para clicar.",
    feito: true,
  },
  {
    titulo: "O sítio é uma árvore, não quatro caixas fixas",
    porque: "O mesmo modelo serve um prédio de escritórios e um apartamento.",
    infraspeak:
      "Cliente → Edifício → Local → Ativo, sempre. Faz sentido em manutenção de edifícios; não faz nenhum numa remodelação de casa de banho.",
    olyvia:
      "Um local pode estar dentro de outro, tantas vezes quantas fizerem falta. Duas para uma obra num apartamento, quatro para uma torre com pisos e garagens.",
    evidencia:
      "há centenas de “edifícios” na instância que são apartamentos de clientes particulares. O conceito já tinha degenerado em “o sítio onde vamos trabalhar”.",
    feito: true,
  },
  {
    titulo: "O equipamento é opcional",
    porque: "Nem todo o trabalho é a uma máquina.",
    infraspeak:
      "A ordem quer um ativo. Para limpar um piso, alguém teve de inventar um equipamento chamado “Piso”.",
    olyvia:
      "Uma ordem pode apontar só ao sítio. Sem inventar equipamentos que não existem.",
    evidencia:
      "existem ativos na instância cuja categoria é literalmente “BM24 PISO”. E o próprio Infraspeak teve de criar um conceito à parte, “Manutenção em Locais”, para o mesmo efeito.",
    feito: true,
  },
  {
    titulo: "Três gavetas, em vez de um caixote",
    porque: "Taxonomia, procedimento e contrato mudam em alturas diferentes.",
    infraspeak:
      "“Definições › Manutenções” é uma árvore onde cabe tudo: tipos de equipamento, checklists por cliente, e até pastas comerciais.",
    olyvia:
      "Categoria de equipamento (quase nunca muda), checklist (muda quando o procedimento muda) e plano (muda quando o contrato muda). Cada uma no seu sítio.",
    evidencia:
      "na mesma árvore de manutenções existem entradas como “C_FICHA DE NOVOS CLIENTES — Comercial”. O caixote acabou por levar coisas que nada têm a ver com manutenção.",
    feito: true,
  },
  {
    titulo: "A checklist é versionada",
    porque: "Corrigir um procedimento hoje não pode reescrever o ano passado.",
    infraspeak:
      "Alterar uma checklist muda retroativamente todas as ordens antigas. O histórico passa a dizer que se fez uma coisa que não se fez.",
    olyvia:
      "Publicar congela. Editar uma checklist publicada cria a versão seguinte; as ordens antigas continuam a apontar para a versão com que foram feitas.",
    feito: true,
  },
  {
    titulo: "O tempo de mão de obra existe",
    porque: "É a correção mais barata e a de maior retorno de todo o módulo.",
    infraspeak:
      "Há “tempo de execução”, que é fecho menos início — e por isso dá coisas como 5303 horas numa ordem que ficou aberta cinco meses. O tempo REAL de trabalho não existe em lado nenhum.",
    olyvia:
      "Sessões de trabalho: quem começou, quando, quando parou. O custo de mão de obra é a soma das sessões vezes o custo/hora de cada pessoa.",
    evidencia:
      "o campo “custo por hora” já existe na ficha de utilizador do Infraspeak, e nunca é preenchido. Resultado: o custo de mão de obra é 0,00 € em TODAS as ordens da instância.",
    feito: true,
  },
  {
    titulo: "Uma não conformidade gera trabalho",
    porque: "É o ciclo que no Infraspeak não fecha.",
    infraspeak:
      "Marca-se uma tarefa como não conforme e não acontece nada. O relato fica no histórico do equipamento, e morre lá.",
    olyvia:
      "Uma tarefa não conforme abre uma ordem corretiva sozinha, já com o cliente, o sítio, o equipamento, o valor lido e o que o técnico escreveu. E as duas ficam ligadas.",
    evidencia:
      "o histórico dos ativos está cheio de relatos escritos por técnicos — portões avariados, geradores que não arrancam — que nunca viraram ordem nenhuma. A informação existia; faltava o mecanismo. Na opção “Não Conforme” do extintor, a caixa que abriria a corretiva está desligada.",
    feito: true,
  },
  {
    titulo: "Ninguém tem de se lembrar sozinho",
    porque: "As três falhas que se perdiam em silêncio passam a avisar.",
    infraspeak:
      "Não há avisos. Um pedido fica parado até alguém abrir a aplicação e reparar nele. Uma ordem que passou da data, ou uma pausa que expirou, não denunciam nada — não acontece nada, e é isso o problema.",
    olyvia:
      "Cinco avisos no sino do Olyvia, o mesmo que a equipa já usa: ordem atribuída, reparação à espera de aprovação, ordem atrasada, pausa expirada, plano que falhou. O link leva direito à ordem.",
    feito: true,
  },
  {
    titulo: "A recorrência guarda a regra, não as ocorrências",
    porque: "Milhares de linhas futuras afogam o que é para esta semana.",
    infraspeak:
      "Gera ocorrências até 2033. Alterar um plano obriga a mexer em centenas de linhas já criadas.",
    olyvia:
      "Guarda-se a regra e materializa-se uma janela de 120 dias. Alterar o plano só afeta o que ainda não começou.",
    feito: true,
  },
  {
    titulo: "Códigos que se dizem ao telefone",
    porque: "Um código serve para uma pessoa o dizer a outra.",
    infraspeak: "PMP.3437940.163323715",
    olyvia: "OT-2026-00842. Dizível, colável num email, pesquisável.",
    feito: true,
  },
  {
    titulo: "O aviso vem antes de gravar",
    porque: "Descobrir o engano depois já criou trabalho que ninguém pediu.",
    infraspeak:
      "Escreve-se um valor, grava-se, e só então se descobre que ficou não conforme.",
    olyvia:
      "Escrever 8 numa gama de 10–15 mostra logo “fora dos limites — vai ficar não conforme”. Uma opção que abre uma ordem corretiva diz isso no próprio botão.",
    feito: true,
  },
  {
    titulo: "Orçamentado contra gasto",
    porque: "É a pergunta que a empresa não conseguia responder.",
    infraspeak:
      "O orçamento vive no comercial, o custo vive na manutenção, e nada os liga. Ninguém sabe se uma obra deu lucro.",
    olyvia:
      "Um orçamento aceite vira obra com os custos previstos congelados ao lado. No fim: previsto, gasto, e o desvio em euros e em percentagem.",
    evidencia:
      "as duas metades já existiam. As linhas de orçamento do CRM já guardavam custo de material e de mão de obra por linha; ninguém as tinha ligado ao que se gasta.",
    feito: true,
  },
  {
    titulo: "O histórico do equipamento responde a uma pergunta",
    porque: "“Este extintor tem dado problemas?” decide-se com dados, não de cabeça.",
    infraspeak:
      "As leituras ficam guardadas dentro de cada ordem. Para ver a evolução de um contador ao longo do ano, abre-se ordem a ordem.",
    olyvia:
      "A ficha do equipamento junta tudo: as visitas, as avarias, e cada medição desenhada ao longo do tempo. Três avarias em doze meses levantam a pergunta sozinhas.",
    feito: true,
  },
  {
    titulo: "A manutenção cumprida é um número",
    porque: "É por ele que um contrato de manutenção se renova.",
    infraspeak:
      "Há exportações por edifício, mas ninguém soma. Quando o cliente pergunta, conta-se à mão.",
    olyvia:
      "PMP por cliente e por mês, com a percentagem feita a horas separada da percentagem feita. E a lista das que ficaram por fazer, que é a pergunta a seguir.",
    feito: true,
  },
  {
    titulo: "A agenda sabe quem está de férias",
    porque: "Marcar uma visita a quem não está é descobrir na véspera.",
    infraspeak:
      "O calendário não carrega nada até se aplicarem filtros, e depois mostra tudo empilhado às 09:00 — porque a hora é simbólica.",
    olyvia:
      "Ao marcar, avisa se a pessoa já tem trabalho àquela hora, se está de férias, se é feriado, ou se está fora do horário dela. Nunca diz o motivo de uma ausência — pode ser uma baixa médica.",
    feito: true,
  },
  {
    titulo: "Agenda do dia, com todos lado a lado",
    porque: "Ver a carga de uma semana ainda obriga a abrir ordem a ordem.",
    infraspeak:
      "Existe um calendário, com os problemas acima. Não há apoio a zonas, com edifícios em Lisboa, Braga e Porto no mesmo dia.",
    olyvia:
      "Falta o ecrã de agenda por dia, com a carga de cada pessoa e agrupamento por zona. Os avisos de choque e de disponibilidade já existem.",
    feito: false,
  },
  {
    titulo: "Configuração pré-preenchida por setor",
    porque: "Uma árvore de definições vazia acaba sempre em caixote.",
    infraspeak:
      "Entrega tudo vazio. Cada cliente constrói a sua taxonomia à mão, sem curadoria — e daí vem o caixote.",
    olyvia:
      "A ideia é entregar packs prontos (Manutenção, Obras, Limpeza) com categorias, checklists e tipos já feitos. Ainda não está construído.",
    feito: false,
  },
] as const;

const POR_FAZER = [
  {
    o: "Ecrã de agenda por dia",
    porque:
      "hoje marca-se a data na ficha da ordem, e o sistema avisa de choques, férias e feriados. Falta a vista do dia com todos os técnicos lado a lado.",
  },
  {
    o: "Assinatura do cliente no telemóvel",
    porque:
      "o relatório tem uma linha para assinar à caneta. O Olyvia já sabe recolher assinaturas com validade legal — falta ligar as duas coisas.",
  },
  {
    o: "Exportar medições para folha de cálculo",
    porque:
      "para quem tem de entregar leituras a uma entidade reguladora. Os dados estão todos gravados.",
  },
  {
    o: "Packs de configuração por setor",
    porque: "hoje monta-se tudo à mão em Definições. Funciona, mas dá trabalho no primeiro dia.",
  },
  {
    o: "Portal do cliente",
    porque:
      "o cliente ainda não abre pedidos sozinho nem acompanha o estado. O relatório vai por email ou em papel.",
  },
  {
    o: "Trabalhar sem rede",
    porque:
      "numa garagem sem cobertura, as respostas não gravam. A aplicação avisa, mas o valor perde-se se fechar. É a coisa mais cara da lista, e fica para quando o piloto disser quantas vezes aconteceu.",
  },
] as const;

/* ══════════════════════════ 3 · Como se usa ═════════════════════════════ */

function Tutorial() {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Antes de tudo</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          A ordem por que se faz as coisas importa. Cada passo depende do anterior — não vale a
          pena criar um plano preventivo antes de haver uma checklist, nem uma checklist antes
          de haver medições.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Faz-se <strong>uma vez</strong>. Depois disso, o dia-a-dia é só a parte 2.
        </p>
      </Card>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Parte 1 · Montar (uma vez)
        </h2>
        <div className="space-y-3">
          {MONTAR.map((p, i) => (
            <Passo key={p.titulo} numero={i + 1} {...p} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Parte 2 · O dia-a-dia
        </h2>
        <div className="space-y-3">
          {DIA_A_DIA.map((p, i) => (
            <Passo key={p.titulo} numero={i + 1} {...p} />
          ))}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O ciclo, de uma vez só</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Se te perderes, é este o caminho. Só se passa de um estado para o outro pelas setas.
        </p>
        <div className="mt-3">
          <DiagramaCicloDaOrdem />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Se alguma coisa correr mal</h2>
        <dl className="mt-3 space-y-3">
          {DUVIDAS.map((d) => (
            <div key={d.q}>
              <dt className="text-sm font-medium text-slate-800">{d.q}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-slate-600">{d.a}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function Marca({ v }: { v: boolean | string }) {
  if (v === true) return <Check width={15} height={15} className="mx-auto text-emerald-600" />;
  if (v === false) return <X width={15} height={15} className="mx-auto text-slate-300" />;
  return <span className="text-xs text-slate-500">{v}</span>;
}

function Passo({
  numero,
  titulo,
  onde,
  href,
  texto,
  dica,
}: {
  numero: number;
  titulo: string;
  onde: string;
  href?: string;
  texto: string;
  dica?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            "bg-brand-50 font-mono text-xs font-semibold tabular text-brand-800"
          )}
        >
          {numero}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-slate-800">{titulo}</h3>
            {href ? (
              <Link
                to={href}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-800"
              >
                {onde}
              </Link>
            ) : (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {onde}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{texto}</p>
          {dica && (
            <p className="mt-2 rounded-lg bg-brand-50/60 px-3 py-2 text-xs leading-relaxed text-brand-800">
              {dica}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

const MONTAR = [
  {
    titulo: "Pôr a equipa",
    onde: "Definições › Equipa",
    href: "/definicoes?ver=equipa",
    texto:
      "Aparecem todas as pessoas com acesso ao Olyvia nesta empresa. Escolhe quem entra em Operações e o que faz: técnico executa, gestor distribui e marca datas.",
    dica: "O custo por hora é o que faz o custo real de mão de obra existir. Sem ele, o gasto de uma ordem fica sempre incompleto — foi exatamente isso que aconteceu no Infraspeak, onde o campo existe e nunca foi preenchido.",
  },
  {
    titulo: "Criar os sítios",
    onde: "Definições › Locais",
    href: "/definicoes?ver=locais",
    texto:
      "Um local é uma morada, um edifício, um piso ou um espaço — e pode estar dentro de outro. Depois metem-se os equipamentos lá dentro.",
    dica: "Cria primeiro as categorias de equipamento (Extintor, AVAC, Elevador). É por elas que as medições sabem a que equipamentos se aplicam.",
  },
  {
    titulo: "Definir as medições",
    onde: "Definições › Procedimentos",
    href: "/definicoes?ver=procedimentos",
    texto:
      "O que se lê ao fazer o trabalho. Quatro feitios: número com limites (10–15 bar), escolha de opções, contador que só sobe, e texto livre.",
    dica: "Na escolha, a caixa “abre corretiva” é o que faz o ciclo fechar. É a caixa que no Infraspeak existe e está desligada — e é por isso que lá as não conformidades morrem no histórico.",
  },
  {
    titulo: "Montar as checklists",
    onde: "Definições › Procedimentos",
    href: "/definicoes?ver=procedimentos",
    texto:
      "A lista de tarefas que o técnico vai encontrar. Em cada tarefa escolhes o que se mede, se é obrigatória, e se sai no relatório do cliente.",
    dica: "Publicar congela. Se editares uma checklist publicada, nasce a versão seguinte — e as ordens já feitas continuam a mostrar o que foi realmente pedido na altura.",
  },
  {
    titulo: "Criar os planos preventivos",
    onde: "Planos",
    href: "/planos",
    texto:
      "Diz o que se faz, onde, e de quanto em quanto tempo. As ordens nascem sozinhas a partir dele.",
    dica: "O formulário mostra a regra em português (“Todos os meses, na primeira segunda-feira”) e as próximas seis datas reais. Confere sempre as datas antes de gravar — é a única defesa contra uma regra que faz outra coisa.",
  },
] as const;

const DIA_A_DIA = [
  {
    titulo: "Abrir uma ordem quando o telefone toca",
    onde: "Ordens › Nova ordem",
    href: "/ordens/nova",
    texto:
      "Quatro campos: o que se passa, cliente, local, prioridade. O resto está atrás de um clique e pode ficar para depois.",
    dica: "Se for um técnico a abrir, a ordem fica “por aprovar” — está a reportar um problema. Se for um gestor, entra logo na fila.",
  },
  {
    titulo: "Dizer quem vai, e quando",
    onde: "Na ficha da ordem",
    texto:
      "Escolhes o responsável e a data lado a lado, para escolheres a pessoa a olhar para o dia dela. Quem entra na ordem passa a poder executá-la, e recebe o aviso no sino.",
    dica: "Se marcares alguém que já tem trabalho a essa hora, que esteja de férias, ou num feriado, aparece o aviso — e a marcação fica feita à mesma. Avisar não é impedir: há dias em que se vai na mesma, e quem coordena é que decide.",
  },
  {
    titulo: "Fazer o trabalho",
    onde: "Na ficha da ordem",
    texto:
      "Responde-se às tarefas pela ordem em que aparecem. Escolher “Conforme” grava logo — não há escolher e depois gravar.",
    dica: "Não é preciso carregar em Iniciar: a primeira resposta inicia a ordem sozinha, e o cronómetro começa aí. Se a tarefa tiver medições, responde-se por elas e a tarefa acerta-se sozinha quando a última entra.",
  },
  {
    titulo: "Tirar fotos",
    onde: "Na ficha da ordem",
    texto:
      "Uma foto do sítio antes de mexer poupa muita discussão depois. No telemóvel, o botão abre a câmara direto.",
    dica: "Liga “só para nós” nas fotos internas — essas não saem no relatório do cliente.",
  },
  {
    titulo: "Fechar e entregar",
    onde: "Na ficha da ordem",
    texto:
      "Fechar exige que as tarefas obrigatórias tenham resposta. Depois de fechada, aparece o botão do relatório para o cliente.",
    dica: "O relatório sai em PDF pela impressão do browser. Não leva custos, nem tarefas privadas, nem nomes internos — o cliente comprou o resultado, não o processo.",
  },
  {
    titulo: "Pôr um orçamento a andar",
    onde: "Orçamentos",
    href: "/orcamentos",
    texto:
      "Quando o comercial fecha um orçamento no CRM, ele aparece aqui. Um clique transforma-o em obra, com os custos previstos já carregados.",
    dica: "O número que se mostra é o CUSTO das linhas, não o preço ao cliente. Comparar o gasto contra o preço de venda daria um lucro bonito e falso.",
  },
  {
    titulo: "Ver como está a correr",
    onde: "Análises",
    href: "/analises",
    texto:
      "Duas coisas: a manutenção preventiva cumprida por cliente e por mês, e a ficha de um equipamento com tudo o que já se lhe fez.",
    dica: "Só quem coordena vê esta entrada. A percentagem vem sempre com a lista das ordens em atraso — porque a pergunta a seguir a uma percentagem é sempre “quais?”.",
  },
] as const;

const DUVIDAS = [
  {
    q: "Respondi a uma tarefa e o valor não gravou.",
    a: "Quase de certeza é falta de rede. A aplicação avisa quando não consegue gravar — se isso acontecer, não feches o ecrã: espera pela rede e volta a carregar. Trabalhar sem rede ainda não está feito, e é a coisa que mais queremos saber se acontece no terreno.",
  },
  {
    q: "Não consigo responder — diz que a ordem é de outra pessoa.",
    a: "Um técnico só responde às ordens em que está. Fala com quem distribui o trabalho para te acrescentar à ordem; leva dois segundos.",
  },
  {
    q: "Não consigo fechar a ordem.",
    a: "Falta responder a alguma tarefa obrigatória. O ecrã diz quantas faltam, mesmo em cima da lista.",
  },
  {
    q: "Marquei mal uma tarefa como não conforme e já nasceu uma reparação.",
    a: "A ordem nova aparece com o código no ecrã. Abre-a e cancela-a, com o motivo — fica tudo registado, e é melhor assim do que apagar sem deixar rasto.",
  },
  {
    q: "A câmara não abre no telemóvel.",
    a: "Acontece quando se abre a aplicação por um endereço de rede local em vez do endereço a sério. Em www.olyvia-ai.com/operacao funciona.",
  },
  {
    q: "Entrei no Olyvia mas o Operações pede a palavra-passe outra vez.",
    a: "É de propósito. As duas áreas guardam a sessão em sítios separados, para uma nunca poder desligar a outra.",
  },
] as const;

/* ───────────────────────────── Peças comuns ────────────────────────────── */

function Aba({
  ligado,
  onClick,
  children,
}: {
  ligado: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-lg px-3 py-2 text-sm font-medium transition-all active:scale-[0.98]",
        ligado
          ? "bg-brand text-white shadow-sm"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
      )}
    >
      {children}
    </button>
  );
}
