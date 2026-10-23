/**
 * Os encargos da empresa (fluxo 11): a taxa da empresa, o seguro de acidentes de trabalho em percentagem, o valor por km e
 * por dia sugeridos ao registar, e a exceção de taxa DESTA pessoa (regimes com taxa reduzida). Aplica-se aos meses abertos.
 * Os valores são de exemplo, a confirmar pela contabilidade.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { definirDefinicoesCusto, definirExcecaoTaxa, useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const numero = (texto: string): number | null => {
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function CustoEncargos({ pessoaId }: { pessoaId: string }) {
  const { t } = useTranslation();
  const definicoes = useCusto((e) => e.definicoes);
  const excecao = useCusto((e) => e.excecoes[pessoaId] ?? null);
  const [taxa, setTaxa] = useState(String(definicoes.taxaEmpresa));
  const [seguro, setSeguro] = useState(String(definicoes.seguro));
  const [km, setKm] = useState(String(definicoes.valorPorKm));
  const [dia, setDia] = useState(String(definicoes.ajudaPorDia));
  const [taxaPessoa, setTaxaPessoa] = useState(excecao === null ? "" : String(excecao));
  const [aviso, setAviso] = useState("");

  const guardar = () => {
    const [t1, s1, k1, d1] = [numero(taxa), numero(seguro), numero(km), numero(dia)];
    const pessoa = taxaPessoa.trim() === "" ? null : numero(taxaPessoa);
    if (t1 === null || s1 === null || k1 === null || d1 === null || (taxaPessoa.trim() !== "" && pessoa === null)) {
      setAviso(t("rhA.custo.encargosInvalido"));
      return;
    }
    definirDefinicoesCusto({ taxaEmpresa: t1, seguro: s1, valorPorKm: k1, ajudaPorDia: d1 });
    definirExcecaoTaxa(pessoaId, pessoa);
    setAviso(t("rhA.custo.encargosGuardado"));
  };

  return (
    <Seccao titulo={t("rhA.custo.encargosTitulo")}>
      <form className="grid max-w-xl gap-3 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        <CampoTexto id="rhA-taxa" label={t("rhA.custo.taxaEmpresa")} tipo="number" min={0} step="0.01" valor={taxa} onChange={setTaxa} />
        <CampoTexto id="rhA-seguro" label={t("rhA.custo.seguro")} tipo="number" min={0} step="0.01" valor={seguro} onChange={setSeguro} />
        <CampoTexto id="rhA-taxa-pessoa" label={t("rhA.custo.excecaoPessoa")} tipo="number" min={0} step="0.01" valor={taxaPessoa} onChange={setTaxaPessoa} ajuda={t("rhA.custo.excecaoAjuda")} />
        <div className="hidden sm:block" aria-hidden="true" />
        <CampoTexto id="rhA-valor-km" label={t("rhA.custo.valorPorKm")} tipo="number" min={0} step="0.01" valor={km} onChange={setKm} />
        <CampoTexto id="rhA-valor-dia" label={t("rhA.custo.valorPorDia")} tipo="number" min={0} step="0.01" valor={dia} onChange={setDia} />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="outline" className={cn("min-h-11", FOCO)}>{t("rhA.custo.guardarEncargos")}</Button>
          <p role="status" aria-live="polite" className="text-sm">{aviso}</p>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{t("rhA.custo.encargosNota")}</p>
    </Seccao>
  );
}
