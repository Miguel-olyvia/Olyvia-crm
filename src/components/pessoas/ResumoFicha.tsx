// A aba "Resumo" da ficha: o seguimento (próximo contacto, aviso de regresso, último contacto), os dados da ficha
// (origem, etapa, comercial, qualificação, desde, saúde) e o contacto. A marca "exemplo" vai por secção.
import { useId, type ReactNode } from "react";
import { AlertTriangle, BellRing } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { diasParaPrazo, type Traduzir } from "@/components/negocio-metas/saudeNegocio";
import { ContactoFicha } from "./ContactoFicha";
import { textoDiaCompleto, textoUltimoContacto } from "./formatoPessoas";
import { MarcaExemplo } from "./SelosPessoa";
import type { Pessoa, ResumoPessoa } from "./pessoasTipos";

interface ResumoFichaProps {
  resumo: ResumoPessoa;
  hoje: string;
  /** Voltou a contactar: tem submissões pendentes e ainda ninguém lhe respondeu. */
  voltou: boolean;
  pendentes: number;
  aoVerSubmissoes: () => void;
}

function Seccao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 id={id} className="text-sm font-semibold text-foreground">{titulo}</h3>
        <MarcaExemplo />
      </div>
      {children}
    </section>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b border-border py-2 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** "16/10/2026", com "hoje" ou "em atraso há N dias" em texto quando for o caso. */
function textoProximo(t: Traduzir, dia: string, hoje: string): { texto: string; atrasado: boolean } {
  const data = textoDiaCompleto(dia);
  const dias = diasParaPrazo(dia, hoje) ?? 1;
  if (dias === 0) return { texto: `${data} · ${t("pessoasPagina.sum.today")}`, atrasado: false };
  if (dias > 0) return { texto: data, atrasado: false };
  const atraso = t(dias === -1 ? "pessoasPagina.sum.lateOne" : "pessoasPagina.sum.lateMany", { count: -dias });
  return { texto: `${data} · ${atraso}`, atrasado: true };
}

function ProximoContacto({ pessoa, hoje }: { pessoa: Pessoa; hoje: string }) {
  const { t } = useTranslation();
  if (!pessoa.proximoContacto) return <span className="text-muted-foreground">{t("pessoasPagina.sum.nextNone")}</span>;
  const { texto, atrasado } = textoProximo(t, pessoa.proximoContacto, hoje);
  return (
    <span className={cn("inline-flex items-center gap-1.5", atrasado && "font-medium")}>
      {atrasado && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {texto}
    </span>
  );
}

function AvisoVoltou({ pendentes, aoVer }: { pendentes: number; aoVer: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning bg-warning/20 p-3">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span><strong className="font-semibold">{t("pessoasPagina.sum.returnedTitle")}</strong> {t("pessoasPagina.sum.returnedHint")}</span>
      </p>
      {pendentes > 0 && (
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoVer}>
          {t("pessoasPagina.actions.submissions", { count: pendentes })}
        </Button>
      )}
    </div>
  );
}

function Seguimento({ resumo, hoje, voltou, pendentes, aoVerSubmissoes }: ResumoFichaProps) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  const ultimo = [textoUltimoContacto(t, pessoa.ultimoContactoDias), pessoa.resultadoContacto && t(`pessoasPagina.result.${pessoa.resultadoContacto}`)];
  return (
    <Seccao titulo={t("pessoasPagina.sum.followUp")}>
      <dl>
        {pessoa.perdida ? (
          <Linha rotulo={t("pessoasPagina.sum.lostLabel", { date: textoDiaCompleto(pessoa.perdida.data) })}>
            {t(`pessoasPagina.lost.${pessoa.perdida.motivo}`)}
          </Linha>
        ) : (
          <Linha rotulo={t("pessoasPagina.sum.next")}><ProximoContacto pessoa={pessoa} hoje={hoje} /></Linha>
        )}
      </dl>
      {voltou && <AvisoVoltou pendentes={pendentes} aoVer={aoVerSubmissoes} />}
      <dl>
        <Linha rotulo={t("pessoasPagina.sum.last")}>{ultimo.filter(Boolean).join(" · ")}</Linha>
      </dl>
    </Seccao>
  );
}

function DadosFicha({ resumo, hoje }: { resumo: ResumoPessoa; hoje: string }) {
  const { t } = useTranslation();
  const { pessoa, piorAberto } = resumo;
  return (
    <Seccao titulo={t("pessoasPagina.sum.data")}>
      <dl>
        <Linha rotulo={t("pessoasPagina.sum.origin")}>
          {t(`pessoasPagina.origin.${pessoa.origem}`)}
          {pessoa.origemDetalhe && <span className="text-muted-foreground"> · {pessoa.origemDetalhe}</span>}
        </Linha>
        <Linha rotulo={t("pessoasPagina.sum.stage")}>{t(`pessoasPagina.stage.${pessoa.etapa}`)}</Linha>
        <Linha rotulo={t("pessoasPagina.sum.rep")}>{pessoa.comercial}</Linha>
        {pessoa.qualificacao && <Linha rotulo={t("pessoasPagina.sum.qual")}>{t(`pessoasPagina.sum.qual${pessoa.qualificacao}`)}</Linha>}
        {pessoa.desde && <Linha rotulo={t("pessoasPagina.sum.since")}>{textoDiaCompleto(pessoa.desde)}</Linha>}
        <Linha rotulo={t("pessoasPagina.sum.health")}>
          {piorAberto ? <SaudeTag negocio={piorAberto} hoje={hoje} /> : <span className="text-muted-foreground">{t("pessoasPagina.sum.healthNone")}</span>}
        </Linha>
      </dl>
    </Seccao>
  );
}

export function ResumoFicha(p: ResumoFichaProps) {
  return (
    <div className="space-y-6">
      <Seguimento {...p} />
      <DadosFicha resumo={p.resumo} hoje={p.hoje} />
      <ContactoFicha pessoa={p.resumo.pessoa} />
    </div>
  );
}
