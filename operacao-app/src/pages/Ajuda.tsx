import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge, Card, cx } from "../components/ui";
import { AlertTriangle, Check, ChevronDown, ChevronRight, X } from "../components/icons";

/**
 * O que mudou, e como se usa.
 *
 * Duas coisas diferentes na mesma página, de propósito: quem chega novo lê o
 * tutorial; quem vem do Infraspeak precisa primeiro de perceber PORQUE é que
 * as coisas mudaram de sítio, senão passa a semana à procura do botão antigo.
 *
 * Uma regra ao escrever isto: cada diferença traz a EVIDÊNCIA. Não "o
 * Infraspeak é confuso", mas "existe em produção um plano preventivo chamado
 * PMP CORRETIVA". A evidência é o que torna a mudança discutível em vez de
 * uma questão de gosto — e o que permite a alguém dizer que estamos errados.
 */

type Separador = "mudou" | "tutorial";

export default function Ajuda() {
  const [params, setParams] = useSearchParams();
  const ver = (params.get("ver") as Separador) || "mudou";

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
          O que mudou em relação ao Infraspeak, e como se faz cada coisa.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Aba ligado={ver === "mudou"} onClick={() => trocar("mudou")}>
          O que mudou, e porquê
        </Aba>
        <Aba ligado={ver === "tutorial"} onClick={() => trocar("tutorial")}>
          Como se usa
        </Aba>
      </div>

      {ver === "mudou" ? <OQueMudou /> : <Tutorial />}
    </div>
  );
}

/* ════════════════════════ O que mudou, e porquê ═════════════════════════ */

function OQueMudou() {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O método</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          Não se copiou o Infraspeak. Copiou-se <strong>o que a operação faz</strong>, e
          deixou-se de fora o que o software impôs por acidente.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          O levantamento deu-nos uma coisa rara: as <strong>marcas de uso</strong>. Cada
          convenção de nomes inventada, cada campo desviado para outra coisa, cada plano
          preventivo chamado &ldquo;CORRETIVA&rdquo; é a operação real a protestar contra o
          modelo. Foram essas marcas que decidiram o que simplificar — não o gosto de ninguém.
        </p>
      </Card>

      <div className="space-y-3">
        {DIFERENCAS.map((d, i) => (
          <Diferenca key={d.titulo} numero={i + 1} {...d} />
        ))}
      </div>

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
                ["Entradas de menu", "13", "7"],
                ["Ecrãs de “trabalho a fazer”", "3", "1"],
                ["Catálogos de estados", "2", "1"],
                ["Níveis fixos de hierarquia física", "4", "os que forem precisos"],
                ["Motores de relatório", "2", "1"],
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
          Menos conceitos não é uma questão de estética. Cada conceito a mais é uma decisão
          que alguém tem de tomar em cima de um telhado, com o telemóvel numa mão.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">O que ainda não está feito</h2>
        <p className="mt-2 text-sm text-slate-600">
          Para não haver surpresas. Nada disto impede a equipa de trabalhar; são coisas que
          o Infraspeak tem e nós ainda não.
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
    titulo: "Agenda por dia e por pessoa",
    porque: "Uma grelha das 00:00 às 23:00 onde tudo está às 09:00 é precisão falsa.",
    infraspeak:
      "O calendário não carrega nada até se aplicarem filtros, e depois mostra tudo empilhado às 09:00 — porque a hora é simbólica. Não há apoio a zonas, com edifícios em Lisboa, Braga e Porto no mesmo dia.",
    olyvia:
      "Por agora: ao marcar uma data, avisa-se se a pessoa já tem outra coisa a essa hora, com o código da outra ordem. Falta o ecrã de agenda por dia, com carga por pessoa e agrupamento por zona.",
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
    o: "Ecrã de agenda",
    porque:
      "hoje marca-se a data na ficha da ordem, e o sistema avisa de choques. Falta a vista do dia com todos os técnicos lado a lado.",
  },
  {
    o: "Histórico do equipamento",
    porque:
      "as leituras já ficam todas gravadas, mas ainda não há um ecrã que mostre a evolução de um contador ao longo do ano.",
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
    o: "Notificações",
    porque: "ninguém recebe aviso de nada. Vê-se abrindo a aplicação.",
  },
] as const;

/* ═══════════════════════════════ Tutorial ═══════════════════════════════ */

function Tutorial() {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Antes de tudo</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          A ordem por que se faz as coisas importa. Cada passo depende do anterior — não vale
          a pena criar um plano preventivo antes de haver uma checklist, nem uma checklist
          antes de haver medições.
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
          Isto não é uma sugestão do ecrã: é imposto na base de dados. Mesmo quem falasse
          diretamente com o servidor seria recusado.
        </p>
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
      "Escolhes o responsável e a data lado a lado, para escolheres a pessoa a olhar para o dia dela. Quem entra na ordem passa a poder executá-la.",
    dica: "Se marcares alguém que já tem trabalho a essa hora, aparece o aviso com o código da outra ordem — e a marcação fica feita à mesma. Avisar não é impedir.",
  },
  {
    titulo: "Fazer o trabalho",
    onde: "Na ficha da ordem",
    texto:
      "O técnico carrega em Iniciar, e a partir daí responde às tarefas. Escolher “Conforme” grava logo — não há escolher e depois gravar.",
    dica: "Se a tarefa tiver medições, responde-se por elas e a tarefa acerta-se sozinha quando a última entra. Um valor fora dos limites avisa antes de gravares.",
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
