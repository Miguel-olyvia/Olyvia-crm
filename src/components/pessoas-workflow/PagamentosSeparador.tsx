import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO } from "@/components/negocio-metas/estilos";
import { paraGravar, type DadosPagamento } from "@/emylia/pagamentoCliente";
import { usePodeConfigurarPessoas } from "@/hooks/pessoas/usePodeConfigurarPessoas";
import { useDadosPagamento } from "@/hooks/pessoas/workflow/useDadosPagamento";
import { useTranslation } from "@/hooks/useTranslation";

const P = "pessoasPagina.real.workflow.pag.";
const VAZIO: DadosPagamento = { titular: null, iban: null, mbEntidade: null, mbway: null, sepaCredor: null };
type Campo = keyof DadosPagamento;
const CAMPOS: { k: Campo; ph: string }[] = [
  { k: "titular", ph: "Empresa, Lda." },
  { k: "iban", ph: "PT50 0000 0000 0000 0000 0000 0" },
  { k: "mbEntidade", ph: "12345" },
  { k: "mbway", ph: "912 345 678" },
  { k: "sepaCredor", ph: "PT00ZZZ000000" },
];

const limpo = (v: string | null) => (v ?? "").replace(/\s/g, "").toUpperCase();
/** O que a base aceita (as mesmas regras do CHECK da tabela, 20270106700000). Vazio é sempre válido. */
export function erroDoCampo(k: Campo, v: string | null): boolean {
  const x = limpo(v);
  if (!x) return false;
  if (k === "iban") return !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(x) || (x.startsWith("PT") && !/^PT50\d{21}$/.test(x));
  if (k === "mbEntidade") return !/^\d{5}$/.test(x);
  if (k === "mbway") return !/^\+?\d{9,15}$/.test(x.replace(/-/g, ""));
  if (k === "sepaCredor") return !/^[A-Z]{2}\d{2}[A-Z0-9]{4,31}$/.test(x);
  return (v ?? "").trim().length > 200;
}

/**
 * 4/11 (Rúben): o separador «Pagamentos» do Workflow de Pessoas: os dados da empresa para o cliente pagar (o titular, o IBAN da
 * transferência, a entidade Multibanco, o número MB Way e o identificador de credor SEPA do débito direto). Lê e grava pelo hook
 * useDadosPagamento (só pelas funções da base). O portal mostra a transferência sempre; as outras formas só com os seus dados.
 */
export function PagamentosSeparador({ ativo }: { ativo: boolean }) {
  const { t } = useTranslation();
  const pode = usePodeConfigurarPessoas();
  const base = useId();
  const dp = useDadosPagamento(ativo);
  const [edicao, setEdicao] = useState<DadosPagamento | null>(null);
  const [aviso, setAviso] = useState<"ok" | "erro" | null>(null);
  useEffect(() => { if (!ativo) { setEdicao(null); setAviso(null); } }, [ativo]);

  if (dp.estado === "sem-org") return <p className="text-[15px] text-muted-foreground">{t(`${P}noOrg`)}</p>;
  if (dp.estado === "erro") return (
    <div className="space-y-3">
      <p role="alert" className="text-[15px] text-destructive">{t(`${P}loadError`)}</p>
      <Button variant="outline" className={`min-h-11 ${FOCO}`} onClick={dp.recarregar}>{t(`${P}retry`)}</Button>
    </div>
  );
  if (dp.estado !== "pronto") return <p className="text-[15px] text-muted-foreground">{t(`${P}loading`)}</p>;

  const atual = edicao ?? dp.dados ?? VAZIO;
  const comErro = CAMPOS.filter((c) => erroDoCampo(c.k, atual[c.k]));
  const mudou = edicao !== null && JSON.stringify(paraGravar(edicao)) !== JSON.stringify(paraGravar(dp.dados ?? VAZIO));
  const mudar = (k: Campo, v: string) => { setAviso(null); setEdicao({ ...atual, [k]: v || null }); };
  const guardar = async () => {
    if (dp.aGuardar || !mudou || comErro.length) return;
    try {
      await dp.guardar(atual);
      setEdicao(null);
      setAviso("ok");
    } catch {
      setAviso("erro");
    }
  };

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-[15px] text-muted-foreground">{t(`${P}intro`)}</p>
      {CAMPOS.map(({ k, ph }) => {
        const id = `${base}-${k}`, erro = erroDoCampo(k, atual[k]);
        return (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={id} className="text-[15px]">{t(`${P}${k}`)}</Label>
            <Input id={id} value={atual[k] ?? ""} placeholder={ph} disabled={!pode} autoComplete="off" spellCheck={false}
              aria-invalid={erro} aria-describedby={erro ? `${id}-erro` : `${id}-ajuda`} onChange={(e) => mudar(k, e.target.value)} className="h-11 text-[15px]" />
            {erro
              ? <p id={`${id}-erro`} className="text-sm text-destructive">{t(`${P}${k}.error`)}</p>
              : <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">{t(`${P}${k}.help`)}</p>}
          </div>
        );
      })}
      {!pode && <p className="text-sm text-muted-foreground">{t(`${P}noPermission`)}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button className={`min-h-11 ${FOCO}`} disabled={!pode || !mudou || comErro.length > 0} aria-busy={dp.aGuardar} onClick={() => void guardar()}>
          {dp.aGuardar ? t(`${P}saving`) : t(`${P}save`)}
        </Button>
        <p role="status" className="text-[15px]">
          {aviso === "ok" && t(`${P}saved`)}
          {aviso === "erro" && <span className="text-destructive">{t(`${P}saveError`)}</span>}
        </p>
      </div>
    </div>
  );
}
