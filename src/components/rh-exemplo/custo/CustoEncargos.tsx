/**
 * A taxa DESTA pessoa (fluxo 11): so para regimes com taxa reduzida; vazia, vale a TSU da empresa (23,75 %, fixa). Aplica-se aos
 * meses abertos. A TSU nao se edita (e a da entidade empregadora), o seguro de acidentes e do cargo e km e ajudas vem da regra
 * salarial: nada disso se escolhe aqui. Vem da base e grava na base (`hr.pessoas.retribuicao.edit`); sem essa permissao so se le.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useCustoExcecoes } from "@/components/rh-exemplo/hooks/useCustoExcecoes";
import { CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const numero = (texto: string): number | null => {
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

interface FormularioProps {
  pessoaId: string;
  excecao: number | null;
  podeGerir: boolean;
}

function Formulario({ pessoaId, excecao, podeGerir }: FormularioProps) {
  const { t } = useTranslation();
  const { definir: definirExcecao } = useCustoExcecoes();
  const [taxaPessoa, setTaxaPessoa] = useState(excecao === null ? "" : String(excecao));
  const [aviso, setAviso] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  const guardar = async () => {
    if (!podeGerir || aGuardar) return;
    const pessoa = taxaPessoa.trim() === "" ? null : numero(taxaPessoa);
    if (taxaPessoa.trim() !== "" && pessoa === null) {
      setAviso(t("rhA.custo.encargosInvalido"));
      return;
    }
    if (pessoa === excecao) {
      setAviso(t("rhA.custo.encargosSemMudanca"));
      return;
    }
    setAGuardar(true);
    try {
      const daPessoa = await definirExcecao(pessoaId, pessoa);
      if (!daPessoa.ok) {
        setTaxaPessoa(excecao === null ? "" : String(excecao));
        setAviso(daPessoa.mensagem ?? t("rhA.custo.encargosInvalido"));
        return;
      }
      setAviso(t("rhA.custo.encargosGuardado"));
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <>
      <form className="grid max-w-xl gap-3 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <CampoTexto id="rhA-taxa-pessoa" label={t("rhA.custo.excecaoPessoa")} tipo="number" min={0} step="0.01" valor={taxaPessoa} onChange={setTaxaPessoa} ajuda={t("rhA.custo.excecaoAjuda")} disabled={!podeGerir} />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          {podeGerir && <Button type="submit" variant="outline" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t("rhA.custo.guardarEncargos")}</Button>}
          <p role="status" aria-live="polite" className="text-sm">{aviso}</p>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{t("rhContas.encargos.nota")}</p>
    </>
  );
}

export function CustoEncargos({ pessoaId, podeGerir }: { pessoaId: string; podeGerir: boolean }) {
  const { t } = useTranslation();
  const { excecoes, aCarregar, erro } = useCustoExcecoes();

  return (
    <Seccao titulo={t("rhContas.encargos.titulo")}>
      {erro && <p role="alert" className="text-sm text-destructive">{t("rhCustos.base.erro", { erro })}</p>}
      {excecoes === null && !erro && aCarregar && (
        <p role="status" className="text-sm text-muted-foreground">{t("rhCustos.base.aCarregar")}</p>
      )}
      {excecoes !== null && (
        // Sem chave por valores: depois de guardar a lista refaz-se e o formulario nao pode perder o aviso «guardado».
        <Formulario key={pessoaId} pessoaId={pessoaId} excecao={excecoes[pessoaId] ?? null} podeGerir={podeGerir} />
      )}
    </Seccao>
  );
}
