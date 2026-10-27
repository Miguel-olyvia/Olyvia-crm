/** A aba «Dados» do painel de um nó: nome, NIF, morada (fiscal ou do local), responsável e nº de pessoas. */
import { useTranslation } from "@/hooks/useTranslation";
import { ChipTipo } from "@/components/rh-exemplo/organizacao/Chips";
import { nomeEmpresa, nomeFilial } from "@/components/rh-exemplo/organizacao/textos";
import type { EstruturaOrg, NoOrg } from "@/components/rh-exemplo/organizacao/tipos";

interface Campo {
  rotulo: string;
  valor: string;
}

function camposDe(est: EstruturaOrg, no: NoOrg, t: (k: string) => string): Campo[] {
  const semResp = t("rhOrg.dados.semResponsavel");
  const nif = (valor: string): Campo => ({ rotulo: t("rhOrg.dados.nif"), valor: valor || "—" });
  const grupo = est.grupo.id === no.id ? est.grupo : null;
  const empresa = est.empresas.find((e) => e.id === no.id);
  const filial = est.filiais.find((f) => f.id === no.id);
  const centro = est.centros.find((c) => c.id === no.id);
  if (grupo) return [nif(grupo.nif), { rotulo: t("rhOrg.dados.moradaFiscal"), valor: grupo.morada || "—" }, { rotulo: t("rhOrg.dados.responsavel"), valor: grupo.responsavel || semResp }];
  if (empresa) return [nif(empresa.nif), { rotulo: t("rhOrg.dados.moradaFiscal"), valor: empresa.morada || "—" }, { rotulo: t("rhOrg.dados.responsavel"), valor: empresa.responsavel || semResp }];
  if (filial) {
    return [
      { rotulo: t("rhOrg.dados.empresa"), valor: nomeEmpresa(est, filial.empresaId) },
      nif(filial.nif || est.empresas.find((e) => e.id === filial.empresaId)?.nif || ""),
      { rotulo: t("rhOrg.dados.morada"), valor: filial.morada || "—" },
      { rotulo: t("rhOrg.dados.responsavel"), valor: filial.responsavel || semResp },
    ];
  }
  if (!centro) return [];
  return [
    { rotulo: t("rhOrg.dados.filial"), valor: nomeFilial(est, centro.filialId) },
    nif(t("rhOrg.dados.naoAplica")),
    { rotulo: t("rhOrg.dados.morada"), valor: centro.morada || "—" },
    { rotulo: t("rhOrg.dados.responsavel"), valor: centro.responsavel || semResp },
  ];
}

export function DadosNo({ est, no }: { est: EstruturaOrg; no: NoOrg }) {
  const { t } = useTranslation();
  const n = no.locais ?? no.legais;
  const campos: Campo[] = [
    { rotulo: t("rhOrg.dados.nome"), valor: no.nome },
    ...camposDe(est, no, t),
    { rotulo: no.locais !== null ? t("rhOrg.dados.trabalham") : t("rhOrg.dados.pessoas"), valor: String(n) },
  ];
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("rhOrg.dados.tipo")}</span>
        <ChipTipo tipo={no.tipo} />
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
        {campos.map((c) => (
          <div key={c.rotulo} className="contents">
            <dt className="text-sm text-muted-foreground">{c.rotulo}</dt>
            <dd className="text-sm font-medium">{c.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
