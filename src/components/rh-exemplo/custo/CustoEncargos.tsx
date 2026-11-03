/**
 * Os encargos da empresa (fluxo 11): a taxa da empresa, o seguro de acidentes de trabalho em percentagem, o valor por km e
 * por dia sugeridos ao registar, e a exceção de taxa DESTA pessoa (regimes com taxa reduzida). Aplica-se aos meses abertos.
 * A taxa da empresa, o seguro, o valor por km e por dia são POR ORGANIZAÇÃO: editá-los aqui muda o custo de todas as pessoas desta
 * organização. Só a exceção é da pessoa. Vêm da base e gravam na base (`hr.pessoas.retribuicao.edit`); sem essa permissão só se leem.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useCustoDefinicoes } from "@/components/rh-exemplo/hooks/useCustoDefinicoes";
import { useCustoExcecoes } from "@/components/rh-exemplo/hooks/useCustoExcecoes";
import { CampoTexto } from "@/components/rh-exemplo/form/Campos";
import type { DefinicoesCusto } from "@/components/rh-exemplo/lib/custoMes";
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
  definicoes: DefinicoesCusto;
  excecao: number | null;
  podeGerir: boolean;
}

function Formulario({ pessoaId, definicoes, excecao, podeGerir }: FormularioProps) {
  const { t } = useTranslation();
  const { guardar: guardarDefinicoes } = useCustoDefinicoes();
  const { definir: definirExcecao } = useCustoExcecoes();
  const [taxa, setTaxa] = useState(String(definicoes.taxaEmpresa));
  const [seguro, setSeguro] = useState(String(definicoes.seguro));
  const [km, setKm] = useState(String(definicoes.valorPorKm));
  const [dia, setDia] = useState(String(definicoes.ajudaPorDia));
  const [taxaPessoa, setTaxaPessoa] = useState(excecao === null ? "" : String(excecao));
  const [aviso, setAviso] = useState("");
  const [aGuardar, setAGuardar] = useState(false);

  const guardar = async () => {
    if (!podeGerir || aGuardar) return;
    const [t1, s1, k1, d1] = [numero(taxa), numero(seguro), numero(km), numero(dia)];
    const pessoa = taxaPessoa.trim() === "" ? null : numero(taxaPessoa);
    if (t1 === null || s1 === null || k1 === null || d1 === null || (taxaPessoa.trim() !== "" && pessoa === null)) {
      setAviso(t("rhA.custo.encargosInvalido"));
      return;
    }
    // So se chama cada RPC se o que ela guarda mudou (as definicoes sao da organizacao; a excecao e so desta pessoa).
    const mudouDefinicoes = t1 !== definicoes.taxaEmpresa || s1 !== definicoes.seguro || k1 !== definicoes.valorPorKm || d1 !== definicoes.ajudaPorDia;
    const mudouExcecao = pessoa !== excecao;
    if (!mudouDefinicoes && !mudouExcecao) {
      setAviso(t("rhA.custo.encargosSemMudanca"));
      return;
    }
    setAGuardar(true);
    try {
      if (mudouDefinicoes) {
        const porOrganizacao = await guardarDefinicoes({ taxaEmpresa: t1, seguro: s1, valorPorKm: k1, ajudaPorDia: d1 });
        if (!porOrganizacao.ok) {
          setAviso(porOrganizacao.mensagem ?? t("rhA.custo.encargosInvalido"));
          return;
        }
      }
      if (mudouExcecao) {
        const daPessoa = await definirExcecao(pessoaId, pessoa);
        if (!daPessoa.ok) {
          // As definicoes (se mudaram) ja ficaram na base: diz-se, e a taxa desta pessoa volta ao que a base tem.
          setTaxaPessoa(excecao === null ? "" : String(excecao));
          const motivo = daPessoa.mensagem ?? t("rhA.custo.encargosInvalido");
          setAviso(mudouDefinicoes ? t("rhA.custo.encargosParcial", { erro: motivo }) : motivo);
          return;
        }
      }
      setAviso(t("rhA.custo.encargosGuardado"));
    } finally {
      setAGuardar(false);
    }
  };

  return (
    <>
      <form className="grid max-w-xl gap-3 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <CampoTexto id="rhA-taxa" label={t("rhA.custo.taxaEmpresa")} tipo="number" min={0} step="0.01" valor={taxa} onChange={setTaxa} disabled={!podeGerir} />
        <CampoTexto id="rhA-seguro" label={t("rhA.custo.seguro")} tipo="number" min={0} step="0.01" valor={seguro} onChange={setSeguro} disabled={!podeGerir} />
        <CampoTexto id="rhA-taxa-pessoa" label={t("rhA.custo.excecaoPessoa")} tipo="number" min={0} step="0.01" valor={taxaPessoa} onChange={setTaxaPessoa} ajuda={t("rhA.custo.excecaoAjuda")} disabled={!podeGerir} />
        <div className="hidden sm:block" aria-hidden="true" />
        <CampoTexto id="rhA-valor-km" label={t("rhA.custo.valorPorKm")} tipo="number" min={0} step="0.01" valor={km} onChange={setKm} disabled={!podeGerir} />
        <CampoTexto id="rhA-valor-dia" label={t("rhA.custo.valorPorDia")} tipo="number" min={0} step="0.01" valor={dia} onChange={setDia} disabled={!podeGerir} />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          {podeGerir && <Button type="submit" variant="outline" disabled={aGuardar} className={cn("min-h-11", FOCO)}>{t("rhA.custo.guardarEncargos")}</Button>}
          <p role="status" aria-live="polite" className="text-sm">{aviso}</p>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{t("rhA.custo.encargosNota")}</p>
    </>
  );
}

export function CustoEncargos({ pessoaId, podeGerir }: { pessoaId: string; podeGerir: boolean }) {
  const { t } = useTranslation();
  const { definicoes, aCarregar: aCarregarDefinicoes, erro: erroDefinicoes } = useCustoDefinicoes();
  const { excecoes, aCarregar: aCarregarExcecoes, erro: erroExcecoes } = useCustoExcecoes();
  const erro = erroDefinicoes ?? erroExcecoes;
  const pronto = definicoes !== null && excecoes !== null;

  return (
    <Seccao titulo={t("rhA.custo.encargosTitulo")}>
      {erro && <p role="alert" className="text-sm text-destructive">{t("rhCustos.base.erro", { erro })}</p>}
      {!pronto && !erro && (aCarregarDefinicoes || aCarregarExcecoes) && (
        <p role="status" className="text-sm text-muted-foreground">{t("rhCustos.base.aCarregar")}</p>
      )}
      {pronto && (
        // Sem chave por valores: depois de guardar a lista refaz-se e o formulario nao pode perder o aviso «guardado».
        <Formulario key={pessoaId} pessoaId={pessoaId} definicoes={definicoes} excecao={excecoes[pessoaId] ?? null} podeGerir={podeGerir} />
      )}
    </Seccao>
  );
}
