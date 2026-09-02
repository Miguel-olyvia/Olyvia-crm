import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Card, cx } from "../components/ui";
import {
  AlertTriangle,
  Building,
  Calendario,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Euro,
  Eye,
  Ferramenta,
  Grafico,
  Mail,
  MapPin,
  QrCode,
  User,
  X,
} from "../components/icons";
import {
  DiagramaAutomatico,
  DiagramaCicloDaOrdem,
  DiagramaDoCRM,
  DiagramaNaoConformidade,
  DiagramaOndeVive,
  DiagramaOrigens,
  DiagramaTempoDeTrabalho,
} from "../components/diagramas";
import Calculadora from "../components/Calculadora";
import AjudaFunil from "../components/ajuda-funil";
import ComparacaoDeFluxo from "../components/ComparacaoDeFluxo";

/**
 * Esta página é lida por duas pessoas muito diferentes, e é por isso que tem
 * várias portas em vez de uma.
 *
 *  · **Quem decide** — o dono da empresa. Não vai clicar em nada aqui dentro.
 *    Quer saber o que a empresa ganha em sair do Infraspeak, e o que arrisca.
 *    Fala-se-lhe de dinheiro, de contratos e de risco, com a prova ao lado.
 *
 *  · **Quem usa** — o gestor e o técnico. Querem saber onde é que se carrega,
 *    e porque é que o botão antigo mudou de sítio. Fala-se-lhes de passos.
 *
 * ⚠ **O CLIENTE LÊ ISTO.** Não há aqui separador nenhum só para dentro de casa:
 * tudo o que está nesta página é para ser lido à frente de quem compra. Notas
 * de venda — objeções, o que não prometer, guião de demonstração — não entram
 * aqui. Vivem em `docs/pagina-de-venda.html` e nas notas da equipa.
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

type Separador = "porque" | "funil" | "funciona" | "usar";

/** Os nomes antigos continuam a funcionar — houve links partilhados com eles. */
const ANTIGOS: Record<string, Separador> = { mudou: "porque", tutorial: "usar" };

export default function Ajuda() {
  const [params, setParams] = useSearchParams();
  const bruto = params.get("ver") ?? "";
  const ver: Separador =
    bruto === "porque" || bruto === "funil" || bruto === "funciona" || bruto === "usar"
      ? bruto
      : (ANTIGOS[bruto] ?? "porque");

  const trocar = (s: Separador) => {
    const p = new URLSearchParams(params);
    p.set("ver", s);
    setParams(p, { replace: true });
  };

  /*
   * Um link com `#` só funciona se o alvo já existir no ecrã.
   *
   * Aqui os separadores são condicionais: `#sugerir` vive dentro de "Como
   * funciona", e quem chega de outro sítio abre a página com esse separador
   * ainda por desenhar. Sem isto, o link levava ao topo da página e a pessoa
   * ficava a procurar o que tinha ido lá ver.
   */
  useEffect(() => {
    const alvo = window.location.hash.slice(1);
    if (!alvo) return;
    const t = setTimeout(() => {
      document.getElementById(alvo)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(t);
  }, [ver]);

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
        </Aba>
        <Aba ligado={ver === "funil"} onClick={() => trocar("funil")}>
          O funil
        </Aba>
        <Aba ligado={ver === "funciona"} onClick={() => trocar("funciona")}>
          Como funciona
        </Aba>
        <Aba ligado={ver === "usar"} onClick={() => trocar("usar")}>
          Como se usa
        </Aba>
      </div>

      {ver === "porque" && <PorqueMudar />}
      {ver === "funil" && <AjudaFunil />}
      {ver === "funciona" && <ComoFunciona />}
      {ver === "usar" && <Tutorial />}
    </div>
  );
}

/* ══════════════════════════ 1 · Porquê mudar ════════════════════════════ */

function PorqueMudar() {
  return (
    <div className="space-y-4">
      {/* O pitch. Vem antes de tudo porque quem tem trinta segundos só lê
          isto — e porque as três frases a seguir são as únicas que se
          precisa de decorar para explicar o produto a alguém. */}
      <Card className="p-5 sm:p-6">
        <p className="text-[11px] font-medium uppercase tracking-wide text-brand-600">
          Olyvia Operação
        </p>
        {/*
          O título diz o que se ganha, e não o que se perde.

          A versão anterior era "O trabalho faz-se sempre. O que se perde é a
          prova." — lê-se como uma acusação a quem já anda a trabalhar, e é a
          primeira frase que o cliente vê. As três colunas por baixo são
          exatamente estas duas promessas: prova do que se fez, conta do que
          custou. O título passou a ser a soma delas.
        */}
        <h2 className="mt-1.5 max-w-[24ch] text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">
          Fica provado o que se fez, e quanto custou.
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600">
          A equipa vai lá, resolve, tira uma foto e manda-a por WhatsApp. Três meses depois
          o cliente pergunta o que foi feito — e a resposta está numa conversa que ninguém
          consegue encontrar. Isto guarda o trabalho onde ele acontece: na ordem.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {VITORIAS.map((v) => (
            <div
              key={v.titulo}
              className="rounded-xl bg-brand-50/60 p-3.5 ring-1 ring-inset ring-brand-100"
            >
              <v.Icone width={18} height={18} className="text-brand-600" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">{v.titulo}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{v.detalhe}</p>
              <p className="mt-2 border-t border-brand-100 pt-2 text-xs leading-relaxed text-slate-500">
                <span className="font-medium text-slate-600">Hoje:</span> {v.hoje}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          O resto desta página é a prova de cada uma destas três linhas, tirada da vossa
          instalação.
        </p>
      </Card>

      {/* O panorama, antes de qualquer prova. Um desenho conta em dois
          segundos o que a página inteira demora a demonstrar. */}
      <ComparacaoDeFluxo />

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

      <Calculadora />

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Ferramenta width={17} height={17} className="shrink-0 text-brand-600" />
          O que acontece quando um técnico encontra um problema
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          <strong className="font-medium text-slate-800">O benefício:</strong> nenhuma avaria
          encontrada se perde. O trabalho do técnico é o mesmo nas duas linhas — muda o que o
          sistema faz com o que ele encontrou.
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
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Euro width={17} height={17} className="shrink-0 text-brand-600" />
          Quanto custou, de verdade, esta obra
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          <strong className="font-medium text-slate-800">O benefício:</strong> saber que
          margem teve cada obra. Lá, o tempo é fecho menos início — uma ordem aberta em
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
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Building width={17} height={17} className="text-brand-600" />
          Onde vive a informação
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          <strong className="font-medium text-slate-800">O benefício:</strong> o orçamentado e
          o gasto na mesma linha. Hoje o orçamento está num sistema e o custo está noutro.
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
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Grafico width={17} height={17} className="text-brand-600" />
          O resultado, em números
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="pb-2.5">&nbsp;</th>
                <th className="pb-2.5 text-center">
                  <span className="inline-block rounded bg-slate-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    Infraspeak
                  </span>
                </th>
                <th className="pb-2.5 text-center">
                  <span className="inline-block rounded bg-brand-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    Olyvia
                  </span>
                </th>
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

      {/* O que existe aqui e lá não. É a secção mais delicada da página:
          dizer que um produto não tem uma coisa é fácil de dizer e fácil de
          desmentir. Por isso cada linha tem a RAZÃO de não existir lá — ou é
          estrutural (vive dentro do Olyvia, e o Infraspeak é um sistema à
          parte), ou foi construída de propósito. E nada entra nesta lista sem
          ter sido visto na instalação deles. */}
      <div>
        <h2 className="mb-1 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          O que aqui existe e no Infraspeak não
        </h2>
        <p className="mb-3 max-w-prose px-1 text-sm leading-relaxed text-slate-600">
          Estas não são diferenças de gosto nem coisas que se resolvam com uma definição.
          Metade delas <strong>não pode existir</strong> num sistema à parte, por muito bom
          que ele seja: o Infraspeak não conhece as férias da vossa equipa nem os vossos
          orçamentos. A outra metade foi construída de propósito.
        </p>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {NOVIDADES.map((n) => (
            <div
              key={n.titulo}
              className="rounded-xl border border-slate-200 bg-white p-3.5"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cx(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    n.tipo === "estrutural"
                      ? "bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100"
                  )}
                >
                  <n.Icone width={16} height={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug text-slate-900">
                    {n.titulo}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{n.ganho}</p>
                </div>
              </div>
              <p className="mt-2.5 flex items-start gap-1.5 border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-500">
                <X width={12} height={12} className="mt-0.5 shrink-0 text-slate-300" />
                <span>
                  <span className="font-medium text-slate-600">Lá:</span> {n.la}
                </span>
              </p>
            </div>
          ))}
        </div>

        <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-brand-200" aria-hidden="true" />
            Só dentro do Olyvia
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-200" aria-hidden="true" />
            Construído de propósito
          </span>
        </p>
      </div>

      {/* O ganho que não cabe numa conta: o que a empresa passa a SABER. Vem
          depois dos números de propósito — quem ainda não acreditou nos
          números também não vai acreditar nisto. */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Calendario width={17} height={17} className="shrink-0 text-brand-600" />
          O que a empresa passa a saber ao fim de um ano
        </h2>
        <p className="mt-1.5 max-w-prose text-sm text-slate-600">
          Este é o ganho que não cabe numa conta. Cada leitura fica gravada com data e autor
          desde o primeiro dia — e ao fim de doze meses há perguntas que passam a ter resposta
          em vez de opinião.
        </p>
        <ul className="mt-4 space-y-3">
          {AO_FIM_DE_UM_ANO.map((x) => (
            <li key={x.pergunta} className="border-l-2 border-brand-200 pl-3">
              <p className="text-sm font-medium text-slate-800">{x.pergunta}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{x.resposta}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Nada disto se pode recuperar para trás. O histórico que o Infraspeak tem é texto
          escrito à mão em campos de observações, e ninguém o consegue somar. O relógio
          começa no dia em que a equipa começar a usar isto — que é o argumento mais forte
          para não adiar.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Check width={17} height={17} className="text-brand-600" />
          O que NÃO muda
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          <strong className="font-medium text-slate-800">O benefício:</strong> ligar isto não
          parte nada. A pergunta a seguir a &ldquo;o que ganhamos&rdquo; é sempre &ldquo;o que
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
          Dezanove diferenças, <strong>todas já construídas</strong>. Cada uma com o que o
          Infraspeak faz, o que passa a acontecer, e a prova tirada da vossa instância.
          Carrega para abrir.
        </p>
        <div className="space-y-3">
          {DIFERENCAS.map((d, i) => (
            <Diferenca key={d.titulo} numero={i + 1} {...d} />
          ))}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <AlertTriangle width={17} height={17} className="text-brand-600" />
          O que ainda não está feito
        </h2>
        <p className="mt-2 max-w-prose text-sm text-slate-600">
          Para não haver surpresas. Sobraram <strong>duas</strong>, e nenhuma delas impede a
          equipa de trabalhar hoje.
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
          <p>
            <span className="inline-block rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Infraspeak
            </span>
          </p>
          <p className="mt-0.5 text-sm leading-snug text-slate-500">{antes}</p>
        </div>
        <ChevronRight
          width={16}
          height={16}
          className="mt-3.5 shrink-0 self-start text-slate-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p>
            <span className="inline-block rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Olyvia
            </span>
          </p>
          <p className="mt-0.5 text-sm font-medium leading-snug text-slate-900">{depois}</p>
        </div>
      </div>
    </div>
  );
}

const VITORIAS = [
  {
    Icone: Euro,
    titulo: "Sabe-se quanto custou cada obra",
    detalhe:
      "Horas cronometradas ao custo/hora de cada pessoa, mais material e serviços — com o orçamentado congelado ao lado.",
    hoje: "o custo de mão de obra dá 0,00 € em todas as ordens.",
  },
  {
    Icone: Ferramenta,
    titulo: "Nada do que o técnico encontra se perde",
    detalhe:
      "Uma leitura fora da gama abre a ordem de reparação sozinha, com o problema já escrito lá dentro.",
    hoje: "a avaria fica escrita no histórico, e morre lá.",
  },
  {
    Icone: Mail,
    titulo: "O cliente recebe prova sem ninguém se lembrar",
    detalhe:
      "Ao confirmar a ordem, o relatório sai por email com as fotos, as leituras e a assinatura recolhida no local.",
    hoje: "alguém tem de se lembrar, e escrevê-lo à noite.",
  },
] as const;

/**
 * O que existe aqui e no Infraspeak não.
 *
 * Regra ao escrever esta lista: **nada entra sem a razão de não existir lá**.
 * Dizer "eles não têm" é fácil de dizer e fácil de desmentir na reunião
 * seguinte; dizer "eles não podem ter, porque não conhecem as vossas férias"
 * é uma afirmação que se aguenta.
 *
 * Por isso há dois tipos, e só dois:
 *
 *  · `estrutural` — vive dentro do Olyvia. Um sistema à parte não tem acesso
 *    à agenda, aos orçamentos nem às contas da empresa. Não é uma questão de
 *    lhes faltar trabalho: é impossível de fora.
 *
 *  · `construido` — foi feito de propósito, e foi visto a faltar na
 *    instalação deles.
 *
 * Ficaram DE FORA desta lista coisas que o Infraspeak também tem, mesmo que
 * aqui estejam melhores: mensagens na ordem, duplicar, histórico do
 * equipamento. Meter uma dessas aqui estragava a credibilidade das outras.
 */
const NOVIDADES = [
  {
    Icone: Calendario,
    tipo: "estrutural",
    titulo: "Uma agenda só",
    ganho:
      "Ao marcar, já sabe quem está de férias e quem tem folga — e avisa se a pessoa já tem outra coisa àquela hora.",
    la: "é um sistema à parte. Não conhece as férias da vossa equipa.",
  },
  {
    Icone: Euro,
    tipo: "estrutural",
    titulo: "O orçamento vira obra num clique",
    ganho:
      "Com o previsto congelado ao lado do gasto. Vê-se, linha a linha, onde a obra escorregou.",
    la: "os orçamentos estão no CRM e o trabalho lá. Ninguém junta os dois.",
  },
  {
    Icone: Building,
    tipo: "estrutural",
    titulo: "Os mesmos clientes, o mesmo login",
    ganho: "A ficha do cliente é a do CRM, lida de lá. Não se escreve nada duas vezes.",
    la: "contas à parte e a lista de clientes escrita outra vez.",
  },
  {
    Icone: MapPin,
    tipo: "construido",
    titulo: "O dia pela estrada",
    ganho:
      "As visitas por ordem de proximidade, com os quilómetros poupados ao lado. E a semana toda num mapa.",
    la: "marca-se a hora. O mapa não entra na conta.",
  },
  {
    Icone: QrCode,
    tipo: "construido",
    titulo: "Etiqueta que qualquer telemóvel lê",
    ganho:
      "Aponta a câmara ao equipamento e abre a ficha dele — com o histórico e o botão de abrir ordem.",
    la: "usa NFC: paga-se por etiqueta, e nem todos os telemóveis leem.",
  },
  {
    Icone: Mail,
    tipo: "construido",
    titulo: "O relatório sai sozinho",
    ganho:
      "Ao confirmar a ordem, vai por email com as fotos, as leituras e a assinatura de quem recebeu.",
    la: "há o botão de enviar. Alguém tem sempre de se lembrar dele.",
  },
  {
    Icone: Eye,
    tipo: "construido",
    titulo: "O veredicto antes de gravar",
    ganho:
      "Escrever 8 numa gama de 10 a 15 avisa logo: vai ficar não conforme, e vai abrir reparação.",
    la: "só se sabe depois. Quem se enganou já gerou uma ordem que ninguém pediu.",
  },
  {
    Icone: Grafico,
    tipo: "construido",
    titulo: "A manutenção cumprida, calculada",
    ganho:
      "Uma percentagem por cliente e por mês. É o número que se leva a uma renovação de contrato.",
    la: "conta-se à mão, ordem a ordem, na véspera da reunião.",
  },
] as const;

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
        <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-slate-200">
          <p className="bg-slate-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Infraspeak
          </p>
          <p className="bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
            {infraspeak}
          </p>
        </div>
        <div className="overflow-hidden rounded-lg ring-1 ring-inset ring-brand-200">
          <p className="bg-brand-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Olyvia
          </p>
          <p className="bg-brand-50/60 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
            {agora}
          </p>
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
      "Uma tarefa não conforme abre uma ordem de reparação sozinha, já com o cliente, o local, o equipamento e o que o técnico escreveu. E as duas ficam ligadas.",
  },
  {
    pergunta: "Este equipamento compensa reparar outra vez, ou substituir?",
    infraspeak: "Decide-se de cabeça. As leituras estão guardadas, mas espalhadas por ordens, sem ninguém as somar.",
    agora:
      "A ficha do equipamento mostra tudo o que já se lhe fez e a evolução das leituras. Três avarias em doze meses levantam a pergunta sozinhas.",
  },
] as const;

const AO_FIM_DE_UM_ANO = [
  {
    pergunta: "Este cliente dá lucro?",
    resposta:
      "Todas as ordens dele, com o custo real de mão de obra e de material ao lado do que foi orçamentado. Hoje sabe-se o que se faturou; passa a saber-se o que custou.",
  },
  {
    pergunta: "Este equipamento compensa substituir?",
    resposta:
      "Doze meses de leituras desenhadas, e a conta das avarias. Três num ano levantam a pergunta sozinhas — e a resposta deixa de depender de quem se lembra melhor.",
  },
  {
    pergunta: "Cumprimos o contrato deste cliente?",
    resposta:
      "Uma percentagem por mês, com a lista do que ficou por fazer. É o número que se leva a uma renovação, em vez de se contar à mão na véspera.",
  },
  {
    pergunta: "Quanto tempo demora, mesmo, uma inspeção destas?",
    resposta:
      "As sessões de trabalho de um ano inteiro. Passa a dar para orçamentar com o que aconteceu, e não com o que se acha.",
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

      {/*
        A sugestão de técnico, explicada por inteiro.

        Está aqui, e não numa nota de rodapé, por uma razão: é a única coisa
        nesta aplicação que **ordena pessoas**. Um número ao lado do nome de um
        colega tem de poder ser discutido — e para ser discutido tem de estar
        escrito de onde vem, quanto pesa cada parte, e o que acontece quando
        falta informação. Uma caixa preta que escolhe quem trabalha seria a
        pior coisa que este módulo podia ter.

        O `scroll-mt` existe porque o cabeçalho da aplicação é fixo: sem ele,
        o link `?ver=funciona#sugerir` deixava o título escondido por trás.
      */}
      <Card id="sugerir" className="scroll-mt-24 p-5">
        <h2 className="text-base font-semibold text-slate-900">
          Como se escolhe quem vai a uma ordem
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Na ficha da ordem, ao lado de <em>Quem vai, e quando</em>, há um botão{" "}
          <strong className="font-medium text-slate-800">Sugerir</strong>. Ele responde às três
          perguntas que uma pessoa faria se tivesse tempo para as fazer — e mostra a resposta
          de cada uma, por extenso, ao lado de cada nome.
        </p>

        <div className="mt-4 space-y-3">
          {SUGESTAO.map((s) => (
            <div key={s.pergunta} className="rounded-xl bg-slate-50 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <s.Icone width={16} height={16} className="shrink-0 text-brand-600" />
                <h3 className="text-sm font-semibold text-slate-800">{s.pergunta}</h3>
                <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500 ring-1 ring-inset ring-slate-200">
                  pesa {s.peso}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.como}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                <strong className="font-medium text-slate-600">De onde vem:</strong> {s.donde}
              </p>
            </div>
          ))}
        </div>

        <h3 className="mt-5 text-sm font-semibold text-slate-800">
          Uma pergunta sem resposta não vota
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Se as tarefas da ordem não pedirem especialidade nenhuma, ou se o local não tiver
          ponto no mapa, esse peso <strong className="font-medium text-slate-800">reparte-se
          pelos restantes</strong> em vez de contar como zero. Contar um desconhecido como zero
          castigaria toda a gente por igual — e mudaria a ordem final por causa de uma coisa
          que ninguém sabe. O painel diz sempre quais das três perguntas ficaram de fora.
        </p>

        <h3 className="mt-4 text-sm font-semibold text-slate-800">
          Férias e choques de hora não eliminam ninguém
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Uma ausência aprovada, um feriado, ou já ter outra ordem à mesma hora põem a pessoa no
          fim da lista com o motivo escrito — mas <strong className="font-medium text-slate-800">
          nunca a tiram de lá</strong>. É a mesma regra da marcação: avisar não é impedir. Há
          dias em que se telefona à pessoa de folga porque só ela tem a chave, e quem coordena é
          que decide.
        </p>

        <h3 className="mt-4 text-sm font-semibold text-slate-800">
          Quando a ordem ainda não tem data
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          A pergunta muda de <em>&ldquo;quem está livre nesse dia?&rdquo;</em> para{" "}
          <em>&ldquo;quem consegue ir mais cedo?&rdquo;</em>. Olham-se os próximos{" "}
          <strong className="font-medium text-slate-800">14 dias</strong> e procura-se o
          primeiro em que a pessoa ainda cabe — menos de 8 horas comprometidas e sem ausência.
          Nesse caso o botão passa a dizer <em>&ldquo;Escolher e marcar para quinta,
          17/09&rdquo;</em>: as duas perguntas foram respondidas ao mesmo tempo, e obrigar a
          repetir a segunda à mão seria deitar fora metade da resposta.
        </p>

        <div className="mt-4 space-y-2">
          <p className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            <Check width={14} height={14} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-medium">Sugere, não decide.</strong> Não grava nada:
              preenche os campos que já lá estavam, e a marcação continua a precisar dos mesmos
              dois botões. Nenhuma ordem muda de dono por causa deste botão.
            </span>
          </p>
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <Check width={14} height={14} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-medium">Nada sai daqui.</strong> A conta é feita no
              browser, com dados que a aplicação já lê. Não há serviço de fora, não há chave de
              API, não há fatura — e os dados da equipa não passam por servidor nenhum de
              terceiros.
            </span>
          </p>
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle width={14} height={14} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-medium">A distância é em linha reta</strong>, como um
              pássaro a faria — a mesma conta que já ordena as paragens do dia. Serve para
              comparar duas hipóteses; não serve para prometer quilómetros a ninguém. Com um rio
              ou uma auto-estrada pelo meio, a estrada pode ser muito mais.
            </span>
          </p>
        </div>

        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
          <strong className="font-medium text-slate-600">Para isto valer alguma coisa,</strong>{" "}
          faltam três hábitos: pôr as especialidades nas tarefas das checklists, marcar as
          moradas no mapa, e manter as férias no CRM. Sem eles a sugestão continua a funcionar —
          só responde a menos perguntas, e diz quais.
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
                <th className="pb-2 font-medium">Automatizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DO_CRM.map(([o, paraque, ganho]) => (
                <tr key={o}>
                  <td className="py-2 pr-4 font-medium text-slate-800">{o}</td>
                  <td className="py-2 pr-4 text-slate-600">{paraque}</td>
                  {/* Verde COM ícone e COM palavras. Uma cor sozinha não diz nada a
                      quem não distingue verde de vermelho — e não diz o que se ganhou. */}
                  <td className="py-2">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      <Check width={12} height={12} className="shrink-0" />
                      {ganho}
                    </span>
                  </td>
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

/**
 * As três perguntas da sugestão de técnico, e o que cada uma pesa.
 *
 * Os pesos são os mesmos que estão em `domain/sugerir-tecnico.ts` — se um
 * mudar lá, muda aqui. Uma ajuda que descreve uma conta diferente da que corre
 * é pior do que não haver ajuda nenhuma: quem a lê fica a discutir um número
 * que o ecrã nunca produziu.
 *
 * A ordem por que aparecem é a ordem do peso, e isso é a explicação: mandar a
 * pessoa errada a 3 km custa uma segunda visita; mandar a pessoa certa a 30 km
 * custa meia hora de carro.
 */
const SUGESTAO = [
  {
    Icone: User,
    pergunta: "Sabe fazer isto?",
    peso: "50 %",
    como:
      "Juntam-se as especialidades que as tarefas desta ordem pedem, e vê-se quem as tem. " +
      "Quem tem todas fica com a pontuação cheia; quem tem metade fica com metade; quem não " +
      "tem nenhuma continua na lista, mas com o que lhe falta escrito pelo nome.",
    donde:
      "a especialidade de cada tarefa, que vem da checklist do plano. Na prática é o plano " +
      "que diz o que é preciso saber para fazer aquele trabalho.",
  },
  {
    Icone: Clock,
    pergunta: "Está livre?",
    peso: "30 %",
    como:
      "Conta-se quantas horas cada pessoa já tem comprometidas nesse dia — uma ordem sem " +
      "janela conta uma hora, com janela conta a janela — e oito horas é um dia cheio. " +
      "Férias, feriados e choques de hora aparecem como aviso ao lado do nome.",
    donde:
      "as ordens já marcadas, mais os compromissos da agenda do CRM, mais as ausências e os " +
      "horários. A agenda é uma só: uma visita comercial às 10h ocupa as 10h.",
  },
  {
    Icone: MapPin,
    pergunta: "Está perto?",
    peso: "20 %",
    como:
      "Mede-se a distância do local desta ordem à paragem mais próxima que a pessoa já tem " +
      "nesse dia. Ao pé da porta vale tudo, a 40 km ou mais não vale nada, e no meio desce a " +
      "direito. Mede-se à mais próxima e não à média: quem já tem uma visita no mesmo prédio " +
      "está lá, e a média de duas paragens em pontas opostas da cidade daria um ponto onde " +
      "ninguém vai estar.",
    donde:
      "as coordenadas dos locais, marcadas na ficha de cada morada. Sem ponto no mapa esta " +
      "pergunta não conta para ninguém.",
  },
] as const;

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

/**
 * A terceira coluna diz o que se deixa de fazer à mão, e não se o módulo escreve
 * na tabela. Quem lê isto quer saber o que ganha; se o módulo escreve ou lê é
 * uma pergunta de quem constrói, e essa está respondida no desenho por cima e
 * em `docs/mapa-do-modulo.md`.
 */
const DO_CRM: readonly (readonly [string, string, string])[] = [
  [
    "Clientes, moradas e contactos",
    "abrir uma ordem sem escrever a morada à mão",
    "vem preenchido",
  ],
  ["Pessoas e permissões", "quem entra, e o que cada um pode fazer", "sem contas novas"],
  ["Orçamentos aceites", "o orçamento fechado vira obra", "um clique"],
  ["Catálogo de material", "lançar custos sem inventar preços", "preços do catálogo"],
  [
    "Compras e faturas de fornecedor",
    "o material que se comprou para aquela obra",
    "já ligadas à obra",
  ],
  [
    "Férias, horários e feriados",
    "não marcar uma visita a quem não está",
    "avisa antes",
  ],
  ["Notificações (o sino)", "o aviso chega onde a equipa já olha", "avisa sozinho"],
  ["Fotos e ficheiros", "a foto sai da câmara e fica na ordem", "sem passos pelo meio"],
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
              <span className="inline-block rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Infraspeak
              </span>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{infraspeak}</p>
            </div>
            <div>
              <span className="inline-block rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Olyvia
              </span>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{olyvia}</p>
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
    titulo: "O local é uma árvore, não quatro caixas fixas",
    porque: "O mesmo modelo serve um prédio de escritórios e um apartamento.",
    infraspeak:
      "Cliente → Edifício → Local → Ativo, sempre. Faz sentido em manutenção de edifícios; não faz nenhum numa remodelação de casa de banho.",
    olyvia:
      "Um local pode estar dentro de outro, tantas vezes quantas fizerem falta. Duas para uma obra num apartamento, quatro para uma torre com pisos e garagens.",
    evidencia:
      "há centenas de “edifícios” na instância que são apartamentos de clientes particulares. O conceito já tinha degenerado em “o local onde vamos trabalhar”.",
    feito: true,
  },
  {
    titulo: "O equipamento é opcional",
    porque: "Nem todo o trabalho é a uma máquina.",
    infraspeak:
      "A ordem quer um ativo. Para limpar um piso, alguém teve de inventar um equipamento chamado “Piso”.",
    olyvia:
      "Uma ordem pode apontar só ao local. Sem inventar equipamentos que não existem.",
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
      "Uma tarefa não conforme abre uma ordem corretiva sozinha, já com o cliente, o local, o equipamento, o valor lido e o que o técnico escreveu. E as duas ficam ligadas.",
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
    porque: "“Quem tem espaço amanhã de manhã?” passa a ver-se num ecrã.",
    infraspeak:
      "O calendário não carrega nada até se aplicarem filtros, e depois mostra tudo empilhado às 09:00 — porque a hora é simbólica e ninguém a preenche.",
    olyvia:
      "O dia com toda a equipa lado a lado, a carga de cada um em horas, quem está ausente, e as ordens marcadas que ainda não têm ninguém. Uma ordem sem hora aparece à parte, e não a fingir que é às nove.",
    feito: true,
  },
  {
    titulo: "A assinatura do cliente fica com a ordem",
    porque: "O papel perde-se, molha-se, fica no carro.",
    infraspeak:
      "O relatório sai com uma linha para assinar à caneta. Depois alguém tem de guardar a folha, e seis meses depois ninguém sabe onde ela está.",
    olyvia:
      "O cliente assina com o dedo no telemóvel do técnico, com o nome e a qualidade em que assina — cliente, condómino, encarregado. Fica com a ordem e sai no relatório. É o equivalente digital da folha de obra assinada; não é uma assinatura eletrónica qualificada, e o ecrã diz isso.",
    feito: true,
  },
  {
    titulo: "Configuração pré-preenchida por setor",
    porque: "Uma árvore de definições vazia acaba sempre em caixote.",
    infraspeak:
      "Entrega tudo vazio. Cada cliente constrói a sua taxonomia à mão, sem curadoria — e daí vem o caixote: categorias chamadas “BM24 PISO” e pastas comerciais dentro de “Manutenções”.",
    olyvia:
      "Três packs prontos — Manutenção, Obras e Limpeza — com categorias, medições e checklists já publicadas. Instalar acrescenta o que falta e nunca reescreve o que já lá estava.",
    feito: true,
  },
] as const;

const POR_FAZER = [
  {
    o: "Portal do cliente",
    porque:
      "o cliente ainda não abre pedidos sozinho nem acompanha o estado. O relatório vai por email ou em papel.",
  },
  {
    o: "Abrir a aplicação sem rede",
    porque:
      "responder a tarefas e a leituras sem rede já funciona — fica guardado no telemóvel e sai sozinho quando a rede volta. O que falta é a aplicação abrir sem rede: hoje tem de ter aberto com rede pelo menos uma vez nesse dia.",
  },
  {
    o: "Tirar fotos sem rede",
    porque:
      "uma foto não cabe na mesma fila que uma resposta de texto. Numa cave, a resposta guarda-se e a foto não.",
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

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Parte 3 · Quando já estiverem à vontade
        </h2>
        <p className="mb-3 px-1 text-sm leading-relaxed text-slate-600">
          Nada disto é preciso no primeiro dia. São as coisas que se descobrem à terceira
          semana, quando alguém pergunta &ldquo;e não dá para…?&rdquo;.
        </p>
        <div className="space-y-3">
          {DEPOIS.map((p, i) => (
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
    titulo: "Pôr a aplicação a falar como vocês",
    onde: "Definições › Vocabulário",
    href: "/definicoes?ver=vocabulario",
    texto:
      "Cinco listas vêm com o vocabulário da manutenção de edifícios: prioridade, criticidade, natureza da tarefa, nível do local e origem. Muda-lhes o nome para o vosso, muda a ordem, e esconde o que não usam.",
    dica: "É o primeiro passo de propósito: toda a gente vai ler estas palavras dezenas de vezes por dia. As especialidades — Eletricista, AVAC, jardinagem — criam-se no mesmo ecrã, e essas inventam-se à vontade.",
  },
  {
    titulo: "Pôr a equipa",
    onde: "Definições › Equipa",
    href: "/definicoes?ver=equipa",
    texto:
      "Aparecem todas as pessoas com acesso ao Olyvia nesta empresa. Escolhe quem entra em Operações e o que faz: técnico executa, gestor distribui e marca datas.",
    dica: "O custo por hora é o que faz o custo real de mão de obra existir. Sem ele, o gasto de uma ordem fica sempre incompleto — foi exatamente isso que aconteceu no Infraspeak, onde o campo existe e nunca foi preenchido.",
  },
  {
    titulo: "Escolher as categorias de equipamento",
    onde: "Definições › Procedimentos",
    href: "/definicoes?ver=procedimentos",
    texto:
      "O que um equipamento é: extintor, elevador, quadro elétrico. Há um catálogo por ofício — escolhem-se várias de uma vez, e cria-se à mão o que faltar.",
    dica: "Vem antes dos locais porque as medições penduram-se nas categorias. Sem elas, uma medição não sabe a que equipamentos se aplica.",
  },
  {
    titulo: "Criar os locais",
    onde: "Locais",
    href: "/locais",
    texto:
      "Um local é a morada, e tem cliente e ponto no mapa. Os espaços — garagem, piso 3, cozinha — vivem dentro dele: é o sinal + de cada linha da árvore. Os equipamentos metem-se depois, na ficha de cada local.",
    dica: "Isto saiu das Definições de propósito. Um local não é uma definição — e também se cria a meio de abrir uma ordem, sem sair de lá: se o cliente tiver a morada na ficha do CRM, é um toque.",
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
    titulo: "Classificar o trabalho e o dinheiro",
    onde: "Definições › Tipos e custos",
    href: "/definicoes?ver=tipos",
    texto:
      "Tipos de trabalho, centros de custo, motivos de pausa e áreas. É o que faz um relatório conseguir somar — sem isto, há oito maneiras de escrever “à espera de material” e nenhuma conta bate certo.",
    dica: "Os motivos de pausa escolhem-se por função: pausar uma ordem com “a aguardar aprovação superior” não é uma decisão de quem está no local.",
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
    titulo: "Deixar que ele sugira quem vai",
    onde: "Na ficha da ordem › Sugerir",
    texto:
      "O botão «Sugerir» ordena a equipa por quem sabe fazer aquilo (pelas especialidades das tarefas), quem está livre nesse dia, e quem já vai estar mais perto. Cada nome vem com as razões escritas ao lado, e um por um podes discordar delas.",
    dica: "Não grava nada: preenche os campos, e a marcação continua a precisar dos mesmos dois botões. Se a ordem ainda não tiver data, ele propõe também o primeiro dia em que a pessoa cabe. A conta está explicada por inteiro em Ajuda › Como funciona.",
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
      "Uma foto do local antes de mexer poupa muita discussão depois. No telemóvel, o botão abre a câmara direto.",
    dica: "Liga “só para nós” nas fotos internas — essas não saem no relatório do cliente.",
  },
  {
    titulo: "Fechar, assinar e entregar",
    onde: "Na ficha da ordem",
    texto:
      "Fechar exige que as tarefas obrigatórias tenham resposta. Depois de fechada aparecem duas coisas: o botão do relatório, e a caixa para o cliente assinar no telemóvel.",
    dica: "Escreve sempre a QUALIDADE de quem assina — cliente, condómino, porteiro. Uma assinatura ilegível de alguém que passava não vale nada seis meses depois. O relatório sai em PDF pela impressão do browser, e não leva custos nem tarefas privadas.",
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

/**
 * O que apareceu depois de o funil estar todo montado.
 *
 * Separado do dia a dia de propósito: são coisas que não se fazem todos os
 * dias, e que quem está a aprender não precisa de saber ao segundo dia.
 */
const DEPOIS = [
  {
    titulo: "Colar etiquetas nos equipamentos",
    onde: "Ficha do local › Etiquetas",
    href: "/locais",
    texto:
      "Imprime uma folha de autocolantes com um QR por equipamento. Quem apontar a câmara do telemóvel abre a ficha dele — com o histórico e o botão de abrir ordem ali mesmo.",
    dica: "Imprime a partir do endereço a sério da aplicação. Se imprimires a partir do computador de quem programa, as etiquetas apontam para lado nenhum — e isso descobre-se depois de colar trezentos autocolantes.",
  },
  {
    titulo: "Falar sobre a ordem, na ordem",
    onde: "Ficha da ordem › Conversa",
    href: "/ordens",
    texto:
      "O que hoje se manda por WhatsApp — “o quadro está diferente da checklist”, “a peça só chega quinta” — escreve-se dentro da ordem. Quem está na ordem recebe aviso no sino.",
    dica: "Não se apaga nem se reescreve, de propósito: a discussão sobre quem disse o quê é precisamente o que isto vem resolver. O cliente não vê esta conversa.",
  },
  {
    titulo: "Mandar o relatório quando o cliente liga a pedir",
    onde: "Ficha da ordem › Enviar ao cliente",
    href: "/ordens",
    texto:
      "Com a ordem fechada, o botão manda o relatório para o email da ficha do cliente. Mostra o endereço antes de mandar, e avisa se já foi mandado um.",
    dica: "Funciona mesmo com o envio automático desligado. Não há campo para escrever um email à mão — quem quiser mandar para outro sítio corrige a ficha do cliente, que é onde essa decisão pertence.",
  },
  {
    titulo: "Fazer o dia render",
    onde: "Agenda › Dia e Mapa",
    href: "/agenda",
    texto:
      "Na vista de dia, o painel do dia pela estrada põe as visitas por ordem de proximidade e diz quantos quilómetros isso poupa. Na vista de mapa, vê-se a semana toda em cima do mapa.",
    dica: "Só sugere trocar a ordem se valer mesmo a pena — mudar meia dúzia de horas de sítio para poupar dois quilómetros não compensa a chamada a cada cliente.",
  },
  {
    titulo: "Não voltar a montar o que já está montado",
    onde: "Em cada ficha › Duplicar",
    href: "/ordens",
    texto:
      "Ordens, planos, locais e checklists duplicam-se. Um edifício igual ao do lado, uma inspeção que se repete noutro cliente.",
    dica: "A cópia leva o molde e nunca o que aconteceu: as tarefas vão por fazer, sem custos, sem datas, sem histórico e com código novo.",
  },
] as const;

const DUVIDAS = [
  {
    q: "Respondi a uma tarefa e não vejo a resposta gravada.",
    a: "Sem rede, a resposta fica guardada no telemóvel e sai sozinha quando a rede voltar — aparece um contador com quantas estão por enviar. Não é preciso fazer nada, nem repetir o trabalho. O que ainda não funciona sem rede são as fotos, e abrir a aplicação de raiz.",
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
