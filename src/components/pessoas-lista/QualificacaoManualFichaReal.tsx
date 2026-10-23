// A classificação MQL/SQL à mão na ficha real: o cartão «Qualificação comercial» da página de Leads (LeadQualificationCard), em Pessoas.
// Mesmo aspeto (selo verde com o visto quando classificada; dois blocos MQL e SQL quando não) e mesma gravação (rpc_update_lead, pelo
// hook), com «limpar» a mais. As regras do Workflow NÃO acendem este selo: só esta classificação à mão. O erro da base aparece traduzido.
import { useRef } from "react";
import { CheckCircle2, Sparkles, Target, TrendingUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ErroAcao } from "@/components/pessoas/ErroAcao";
import { useExecutarAcao } from "@/components/pessoas/useExecutarAcao";
import type { QualificacaoPessoa } from "@/components/pessoas/pessoasTipos";
import type { TipoQualificacao } from "@/hooks/pessoas/useQualificarLeadPessoa";

const Q = "pessoasPagina.real.ficha.qualify.";
const BOTAO = "min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

interface QualificacaoManualFichaRealProps {
  /** A lead da pessoa (a mostrada na ficha); sem ela não há nada a classificar. */
  leadId: string | null;
  qualificacao: QualificacaoPessoa | undefined;
  podeEditar: boolean;
  aoClassificar: (tipo: TipoQualificacao) => Promise<unknown>;
}

export function QualificacaoManualFichaReal({ leadId, qualificacao, podeEditar, aoClassificar }: QualificacaoManualFichaRealProps) {
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  const executar = useExecutarAcao();
  const raiz = useRef<HTMLDivElement>(null);
  if (!leadId || !podeEditar) return null;

  const classificar = (tipo: TipoQualificacao) => {
    if (executar.aGuardar) return;
    const mensagem = t(`${Q}${tipo === null ? "cleared" : "saved"}`);
    // O botão clicado desmonta (o ramo sem classificação e o ramo com selo são árvores diferentes): o foco vai para o título da secção, que
    // fica (a secção é a mesma nos dois ramos), e não cai no corpo da página.
    const focarTitulo = () => raiz.current?.querySelector<HTMLElement>("h3")?.focus();
    executar.executar(() => aoClassificar(tipo).then(() => undefined), () => { anunciar(mensagem); focarTitulo(); }, mensagem);
  };
  const ocupado = executar.aGuardar || undefined;
  const acao = (tipo: TipoQualificacao, rotulo: string, destaque: "default" | "outline" = "outline") => (
    <Button
      key={rotulo} type="button" variant={destaque} className={cn(BOTAO, FOCO)} onClick={() => classificar(tipo)}
      aria-disabled={ocupado} aria-busy={ocupado}
    >
      {rotulo}
    </Button>
  );

  if (qualificacao) {
    const mql = qualificacao === "MQL";
    return (
      <div ref={raiz}>
      <Seccao titulo={t(`${Q}title`)}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/15">
            <CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-400" aria-hidden="true" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Badge variant="outline" aria-hidden="true">{qualificacao}</Badge>
              <span className="sr-only">{t(`${Q}${mql ? "mql" : "sql"}`)}</span>
            </p>
            <p className="text-sm text-muted-foreground">{t(`${Q}${mql ? "mqlDescription" : "sqlDescription"}`)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {mql ? acao("sql", t(`${Q}promote`), "default") : acao("mql", t(`${Q}demote`))}
          {acao(null, t(`${Q}clear`))}
        </div>
        <ErroAcao chave={executar.erro} chaveExtra={executar.erroExtra} className="mt-2" />
      </Seccao>
      </div>
    );
  }

  return (
    <div ref={raiz}>
    <Seccao titulo={t(`${Q}title`)} marca={<Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden="true" />}>
      <p className="mb-3 text-sm text-muted-foreground">{t(`${Q}hint`)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["mql", "sql"] as const).map((tipo) => {
          const Icone = tipo === "sql" ? TrendingUp : Target;
          return (
            <div key={tipo} className="space-y-2 rounded-md border border-border p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Icone className="h-4 w-4" aria-hidden="true" />
                {tipo.toUpperCase()}
              </p>
              <p className="text-sm leading-snug text-muted-foreground">{t(`${Q}${tipo}Description`)}</p>
              {acao(tipo, t(`${Q}${tipo === "mql" ? "setMql" : "setSql"}`))}
            </div>
          );
        })}
      </div>
      <ErroAcao chave={executar.erro} chaveExtra={executar.erroExtra} className="mt-2" />
    </Seccao>
    </div>
  );
}
