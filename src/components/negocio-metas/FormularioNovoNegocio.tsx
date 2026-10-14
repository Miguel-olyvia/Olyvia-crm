import { useEffect, useId, useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { AbaGeralNovoNegocio, type AcoesGeral, type ValoresGeral } from "./AbaGeralNovoNegocio";
import { AbaLevantamentoNovoNegocio, type AcoesLevantamento } from "./AbaLevantamentoNovoNegocio";
import { AbaNovo, ListaAbasNovo, Tabs, TabsContent } from "./AbasNovoNegocio";
import { N } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import { paraLevantamentoNegocio, type LevantamentoForm } from "./levantamento";
import {
  abasComErros, primeiroErro, validarNovoNegocio, type DadosCriarNegocio, type ErrosNovoNegocio, type PessoaOpcao,
} from "./novoNegocio";
import { useCamposGerais, useLevantamentoForm } from "./useEstadoNovoNegocio";

type AbaNovoNegocio = "geral" | "levantamento";
const CONTEUDO = cn("mt-0 rounded-sm", FOCO);

/** Pede o foco para um campo (pelo fim do id). Corre num instante a seguir: a aba de destino acaba de montar. */
function usePedidoFoco(id: string): (campo: string) => void {
  const [pedido, setPedido] = useState<{ campo: string; n: number } | null>(null);
  useEffect(() => {
    if (!pedido) return;
    const espera = setTimeout(() => document.getElementById(`${id}-${pedido.campo}`)?.focus(), 0);
    return () => clearTimeout(espera);
  }, [pedido, id]);
  return (campo) => setPedido((p) => ({ campo, n: (p?.n ?? 0) + 1 }));
}

interface CorpoProps {
  id: string;
  aba: AbaNovoNegocio;
  aoMudarAba: (aba: AbaNovoNegocio) => void;
  pessoas: readonly PessoaOpcao[];
  valores: ValoresGeral;
  levantamento: LevantamentoForm;
  erros: ErrosNovoNegocio;
  primeiroCampo: RefObject<HTMLButtonElement>;
  acoesGeral: AcoesGeral;
  acoesLevantamento: AcoesLevantamento;
}

/** As duas abas sublinhadas e o conteúdo de cada uma (a zona que rola); a aba com erros leva o aviso. */
function CorpoAbas(p: CorpoProps) {
  const { t } = useTranslation();
  const marcas = abasComErros(p.erros);
  const n = p.levantamento.linhas.length;
  return (
    <Tabs value={p.aba} onValueChange={(v) => p.aoMudarAba(v === "levantamento" ? "levantamento" : "geral")} className="flex min-h-0 flex-1 flex-col">
      <ListaAbasNovo aria-label={t(`${N}tabs.label`)} className="shrink-0">
        <AbaNovo value="geral" rotulo={t(`${N}tab.general`)} comErros={marcas.geral} />
        <AbaNovo
          value="levantamento" rotulo={t(`${N}tab.survey`)} contador={n} comErros={marcas.levantamento}
          contadorLeitor={t(`${N}tab.survey.count${n === 1 ? ".one" : ""}`, { n })}
        />
      </ListaAbasNovo>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <TabsContent value="geral" className={CONTEUDO}>
          <AbaGeralNovoNegocio
            id={p.id} pessoas={p.pessoas} valores={p.valores} erros={p.erros} primeiroCampo={p.primeiroCampo} acoes={p.acoesGeral}
          />
        </TabsContent>
        <TabsContent value="levantamento" className={CONTEUDO}>
          <AbaLevantamentoNovoNegocio
            id={p.id} levantamento={p.levantamento} erros={p.erros} acoes={p.acoesLevantamento}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

interface FormularioProps {
  pessoas: readonly PessoaOpcao[];
  /** O dia de hoje (AAAA-MM-DD): a data da visita por omissão. */
  hoje: string;
  /** Recebe o foco quando o painel abre: o primeiro campo. */
  primeiroCampo: RefObject<HTMLButtonElement>;
  /** Avisa que há alterações por gravar. */
  aoSujar: () => void;
  aoConfirmar: (dados: DadosCriarNegocio) => void;
}

/**
 * O formulário de "Novo negócio", com o rodapé fixo (Cancelar e Criar negócio) e duas abas: Geral (pessoa
 * obrigatória, comercial, contacto, primeiro passo) e Levantamento (opcional, só exemplo). Um envio recusado leva
 * para a primeira aba com erros e põe o foco no primeiro campo errado.
 */
export function FormularioNovoNegocio({ pessoas, hoje, primeiroCampo, aoSujar, aoConfirmar }: FormularioProps) {
  const { t } = useTranslation();
  const id = useId();
  const [aba, setAba] = useState<AbaNovoNegocio>("geral");
  const [tentou, setTentou] = useState(false);
  const pedirFoco = usePedidoFoco(id);
  const { valores, acoes } = useCamposGerais(pessoas, aoSujar);
  const lev = useLevantamentoForm(hoje, aoSujar);
  const pessoa = pessoas.find((p) => p.id === valores.pessoaId);
  const aValidar = { ...valores, pessoaId: pessoa ? valores.pessoaId : "", levantamento: lev.levantamento };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    const primeiro = primeiroErro(validarNovoNegocio(aValidar), lev.levantamento.linhas.map((l) => l.id));
    if (primeiro) {
      setAba(primeiro.aba);
      pedirFoco(primeiro.campo);
    } else if (pessoa) {
      const rotulo = (grupo: "room" | "work" | "unit", chave: string) => t(`${N}${grupo}.${chave}`);
      aoConfirmar({
        pessoa, comercial: valores.comercial, contacto: valores.contacto,
        levantamento: paraLevantamentoNegocio(lev.levantamento, rotulo),
      });
    }
  };

  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      <CorpoAbas
        id={id} aba={aba} aoMudarAba={setAba} pessoas={pessoas} valores={valores} levantamento={lev.levantamento}
        erros={tentou ? validarNovoNegocio(aValidar) : {}} primeiroCampo={primeiroCampo}
        acoesGeral={acoes}
        acoesLevantamento={lev.acoes}
      />
      <SheetFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:space-x-0">
        <SheetClose asChild>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)}>{t(`${N}cancel`)}</Button>
        </SheetClose>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${N}submit`)}</Button>
      </SheetFooter>
    </form>
  );
}
