// 5/11 (Rúben, a visita real: «reconstruir tudo o que está em papel, a planta da área»). A planta da divisão na Visita: o desenho é o
// EditorPlanta (retas com a medida por cima, peças arrastadas da barra); aqui ficam os m² do chão e das paredes, que vão para as medidas
// com um toque. A planta grava-se no negócio (f.planta, JSON). A geometria está em planta.ts.
import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCatalogo } from "./v2/catalogoStore";
import { ligarAoCatalogo, type LinhaLevada } from "./ligarEstudio";
import { CHAVE_VOLTA, abrirEstudio, lerVolta } from "@/pages/prototipo-estudio/daVisita";
import { Button } from "@/components/ui/button";
import { porMedida, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { EditorPlanta } from "./EditorPlanta";
import { PLANTA_VAZIA, areaChaoM2, areaParedesM2, gravarPlanta, lerPlanta, peDireitoDoCampo, type Planta } from "./planta";

const PE_DIREITO_SEM_RESPOSTA = 2.5;
const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

export function PlantaDivisao({ ctx, d, divisao }: { ctx: Ctx; d: Negocio; divisao?: string }) {
  const [p, setP] = useState<Planta>(() => lerPlanta(d.f.planta) ?? PLANTA_VAZIA);
  const [feito, setFeito] = useState("");
  // a planta gravada por fora (ex.: «Usar esta planta» da folha) entra no desenho
  const gravada = lerPlanta(d.f.planta);
  const atual = gravada && d.f.planta !== gravarPlanta(p) ? gravada : p;

  const mudar = (np: Planta) => { setP(np); setFeito(""); ctx.A.campo(d.id, "planta", gravarPlanta(np)); };
  // 5/11 (Rúben: «sim, liga-os»): as necessidades que vieram do Estúdio, por juntar (guardam-se neste browser até se juntarem)
  const chavePendentes = `olyvia.estudio.pendentes.${d.id}`;
  const [pendentes, setPendentesEstado] = useState<LinhaLevada[]>(() => { try { return JSON.parse(localStorage.getItem(chavePendentes) ?? "[]"); } catch { return []; } });
  const setPendentes = (ls: LinhaLevada[]) => {
    setPendentesEstado(ls);
    try { if (ls.length) localStorage.setItem(chavePendentes, JSON.stringify(ls)); else localStorage.removeItem(chavePendentes); } catch { /* fica só no ecrã */ }
  };
  // 5/11 (Rúben: «botão para o Estúdio e depois botão para voltar»): a planta desenhada no Estúdio volta para o negócio
  useEffect(() => {
    const trazer = () => {
      const v = lerVolta(d.id);
      if (v && v.antes.paredes.length) { mudar(v.antes); setFeito("A planta voltou do Estúdio."); }
      if (v?.linhas?.length) setPendentes(v.linhas);
    };
    trazer();
    const aoMudar = (e: StorageEvent) => { if (e.key === CHAVE_VOLTA) trazer(); };
    window.addEventListener("storage", aoMudar);
    window.addEventListener("focus", trazer);
    return () => { window.removeEventListener("storage", aoMudar); window.removeEventListener("focus", trazer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por negócio
  }, [d.id]);
  const chao = areaChaoM2(atual.paredes);
  const peCampo = peDireitoDoCampo(d.f.diag_pe_direito_m);
  const pe = peCampo ?? PE_DIREITO_SEM_RESPOSTA;
  const paredes = areaParedesM2(atual, pe);

  const usarNasMedidas = () => {
    if (chao === null) return;
    ctx.run(() => {
      porMedida(d.visita.med, "pav", chao);
      if (paredes !== null) porMedida(d.visita.med, "par", paredes);
    });
    setFeito(`Nas medidas: chão ${nf(chao)} m²${paredes !== null ? ` e paredes ${nf(paredes)} m²` : ""}.`);
  };

  return (
    <div className="space-y-4">
      {/* 5/11: o Estúdio (o depois, as peças no catálogo, o 3D e a proposta); a planta desta visita é o antes */}
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px]"><b className="font-semibold">Estúdio</b> · desenhar como vai ficar, escolher as peças no catálogo e ver em 3D.</p>
        <Button type="button" className="min-h-11 shrink-0" onClick={() => {
          if (abrirEstudio(d.nome, { ...d.f, planta: gravarPlanta(atual) }, d.id, window.location.href)) window.open("/prototipo/estudio", "_blank");
          else setFeito("Não deu para abrir o Estúdio neste browser.");
        }}><Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />Abrir no Estúdio</Button>
      </div>
      {pendentes.length > 0 && <DoEstudio ctx={ctx} d={d} linhas={pendentes} feito={(texto) => { setPendentes([]); setFeito(texto); }} />}
      <EditorPlanta planta={atual} onMudar={mudar} divisao={divisao} />
      {/* o que a planta dá, e passá-lo às medidas */}
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px]">
          {chao === null ? "Feche a planta para ver os m²." : <>
            Chão <b>{nf(chao)} m²</b>{paredes !== null && <> · paredes <b>{nf(paredes)} m²</b></>}
            <span className="block text-sm text-muted-foreground">
              Paredes com {nf(pe)} m de pé-direito{peCampo === null ? " (o pé-direito ainda não foi respondido)" : ""}, sem as portas e as janelas da planta.
            </span>
          </>}
        </p>
        <Button type="button" className="min-h-11 shrink-0" disabled={chao === null} onClick={usarNasMedidas}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Usar nas medidas
        </Button>
      </div>
      <p role="status" className="min-h-5 text-sm text-success">{feito}</p>
    </div>
  );
}

/**
 * 5/11: o que veio do Estúdio, ligado ao Catálogo verdadeiro, para o comercial rever: cada linha com o par (o serviço ou o produto) e a
 * quantidade; as que não têm par, à parte; as instalações que o produto já traz, só a dizer. «Juntar às necessidades» põe-nas no negócio
 * (os serviços com a quantidade, como os juntados à mão; os produtos como na escolha da visita), e daí ao orçamento.
 */
function DoEstudio({ ctx, d, linhas, feito }: { ctx: Ctx; d: Negocio; linhas: LinhaLevada[]; feito: (texto: string) => void }) {
  const K = useCatalogo();
  const ligacoes = useMemo(() => ligarAoCatalogo(linhas, ctx.S?.svc ?? {}, K.produtos ?? []), [linhas, ctx.S?.svc, K.produtos]);
  const juntaveis = ligacoes.filter((g) => g.alvo && !g.vemComProduto);
  const [fora, setFora] = useState<Set<number>>(new Set());
  const semPar = ligacoes.filter((g) => !g.alvo);
  const comProduto = ligacoes.filter((g) => g.vemComProduto);
  const entram = juntaveis.filter((g) => !fora.has(ligacoes.indexOf(g)));
  const juntar = () => {
    let s = 0, pr = 0;
    ctx.run(() => {
      for (const g of entram) {
        if (!g.alvo) continue;
        if (g.alvo.tipo === "servico") { ctx.A.extra(d.id, g.alvo.id, g.q); s++; }
        else { const prod = (K.produtos ?? []).find((x) => x.id === g.alvo!.id); if (prod) { ctx.A.produto(d.id, prod, g.q); pr++; } }
      }
    });
    feito(`Nas necessidades: ${s} ${s === 1 ? "serviço" : "serviços"} e ${pr} ${pr === 1 ? "produto" : "produtos"} do Estúdio. Veja-os no passo «Necessidades do cliente».`);
  };
  return (
    <section aria-labelledby={`do-estudio-${d.id}`} className="space-y-3 rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`do-estudio-${d.id}`} className="text-[17px] font-semibold tracking-tight">Do Estúdio para as necessidades</h3>
          <p className="text-sm text-muted-foreground">O que se decidiu no Estúdio, com o par no Catálogo. Tire o que não entra e junte.</p>
        </div>
        <Button type="button" variant="ghost" className="min-h-11" aria-label="Agora não" onClick={() => feito("")}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      <ul className="space-y-2">
        {juntaveis.map((g) => {
          const i = ligacoes.indexOf(g), dentro = !fora.has(i);
          return (
            <li key={i}>
              <button type="button" role="checkbox" aria-checked={dentro} onClick={() => setFora((x) => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors", dentro ? "border-primary/40 bg-primary/[0.04]" : "border-border opacity-70")}>
                <span aria-hidden="true" className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2", dentro ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                  {dentro && <Check className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 text-[15px]">
                  <b className="font-medium">{g.alvo!.n}</b> · {g.q.toLocaleString("pt-PT")} {g.linhas[0].un}
                  <span className="block text-xs text-muted-foreground">{g.alvo!.tipo === "produto" ? "Produto" : "Serviço"} do Catálogo, de: {g.linhas.map((l) => l.n).join("; ")}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {comProduto.length > 0 && <p className="text-sm text-muted-foreground">A instalação já vem com o produto: {comProduto.flatMap((g) => g.linhas.map((l) => l.n)).join("; ")}.</p>}
      {semPar.length > 0 && <p className="text-sm text-warning-foreground">Sem par no Catálogo (junte à mão nas Necessidades): {semPar.flatMap((g) => g.linhas.map((l) => l.n)).join("; ")}.</p>}
      <Button type="button" className="min-h-11" disabled={entram.length === 0} onClick={juntar}>
        <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Juntar às necessidades ({entram.length})
      </Button>
    </section>
  );
}
