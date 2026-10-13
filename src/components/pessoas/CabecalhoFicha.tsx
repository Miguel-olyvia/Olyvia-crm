import { useTranslation } from "@/hooks/useTranslation";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { selosCabecalho } from "./acoesPessoa";
import { AvatarPessoa } from "./AvatarPessoa";
import type { ResumoPessoa } from "./pessoasTipos";
import { MarcaExemplo, SeloEtapa, SeloPapel, SeloPerdida, SeloQualificacao, SeloVoltou } from "./SelosPessoa";

/** Os selos em texto: papel, etapa (se não repete o papel), "Voltou a contactar", MQL/SQL e "Perdida". */
function LinhaSelos({ resumo, voltou }: { resumo: ResumoPessoa; voltou: boolean }) {
  const { pessoa } = resumo;
  return (
    <div className="flex flex-wrap gap-1.5">
      {selosCabecalho(resumo.papel, pessoa.etapa).map((s) =>
        s.tipo === "papel" ? <SeloPapel key="papel" papel={s.valor} /> : <SeloEtapa key="etapa" etapa={s.valor} />,
      )}
      {voltou && <SeloVoltou />}
      {pessoa.qualificacao && <SeloQualificacao qualificacao={pessoa.qualificacao} />}
      {pessoa.perdida && <SeloPerdida />}
    </div>
  );
}

/** O cabeçalho fixo da ficha: avatar, nome (e "Empresa"), selos e a linha "Empresa · Distrito · Comercial". */
export function CabecalhoFicha({ resumo, voltou }: { resumo: ResumoPessoa; voltou: boolean }) {
  const { t } = useTranslation();
  const { pessoa } = resumo;
  const linha = [pessoa.empresa?.nome, pessoa.distrito, t("pessoasPagina.head.rep", { name: pessoa.comercial })]
    .filter(Boolean)
    .join(" · ");
  return (
    <SheetHeader className="flex-row items-start gap-3 space-y-0 p-6 pb-4 pr-12 text-left">
      <AvatarPessoa nome={pessoa.nome} />
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="text-xl">{pessoa.nome}</SheetTitle>
          {pessoa.empresa && (
            <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
              {t("pessoasPagina.head.company")}
            </span>
          )}
        </div>
        <LinhaSelos resumo={resumo} voltou={voltou} />
        <div className="flex flex-wrap items-center gap-2">
          <SheetDescription>{linha}</SheetDescription>
          <MarcaExemplo />
        </div>
      </div>
    </SheetHeader>
  );
}
