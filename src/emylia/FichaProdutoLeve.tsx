// 17/11: a ficha do produto na página de Produtos leve (CatalogoProdutos): lê só ESTE produto (cat_ler_produto) pelo id da rota, sem o Catálogo inteiro.
// Quando a ficha precisa de recarregar (real.recarregar: depois de gravar o preço, a classificação, os atributos, o estado…) relê só este produto, e as
// referências (categorias, marcas, modelos), que a classificação pode ter acrescentado. Os atributos lê-os a própria ficha (cat_ler_atributos_produto).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SvcId } from "./motor";
import type { Catalogo, Produto } from "./v2/catalogoModelo";
import { FichaProduto } from "./FichaProduto";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { lerProdutoFicha } from "./real/produtosLeves";
import { marcarCatalogoDesatualizado } from "./v2/catalogoStore";
import type { ServicoEscolha } from "./real/servicosDoProduto";

interface Props {
  id: string; K: Catalogo; real: FichaProdutoReal; min: number; alvo: number; voltar: () => void; anunciar: (msg: string) => void;
  nomeServico: (sid: SvcId) => string; onAbrirServico: (sid: SvcId) => void;
  /** Relê as referências da página (categorias, marcas, modelos). Sobe o erro se falhar. */
  relerReferencias?: () => Promise<void>;
  /** 23/11: os serviços da organização, para escolher o serviço que o produto traz (null: ainda a ler ou sem eles). */
  servicos?: readonly ServicoEscolha[] | null;
}

export function FichaProdutoLeve({ id, K, real, min, alvo, voltar, anunciar, nomeServico, onAbrirServico, relerReferencias, servicos }: Props) {
  const [p, setP] = useState<Produto | null>(null), [erro, setErro] = useState<string | null>(null), [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    setErro(null); setP(null);
    lerProdutoFicha(real.org, id).then(
      (r) => { if (!vivo) return; if (r.ok) setP(r.v); else setErro(r.erro); },
      (e: unknown) => { if (vivo) setErro(e instanceof Error && e.message ? e.message : "Não foi possível ler o produto."); },
    );
    return () => { vivo = false; };
  }, [real.org, id, tentativa]);

  // o produto e a organização de agora: uma releitura que chega depois de mudar de produto (ou de organização) não o substitui
  const atual = useRef({ org: real.org, id });
  atual.current = { org: real.org, id };
  const recarregar = useCallback(async () => {
    // o que se gravou na ficha também está no Catálogo partilhado (useCatalogo): fica marcado como desatualizado, como na Gestão
    marcarCatalogoDesatualizado();
    const org = real.org, doId = id;
    const [r, refs] = await Promise.allSettled([lerProdutoFicha(org, doId), relerReferencias?.()]);
    const igual = atual.current.org === org && atual.current.id === doId;
    if (igual && r.status === "fulfilled" && r.value.ok) setP(r.value.v);
    // nada de engolir: quem gravou (o Estado, o preço…) fica a saber que o ecrã não se atualizou
    const falha = r.status === "rejected" ? r.reason : r.value.ok ? refs.status === "rejected" ? refs.reason : null : new Error(r.value.erro);
    if (falha) throw falha instanceof Error ? falha : new Error("Não foi possível reler.");
  }, [real.org, id, relerReferencias]);
  const realFicha = useMemo<FichaProdutoReal>(() => ({ ...real, recarregar }), [real, recarregar]);

  if (!p) {
    return (
      <div>
        <Button variant="ghost" className="min-h-11 gap-2 px-0 text-[15px] font-medium text-muted-foreground" onClick={voltar}><ArrowLeft className="h-5 w-5" aria-hidden="true" />Voltar ao Catálogo</Button>
        {erro
          ? <p role="alert" className="mt-3 text-[15px] text-destructive">{erro} <Button variant="outline" className="ml-2 min-h-11 text-[15px]" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</Button></p>
          : <p role="status" className="mt-3 text-[15px] text-muted-foreground">A ler o produto…</p>}
      </div>
    );
  }
  return (
    <FichaProduto key={id} p={p} min={min} alvo={alvo} real={realFicha} atributos={K.atributos} arvore={K.arvore} marcas={K.marcas} modelos={K.modelos}
      voltar={voltar} anunciar={anunciar} nomeServico={nomeServico} onAbrirServico={onAbrirServico} servicos={servicos} />
  );
}
