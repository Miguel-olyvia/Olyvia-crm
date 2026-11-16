// 16/11: a referência (SKU) na ficha do produto: «Gerar/Recalcular referência» (só com products.edit). Chama cat_gerar_sku_produto; se a referência atual
// foi escrita à mão (motivo sku_manual) pergunta no ecrã «substituir por <nova>?» e só então força (p_forcar = true). Mostra o que falta (siglas) em texto e
// relê o Catálogo. Nunca recalcula sozinho: depois de mudar a classificação ou os atributos só oferece (sugerir).
import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { valoresParaGravar } from "./atributosTexto";
import { lerCategoriasGestao } from "./categoriasMarcasGestao";
import { BOTAO_TEXTO, ConfirmarMudanca, Razao, protegido } from "./gestaoPecas";
import { PREVER_AMBIGUO, descreverFaltas, gerarSkuProduto, preverSku, resolverCategoria, textoSemGerar, type NomesSku, type ResultadoGerar } from "./skuDados";
import { nomesDoRamo } from "./ramoProduto";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import type { AtributoDef, No, Produto } from "./v2/catalogoModelo";

const NOTA = "text-[15px] text-muted-foreground";
const PROVISORIA = /^CAT-[0-9A-F]{10}$/i;

/** A referência nova que a base daria agora (para a pergunta de substituir); sku null se não se conseguir saber (a pergunta faz-se na mesma). `nota`: porque não se previu. */
async function novaReferencia(org: string, p: Produto, arvore: readonly No[]): Promise<{ sku: string | null; nota: string | null }> {
  const { categoria, subcategoria } = nomesDoRamo(arvore, p.no);
  if (!categoria) return { sku: null, nota: null };
  const l = await lerCategoriasGestao(org);
  if (!l.ok) return { sku: null, nota: null };
  const ids = resolverCategoria(l.v, categoria, subcategoria);
  if (ids.k === "ambiguo") return { sku: null, nota: PREVER_AMBIGUO };
  if (ids.k === "nao-existe") return { sku: null, nota: null };
  const r = await preverSku(org, ids.categoria, ids.subcategoria, valoresParaGravar(p.attrs ?? []));
  return { sku: r.ok ? r.v.sku : null, nota: null };
}

export function ReferenciaFicha({ p, arvore, atributos, real, anunciar, sugerir, aoGerar }: {
  p: Produto; arvore?: readonly No[]; atributos?: readonly AtributoDef[]; real: FichaProdutoReal; anunciar: (msg: string) => void;
  /** A classificação ou os atributos mudaram desde que se abriu a ficha (ou desde a última geração). */
  sugerir: boolean; aoGerar: () => void;
}) {
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [faltas, setFaltas] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<{ novo: string | null; faltas: string[]; nota: string | null } | null>(null);
  const [focar, setFocar] = useState(false);
  const ocupado = useRef(false), botao = useRef<HTMLButtonElement>(null);
  const rz = useId();
  useEffect(() => { if (focar) { botao.current?.focus(); setFocar(false); } }, [focar]);

  const arv = arvore ?? [];
  const nomes = (): NomesSku => ({ ...nomesDoRamo(arv, p.no), atributos: Object.fromEntries((atributos ?? []).map((d) => [d.codigo, d.nome])) });
  const semReferencia = !p.sku?.trim() || PROVISORIA.test(p.sku.trim());

  const gerar = async (forcar: boolean) => {
    if (ocupado.current) return; // guarda de reentrada (um segundo toque antes de o estado mudar)
    ocupado.current = true;
    setAGravar(true); setErro(null); setFaltas([]);
    try {
      const r = await gerarSkuProduto(real.org, p.id, forcar);
      // forçar a partir da confirmação: o erro fica na própria confirmação (aberta, para voltar atrás); senão, junto ao botão
      if (!r.ok) { setErro(r.erro); if (!forcar) setConfirmar(null); return; }
      const v: ResultadoGerar = r.v;
      if (v.gerado) {
        setConfirmar(null);
        try { await real.recarregar(); } catch { /* fica o que está */ }
        anunciar(`Referência gerada: ${v.sku}.`);
        aoGerar(); setFocar(true);
        return;
      }
      if (v.motivo === "sku_manual" && !forcar) {
        const n = arvore ? await novaReferencia(real.org, p, arv) : { sku: null, nota: null };
        setConfirmar({ novo: n.sku, nota: n.nota, faltas: descreverFaltas(v.faltas, nomes()) });
        return;
      }
      setConfirmar(null); setFaltas(descreverFaltas(v.faltas, nomes()));
      if (!v.faltas.length) setFaltas([`Não se gerou: ${textoSemGerar(v, nomes())}.`]);
      setFocar(true);
    } finally { ocupado.current = false; setAGravar(false); }
  };

  const razao = aGravar ? "A gerar a referência…" : null;
  return (
    <div className="mt-2 grid justify-items-start gap-2">
      <button ref={botao} id="ficha-gerar-sku" type="button" className={cn(BOTAO_TEXTO, sugerir && "border-primary text-foreground")} {...protegido(razao, rz, () => { void gerar(false); })}>
        {aGravar && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{semReferencia ? "Gerar referência" : "Recalcular referência"}
      </button>
      <Razao id={rz}>{razao}</Razao>
      {sugerir && <p className={NOTA}>A classificação ou os atributos mudaram. A referência não muda sozinha: recalcule-a se quiser.</p>}
      {erro && !confirmar && <p className="text-[15px] text-red-700 dark:text-red-400" role="alert">{erro}</p>}
      <div role="status" aria-label="Resultado da referência" className={NOTA}>
        {faltas.length > 0 && <ul className="list-disc pl-5">{faltas.map((f) => <li key={f}>{f}</li>)}</ul>}
      </div>
      {confirmar && (
        <ConfirmarMudanca titulo={`A referência atual foi escrita à mão: substituir por ${confirmar.novo ?? "uma referência gerada"}?`} aGravar={aGravar} erro={erro}
          texto={`A referência «${p.sku}» deixa de ser a do produto.${confirmar.novo ? " O número final confirma-se ao guardar." : ""}${confirmar.nota ? ` ${confirmar.nota}` : ""}${confirmar.faltas.length ? ` ${confirmar.faltas.join("; ")}.` : ""}`}
          onConfirmar={() => { void gerar(true); }} onVoltar={() => { setConfirmar(null); setFocar(true); }} />
      )}
    </div>
  );
}
