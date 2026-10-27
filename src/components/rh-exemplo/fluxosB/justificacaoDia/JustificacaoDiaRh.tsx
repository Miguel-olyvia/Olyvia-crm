/**
 * O que o RH vê no painel do dia da ficha da pessoa quando ela justificou uma falta sugerida ou um atraso: o tipo, a hora
 * real, os anexos, o motivo completo (dado de saúde só com «Ver texto», que regista quem leu e quando), o efeito no
 * desconto e as acções: Aceitar · paga, Aceitar · não paga e Recusar com motivo. O desconto vem da regra das faltas, com o
 * valor da hora REAL do mês (o do processamento salarial); sem ele diz-se só o tempo e não se inventa um valor.
 *
 * As justificações vêm da base (só as deste dia). Enquanto lê, quando falha ou quando a migration ainda não foi aplicada, diz-se
 * isso mesmo em vez de esconder o bloco: um dia sem nada e um dia que não se conseguiu ler não são a mesma coisa.
 */
import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { valorHoraDoCalculo } from "@/components/rh-exemplo/fluxosB/faltas/valorHora";
import { formatarData, formatarDataHora, formatarEuros, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { useAccoesJustificacaoDia, useJustificacoesDoDia } from "@/components/rh-exemplo/hooks/useJustificacoesDoDia";
import { ESTADO_DA_JUSTIFICACAO, descontoDaDecisao, textoEhSensivel, type DecisaoJustificacaoDia, type JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useCalculoRealDaPessoa } from "@/components/rh-exemplo/processamento/useCalculoReal";
import { useTranslation } from "@/hooks/useTranslation";
import { DialogosDecisaoDia, type PedidoDecisaoDia } from "./DialogosDecisaoDia";
import { useDecisaoDoDia } from "./useDecisaoDoDia";

interface AcessoAoTexto {
  quem: string;
  quando: string;
}

/**
 * O motivo. O de uma consulta médica é dado de saúde: a base só o devolve a quem é a própria pessoa; ao RH mostra-se um
 * botão «Ver texto», que pede o texto à base (deixando registo de quem leu) e depois lista quem já o leu.
 */
function TextoDoMotivo({ j }: { j: JustificacaoDia }) {
  const { t } = useTranslation();
  const { verTexto, acessos: lerAcessos } = useAccoesJustificacaoDia();
  const [texto, setTexto] = useState<string | null>(null);
  const [acessos, setAcessos] = useState<AcessoAoTexto[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aLer, setALer] = useState(false);
  // A base já entregou o texto (é a própria pessoa, ou não é dado de saúde): não há nada a reservar.
  if (!textoEhSensivel(j) || j.motivo !== "") return <p>{j.motivo}</p>;

  const ler = async () => {
    setALer(true);
    setErro(null);
    const lido = await verTexto(j.id);
    if (lido.erro || lido.texto === null) {
      setErro(lido.erro ?? "rhJust.erro.leitura");
      setALer(false);
      return;
    }
    setTexto(lido.texto);
    // Quem leu: só depois de ler, e uma falha aqui não esconde o texto que já se leu.
    const quem = await lerAcessos(j.id);
    if (!quem.erro) setAcessos(quem.acessos);
    setALer(false);
  };

  return (
    <div className="space-y-2">
      {texto === null ? (
        <Button type="button" variant="outline" className="min-h-11" disabled={aLer} onClick={() => void ler()}>
          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("rhJust.rh.verTexto")}
        </Button>
      ) : (
        <p className="rounded-md border bg-muted/40 p-3" data-testid="rhjd-texto">{texto}</p>
      )}
      {erro && <p role="alert" className="text-sm font-medium text-destructive" data-testid="rhjd-texto-erro">{t(erro)}</p>}
      <p className="text-xs text-muted-foreground">{t("rhJust.rh.textoSensivel")}</p>
      {acessos.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label={t("rhJust.rh.quemLeu")}>
          {acessos.map((a, i) => <li key={`${a.quando}-${i}`}>{t("rhJust.rh.leuEm", { quem: a.quem, quando: formatarDataHora(a.quando) })}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * O efeito no desconto: o que daria cada decisão (por decidir) ou o que a decisão tomada deu. O valor da hora só se lê
 * (processamento salarial do mês do dia) quando há um desconto em euros a mostrar: por decidir, ou aceite e não paga.
 */
function EfeitoNoDesconto({ j }: { j: JustificacaoDia }) {
  return j.estado === "pendente" || j.estado === "aceite_nao_paga" ? <EfeitoComValorDaHora j={j} /> : <ListaDeEfeitos j={j} valorHora={null} />;
}

function EfeitoComValorDaHora({ j }: { j: JustificacaoDia }) {
  const calculo = useCalculoRealDaPessoa(j.pessoaId, Number(j.data.slice(0, 4)) || 0, Number(j.data.slice(5, 7)) || 1);
  const valorHora = useMemo(() => valorHoraDoCalculo(calculo.resultado)?.valorHora ?? null, [calculo.resultado]);
  return <ListaDeEfeitos j={j} valorHora={valorHora} />;
}

function ListaDeEfeitos({ j, valorHora }: { j: JustificacaoDia; valorHora: number | null }) {
  const { t, language } = useTranslation();
  const texto = (decisao: DecisaoJustificacaoDia, chaveSem: string, chaveCom: string): string => {
    const d = descontoDaDecisao(j, decisao, valorHora ?? 0);
    if (!d || !d.desconta) return t(chaveSem);
    // Sem valor da hora o tempo continua a ver-se; o valor em euros é que não se inventa.
    return valorHora === null
      ? t(`${chaveCom}SemValor`, { tempo: formatarHorasMinutos(d.minutos) })
      : t(chaveCom, { tempo: formatarHorasMinutos(d.minutos), total: formatarEuros(d.valor, language) });
  };
  const linhas =
    j.estado === "pendente"
      ? [t("rhJust.rh.previaPaga"), texto("aceitar_nao_paga", "rhJust.rh.previaPaga", "rhJust.rh.previaNaoPaga"), t("rhJust.rh.previaRecusar")]
      : j.estado === "recusada"
        ? [t("rhJust.rh.efeitoRecusada")]
        : [j.estado === "aceite_paga" ? t("rhJust.rh.efeitoPaga") : texto("aceitar_nao_paga", "rhJust.rh.efeitoPaga", "rhJust.rh.efeitoNaoPaga")];
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="rhjd-efeito">
      {linhas.map((l) => <li key={l}>{l}</li>)}
      {j.mesFechado && <li className="font-medium text-foreground">{t("rhJust.rh.mesFechado")}</li>}
    </ul>
  );
}

function BotoesDeDecisao({ aoAceitar, aoRecusar, desactivados }: { aoAceitar: (d: "aceitar_paga" | "aceitar_nao_paga") => void; aoRecusar: () => void; desactivados: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" className="min-h-11" disabled={desactivados} onClick={() => aoAceitar("aceitar_paga")}>{t("rhJust.rh.aceitarPaga")}</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={desactivados} onClick={() => aoAceitar("aceitar_nao_paga")}>{t("rhJust.rh.aceitarNaoPaga")}</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={desactivados} onClick={aoRecusar}>{t("rhJust.rh.recusar")}</Button>
    </div>
  );
}

interface CartaoProps {
  j: JustificacaoDia;
  aOcupar: boolean;
  aoDecidir: (j: JustificacaoDia, decisao: DecisaoJustificacaoDia) => void;
  aoRecusar: (j: JustificacaoDia) => void;
}

function Cartao({ j, aOcupar, aoDecidir, aoRecusar }: CartaoProps) {
  const { t } = useTranslation();
  return (
    <li className="space-y-2 rounded-md border p-3 text-sm" data-testid={`rhjd-rh-${j.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-normal">{t(`rhJust.estado.${ESTADO_DA_JUSTIFICACAO[j.estado]}`)}</Badge>
        <span>{t(`rhJust.tipo.${j.tipo}`)}</span>
        <span className="text-xs text-muted-foreground">{t("rhJust.enviadaEm", { data: formatarData(j.enviadaEm.slice(0, 10)) })}</span>
      </div>
      {j.horaReal && <p className="tabular-nums">{t("rhJust.rh.horaReal", { hora: j.horaReal })}</p>}
      {j.anexos.length > 0 && <p>{t("rhJust.rh.anexos", { nomes: j.anexos.join(", ") })}</p>}
      <TextoDoMotivo j={j} />
      {j.estado === "recusada" && j.motivoRecusa && <p className="text-destructive">{t("rhJust.motivoRH", { motivo: j.motivoRecusa })}</p>}
      {j.decididaPor && j.decididaEm && <p className="text-xs text-muted-foreground">{t("rhJust.decididaPor", { quem: j.decididaPor, data: formatarDataHora(j.decididaEm) })}</p>}
      <EfeitoNoDesconto j={j} />
      {j.estado === "pendente" && <BotoesDeDecisao desactivados={aOcupar} aoAceitar={(d) => aoDecidir(j, d)} aoRecusar={() => aoRecusar(j)} />}
    </li>
  );
}

interface JustificacaoDiaRhProps {
  pessoaId: string;
  pessoaNome: string;
  data: string;
  /** Chamado quando a aceitação deixou uma falta nova na base: o calendário da pessoa relê o mês para a mostrar. */
  aoCriarFalta?: () => void;
}

export function JustificacaoDiaRh({ pessoaId, pessoaNome, data, aoCriarFalta }: JustificacaoDiaRhProps) {
  const { t } = useTranslation();
  const { justificacoes, erro, indisponivel, recarregar } = useJustificacoesDoDia({ pessoaId, de: data, ate: data });
  const [pedido, setPedido] = useState<PedidoDecisaoDia | null>(null);
  const { decidir, mensagem, executor, aOcupar } = useDecisaoDoDia(aoCriarFalta);
  // Um dia sem justificações e sem nada a dizer não ocupa lugar (nem pisca enquanto lê); um dia que não se conseguiu ler diz porquê.
  if (justificacoes.length === 0 && !executor && !erro && !indisponivel && !mensagem) return null;

  return (
    <section className="space-y-3" aria-label={t("rhJust.rh.titulo")} data-testid="rhjd-rh">
      <h4 className="text-sm font-medium text-muted-foreground">{t("rhJust.rh.titulo")}</h4>
      {indisponivel && <p role="status" className="text-sm text-muted-foreground" data-testid="rhjd-rh-indisponivel">{t("rhJust.erro.indisponivel")}</p>}
      {erro && (
        <div className="flex flex-wrap items-center gap-2" data-testid="rhjd-rh-erro">
          <p role="alert" className="text-sm font-medium text-destructive">{t("rhJust.erro.leitura")}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void recarregar()}>{t("rhJust.tentarDeNovo")}</Button>
        </div>
      )}
      <ul className="space-y-2">
        {justificacoes.map((j) => (
          <Cartao key={j.id} j={j} aOcupar={aOcupar} aoDecidir={(x, d) => decidir(x, d)} aoRecusar={(x) => setPedido({ justificacao: x, tipo: "recusar", pessoaNome })} />
        ))}
      </ul>
      {mensagem && <p role={mensagem.erro ? "alert" : "status"} className={`text-sm font-medium ${mensagem.erro ? "text-destructive" : ""}`}>{mensagem.texto}</p>}
      <DialogosDecisaoDia pedido={pedido} aoFechar={() => setPedido(null)} aoDecidir={decidir} />
      {executor}
    </section>
  );
}
