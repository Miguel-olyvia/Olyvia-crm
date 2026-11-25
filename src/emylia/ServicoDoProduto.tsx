// 23/11: «Serviço que traz» na ficha do produto (página leve de Produtos): escolher o serviço que instala o produto e o fator (quantas unidades do serviço por unidade
// do produto), ou tirá-lo. Grava direto, só isso (cat_definir_servico_produto, servicosDoProduto.ts), como o PVP e o Estado; depois relê o produto.
import { useMemo, useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { numero } from "./pecas";
import { Procurar } from "./CriarNoCatalogo";
import { Campo, Num } from "./pecasForm";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { definirServicoDoProduto, fatorValido, opcoesServicos, type ServicoEscolha } from "./real/servicosDoProduto";

const NOTA = "text-[15px] text-muted-foreground";
const texto = (v: number) => String(v).replace(".", ",");

interface Props {
  produto: { id: string; n: string; servico?: string; fatorServico?: number; un: string };
  servicos: readonly ServicoEscolha[]; real: FichaProdutoReal; anunciar: (msg: string) => void;
}

export function ServicoDoProduto({ produto, servicos, real, anunciar }: Props) {
  const atual = produto.servico ?? null;
  const nomeDe = (id: string | null) => (id ? servicos.find((s) => s.id === id)?.nome ?? "um serviço que já não está no Catálogo" : null);
  const [escolhido, setEscolhido] = useState<string | null>(atual);
  const [fator, setFator] = useState(texto(produto.fatorServico ?? 1));
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const opcoes = useMemo(() => opcoesServicos(servicos).filter((o) => o.v !== escolhido), [servicos, escolhido]);
  const f = numero(fator);
  const fatorOk = !escolhido || fatorValido(f);
  const mudou = escolhido !== atual || (!!escolhido && fatorOk && f !== (produto.fatorServico ?? 1));

  const gravar = async (servico: string | null) => {
    setErro(null);
    if (servico && !fatorValido(f)) { setErro("O fator tem de ser um número maior que zero."); return; }
    setAGravar(true);
    const r = await definirServicoDoProduto(real.org, produto.id, servico, servico ? f : 1);
    if (!r.ok) { setAGravar(false); setErro(r.erro); return; }
    anunciar(servico ? `${produto.n} passa a trazer ${nomeDe(servico)}.` : `${produto.n} já não traz serviço.`);
    try { await real.recarregar(); } catch { /* a ficha diz o que gravou; a releitura fica para depois */ }
    setAGravar(false);
  };

  if (!real.podeEditar) {
    return <p className={cn(NOTA, "mt-3")}>{atual ? `Traz ${nomeDe(atual)} (${texto(produto.fatorServico ?? 1)} por ${produto.un}).` : "Não traz nenhum serviço."}</p>;
  }
  return (
    <div className="mt-3 grid gap-4">
      <p className={NOTA}>Escolhido na visita, o produto junta este serviço ao orçamento (ex.: a sanita traz a instalação). Sem serviço, só se vende.</p>
      {escolhido ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-3">
          <Wrench className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[15px] font-medium">{nomeDe(escolhido)}</span>
          <Button variant="outline" className="min-h-11 text-[15px]" disabled={aGravar} onClick={() => setEscolhido(null)}>Trocar</Button>
        </div>
      ) : (
        <Procurar rot="Serviço que traz" ph="Procurar serviço" opcoes={opcoes} onEscolher={(v) => setEscolhido(v)} />
      )}
      {escolhido && (
        <div className="max-w-xs">
          <Campo rot={`Quantas unidades do serviço por ${produto.un}`}>{(id) => <Num id={id} v={fator} set={setFator} invalido={!fatorOk} />}</Campo>
        </div>
      )}
      {erro && <p role="alert" className="text-[15px] text-destructive">{erro}</p>}
      {(mudou || aGravar) && (
        <div className="flex flex-wrap gap-3">
          <Button className="min-h-11 text-[15px]" disabled={aGravar || !fatorOk} onClick={() => void gravar(escolhido)}>{aGravar ? "A gravar…" : escolhido ? "Gravar o serviço" : "Tirar o serviço"}</Button>
          {!aGravar && <Button variant="ghost" className="min-h-11 text-[15px]" onClick={() => { setEscolhido(atual); setFator(texto(produto.fatorServico ?? 1)); setErro(null); }}>Desfazer</Button>}
        </div>
      )}
    </div>
  );
}
