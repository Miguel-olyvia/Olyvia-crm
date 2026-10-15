/**
 * O painel «Ligar pessoa» / «Alterar ligação»: 1) a pessoa, 2) o vínculo legal (empresa e filial, dependentes), 3) o local de
 * trabalho (centro, que pode ser de outra filial), 4) a data de início e um motivo opcional. Se a pessoa já está ligada,
 * guardar altera a ligação (e fica no histórico).
 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { BlocoLocal, BlocoPessoa, BlocoVinculo } from "@/components/rh-exemplo/organizacao/CamposLigacao";
import { useFormLigacao } from "@/components/rh-exemplo/organizacao/useFormLigacao";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoOrganizacao, EstruturaOrg, PedidoLigacao, PessoaOrg, Resultado } from "@/components/rh-exemplo/organizacao/tipos";

export interface FormularioLigacaoProps {
  aberto: boolean;
  est: EstruturaOrg;
  estado: EstadoOrganizacao;
  pessoas: PessoaOrg[];
  /** Pessoa já escolhida (ao «Alterar ligação»); `null` deixa escolher. */
  pessoaInicial: string | null;
  aoFechar: () => void;
  aoGuardar: (pedido: PedidoLigacao) => Resultado;
}

function Corpo(p: FormularioLigacaoProps) {
  const { t } = useTranslation();
  const f = useFormLigacao(p);
  return (
    <form onSubmit={f.submeter} className="flex h-full flex-col gap-4" noValidate>
      <SheetHeader className="pr-8">
        <SheetTitle>{t(p.pessoaInicial ? "rhOrg.form.titulo.alterar" : "rhOrg.form.titulo.ligar")}</SheetTitle>
        <SheetDescription>{t("rhOrg.form.desc")}</SheetDescription>
      </SheetHeader>
      <BlocoPessoa f={f} est={p.est} pessoas={p.pessoas} />
      <BlocoVinculo f={f} est={p.est} />
      <BlocoLocal f={f} est={p.est} />
      <div className="space-y-1.5">
        <Label htmlFor="rhOrg-desde">{t("rhOrg.form.desde")}</Label>
        <input
          id="rhOrg-desde" type="date" value={f.desde} onChange={(e) => f.setDesde(e.target.value)}
          className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rhOrg-motivo">{t("rhOrg.form.motivo")}</Label>
        <Textarea id="rhOrg-motivo" rows={2} value={f.motivo} onChange={(e) => f.setMotivo(e.target.value)} />
      </div>
      {f.erro && <p role="alert" className="text-sm text-destructive">{t(`rhOrg.erro.${f.erro}`)}</p>}
      <SheetFooter className="mt-auto gap-2 sm:space-x-0">
        <Button type="button" variant="outline" className="min-h-11" onClick={p.aoFechar}>{t("rhOrg.form.cancelar")}</Button>
        <Button type="submit" className="min-h-11">{t("rhOrg.form.guardar")}</Button>
      </SheetFooter>
    </form>
  );
}

export function FormularioLigacao(p: FormularioLigacaoProps) {
  return (
    <Sheet open={p.aberto} onOpenChange={(a) => !a && p.aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{p.aberto && <Corpo {...p} />}</SheetContent>
    </Sheet>
  );
}
