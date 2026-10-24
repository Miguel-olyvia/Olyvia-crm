/** Os blocos do painel «Ligar pessoa»: a pessoa, o vínculo legal (empresa e filial) e o local de trabalho (centro). */
import { Label } from "@/components/ui/label";
import { NativeSelect, type NativeSelectOption } from "@/components/ui/native-select";
import { destinoTexto } from "@/components/rh-exemplo/organizacao/textos";
import type { FormLigacao } from "@/components/rh-exemplo/organizacao/useFormLigacao";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstruturaOrg, PessoaOrg } from "@/components/rh-exemplo/organizacao/tipos";

interface Props {
  f: FormLigacao;
  est: EstruturaOrg;
}

const opcoes = <T,>(itens: T[], valor: (i: T) => string, rotulo: (i: T) => string): NativeSelectOption[] =>
  itens.map((i) => ({ value: valor(i), label: rotulo(i) }));

export function BlocoPessoa({ f, est, pessoas }: Props & { pessoas: PessoaOrg[] }) {
  const { t } = useTranslation();
  const nome = pessoas.find((x) => x.id === f.pessoaId)?.nome ?? "";
  return (
    <div className="space-y-1.5">
      <Label htmlFor="rhOrg-pessoa">{t("rhOrg.form.pessoa")}</Label>
      <NativeSelect
        id="rhOrg-pessoa" className="min-h-11" value={f.pessoaId} onValueChange={f.escolherPessoa}
        placeholder={t("rhOrg.form.pessoaPlaceholder")} options={opcoes(pessoas, (x) => x.id, (x) => x.nome)}
      />
      {f.ligada && (
        <p className="text-xs text-muted-foreground">{t("rhOrg.form.jaLigada", { nome, destino: destinoTexto(est, f.ligada, t) })}</p>
      )}
    </div>
  );
}

export function BlocoVinculo({ f, est }: Props) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{t("rhOrg.form.vinculo")}</legend>
      <div className="space-y-1.5">
        <Label htmlFor="rhOrg-empresa">{t("rhOrg.form.empresa")}</Label>
        <NativeSelect
          id="rhOrg-empresa" className="min-h-11" value={f.empresaId} onValueChange={f.escolherEmpresa}
          placeholder={t("rhOrg.form.empresaPlaceholder")} options={opcoes(est.empresas, (e) => e.id, (e) => e.nome)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rhOrg-filial">{t("rhOrg.form.filial")}</Label>
        <NativeSelect
          id="rhOrg-filial" className="min-h-11" value={f.filialId} onValueChange={f.setFilialId} disabled={!f.empresaId}
          placeholder={f.empresaId ? t("rhOrg.form.filialPlaceholder") : t("rhOrg.form.filialPrimeiro")}
          options={opcoes(f.filiaisDaEmpresa, (x) => x.id, (x) => x.nome)}
        />
      </div>
    </fieldset>
  );
}

export function BlocoLocal({ f, est }: Props) {
  const { t } = useTranslation();
  const mesmo = f.principal ? `${t("rhOrg.form.centroMesmo")} (${f.principal.nome})` : t("rhOrg.form.centroMesmo");
  const filialDe = (filialId: string): string => est.filiais.find((x) => x.id === filialId)?.nome ?? "";
  const centros = [{ value: "", label: mesmo }, ...opcoes(est.centros, (c) => c.id, (c) => `${c.nome} · ${filialDe(c.filialId)}`)];
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{t("rhOrg.form.local")}</legend>
      <div className="space-y-1.5">
        <Label htmlFor="rhOrg-centro">{t("rhOrg.form.centro")}</Label>
        <NativeSelect
          id="rhOrg-centro" className="min-h-11 text-foreground" value={f.centroId} onValueChange={f.setCentroId}
          options={centros} aria-describedby="rhOrg-centro-ajuda"
        />
        <p id="rhOrg-centro-ajuda" className="text-xs text-muted-foreground">{t("rhOrg.form.centroExplica")}</p>
      </div>
    </fieldset>
  );
}
