/**
 * O que o RH vê no painel do dia da ficha da pessoa quando ela justificou uma falta sugerida ou um atraso: o tipo, a hora
 * real, os anexos, o motivo completo (dado de saúde só com «Ver texto», que regista quem leu e quando), o efeito no
 * desconto e as acções: Aceitar · paga, Aceitar · não paga e Recusar com motivo. O desconto vem da regra das faltas.
 */
import { useState } from "react";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { verTextoDaJustificacao } from "@/components/rh-exemplo/dados/accoesJustificacaoDia";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useJustificacaoDia } from "@/components/rh-exemplo/dados/lojaJustificacaoDia";
import { valorHoraDaFicha } from "@/components/rh-exemplo/fluxosB/faltas/valorHora";
import { formatarData, formatarDataHora, formatarEuros, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { ESTADO_DA_JUSTIFICACAO, descontoDaDecisao, textoEhSensivel, type DecisaoJustificacaoDia, type JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import { useTranslation } from "@/hooks/useTranslation";
import { DialogosDecisaoDia, type PedidoDecisaoDia } from "./DialogosDecisaoDia";
import { useDecisaoDoDia } from "./useDecisaoDoDia";

function TextoDoMotivo({ j }: { j: JustificacaoDia }) {
  const { t } = useTranslation();
  const acessos = useJustificacaoDia((e) => e.acessos);
  const [texto, setTexto] = useState<string | null>(null);
  if (!textoEhSensivel(j)) return <p>{j.motivo}</p>;
  const meus = acessos.filter((a) => a.justificacaoId === j.id);
  return (
    <div className="space-y-2">
      {texto === null ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setTexto(verTextoDaJustificacao(j.id))}>
          <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("rhJust.rh.verTexto")}
        </Button>
      ) : (
        <p className="rounded-md border bg-muted/40 p-3" data-testid="rhjd-texto">{texto}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("rhJust.rh.textoSensivel")}</p>
      {meus.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label={t("rhJust.rh.quemLeu")}>
          {meus.map((a, i) => <li key={`${a.quando}-${i}`}>{t("rhJust.rh.leuEm", { quem: a.quem, quando: formatarDataHora(a.quando) })}</li>)}
        </ul>
      )}
    </div>
  );
}

/** O efeito no desconto: o que daria cada decisão (por decidir) ou o que a decisão tomada deu. */
function EfeitoNoDesconto({ j }: { j: JustificacaoDia }) {
  const { t, language } = useTranslation();
  const ficha = useEstadoRh((e) => e.fichas[j.pessoaId] ?? null);
  const { valorHora } = valorHoraDaFicha(ficha);
  const texto = (decisao: DecisaoJustificacaoDia, chaveSem: string, chaveCom: string): string => {
    const d = descontoDaDecisao(j, decisao, valorHora);
    return d && d.desconta
      ? t(chaveCom, { tempo: formatarHorasMinutos(d.minutos), total: formatarEuros(d.valor, language) })
      : t(chaveSem);
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

function BotoesDeDecisao({ aoAceitar, aoRecusar }: { aoAceitar: (d: "aceitar_paga" | "aceitar_nao_paga") => void; aoRecusar: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" className="min-h-11" onClick={() => aoAceitar("aceitar_paga")}>{t("rhJust.rh.aceitarPaga")}</Button>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => aoAceitar("aceitar_nao_paga")}>{t("rhJust.rh.aceitarNaoPaga")}</Button>
      <Button type="button" variant="outline" className="min-h-11" onClick={aoRecusar}>{t("rhJust.rh.recusar")}</Button>
    </div>
  );
}

interface CartaoProps {
  j: JustificacaoDia;
  aoDecidir: (j: JustificacaoDia, decisao: DecisaoJustificacaoDia) => void;
  aoRecusar: (j: JustificacaoDia) => void;
}

function Cartao({ j, aoDecidir, aoRecusar }: CartaoProps) {
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
      {j.estado === "pendente" && <BotoesDeDecisao aoAceitar={(d) => aoDecidir(j, d)} aoRecusar={() => aoRecusar(j)} />}
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
  const todas = useJustificacaoDia((e) => e.justificacoes);
  const [pedido, setPedido] = useState<PedidoDecisaoDia | null>(null);
  const { decidir, mensagem, executor } = useDecisaoDoDia(aoCriarFalta);
  const doDia = todas.filter((j) => j.pessoaId === pessoaId && j.data === data);
  if (doDia.length === 0 && !executor) return null;

  return (
    <section className="space-y-3" aria-label={t("rhJust.rh.titulo")} data-testid="rhjd-rh">
      <h4 className="text-sm font-medium text-muted-foreground">{t("rhJust.rh.titulo")}</h4>
      <ul className="space-y-2">
        {doDia.map((j) => (
          <Cartao key={j.id} j={j} aoDecidir={(x, d) => decidir(x, d)} aoRecusar={(x) => setPedido({ justificacao: x, tipo: "recusar", pessoaNome })} />
        ))}
      </ul>
      {mensagem && <p role={mensagem.erro ? "alert" : "status"} className={`text-sm font-medium ${mensagem.erro ? "text-destructive" : ""}`}>{mensagem.texto}</p>}
      <DialogosDecisaoDia pedido={pedido} aoFechar={() => setPedido(null)} aoDecidir={decidir} />
      {executor}
    </section>
  );
}
