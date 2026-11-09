// Protótipo (visualizador 3D): o painel da bancada composta, com os controlos da aba «Bancadas» do catálogo 3D: série, tom, acabamento e a chapa
// («Ver textura da chapa»), comprimento e profundidade, lava-loiça (modelo, montagem, acabamento), placa, torneira, móveis, «Posição dos equipamentos»
// (cm a partir da esquerda, Trocar lados, Distribuir, escorredor à esquerda), «Rodatampo e veios» e «Repor composição de exemplo». Uma alteração que
// não serve mostra a mensagem do HTML e não se aplica. Cada parte é uma linha de venda à parte.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  BANCADA_OMISSAO, SERIES_BANCADA, acabamentosDoEquipamento, distribuir, ficheiroDaChapa, infoLavaLoica, infoPlaca, lavaLoicasDaBancada, linhasDaBancada, montagensPermitidas,
  mudarChapa, placasDaBancada, selecaoChapa, torneirasDaBancada, trocarEquipamento, trocarLados, validarBancada, type ConfigBancada,
} from "./bancada";

const SEL = "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-60";
const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const Campo = ({ rotulo, children, className = "" }: { rotulo: string; children: ReactNode; className?: string }) => <label className={`grid gap-1 text-sm font-medium ${className}`}>{rotulo}{children}</label>;
const Grelha = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3">{children}</div>;
const Caixa = ({ rotulo, marcado, onMudar }: { rotulo: string; marcado: boolean; onMudar: (v: boolean) => void }) => (
  <label className="flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={marcado} onChange={(e) => onMudar(e.target.checked)} />{rotulo}</label>
);

export interface PainelBancadaProps { cfg: ConfigBancada; onMudar: (c: ConfigBancada) => void }

export function PainelBancada({ cfg, onMudar }: PainelBancadaProps) {
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);
  const { series, tone, finish, book } = selecaoChapa(cfg);
  const pedir = (next: ConfigBancada, ok = "") => {
    const erro = validarBancada(next);
    if (erro) { setMensagem({ texto: erro, erro: true }); return; }
    setMensagem(ok ? { texto: ok, erro: false } : null);
    onMudar(next);
  };
  const cm = (chave: "length" | "depth" | "sinkX" | "hobX" | "upstand", rotulo: string, min: number, max: number) => (
    <Campo rotulo={rotulo}>
      <input key={`${chave}-${cfg[chave]}`} type="number" inputMode="decimal" min={min} max={max} step={1} defaultValue={cfg[chave] / 10} className={SEL}
        onBlur={(e) => { const n = Number(e.target.value) * 10; if (n !== cfg[chave]) pedir({ ...cfg, [chave]: e.target.value.trim() === "" ? NaN : n }); }} />
    </Campo>
  );
  const equipamento = (qual: "sink" | "hob" | "tap", id: string) => {
    const next = trocarEquipamento(cfg, qual, id), mudou = next.length !== cfg.length || next.depth !== cfg.depth;
    pedir(next, mudou ? "Dimensões ajustadas para acomodar os equipamentos e os afastamentos." : "");
  };
  const acabamento = (qual: "sink" | "hob" | "tap", chave: "sinkFinish" | "hobFinish" | "tapFinish", rotulo: string, id: string) => {
    const lista = acabamentosDoEquipamento(qual, id);
    return lista.length > 1 ? (
      <Campo rotulo={rotulo}><select className={SEL} value={cfg[chave]} onChange={(e) => pedir({ ...cfg, [chave]: e.target.value })}>{lista.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></Campo>
    ) : null;
  };
  const placa = infoPlaca(cfg.hob), sink = infoLavaLoica(cfg.sink), linhas = linhasDaBancada(cfg);
  const total = linhas.reduce((s, l) => s + (l.preco ?? 0), 0);

  return (
    <section aria-label="Configurar bancada" className="w-full space-y-3 rounded-xl border border-border bg-card p-3">
      <Campo rotulo="Série da bancada">
        <select className={SEL} value={cfg.series} onChange={(e) => pedir(mudarChapa(cfg, "series", e.target.value))}>{Object.entries(SERIES_BANCADA).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select>
      </Campo>
      {series && tone && (
        <Grelha>
          <Campo rotulo="Tom"><select className={SEL} value={cfg.tone} disabled={Object.keys(series.tones).length === 1} onChange={(e) => pedir(mudarChapa(cfg, "tone", e.target.value))}>{Object.entries(series.tones).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select></Campo>
          <Campo rotulo="Acabamento"><select className={SEL} value={cfg.surface} disabled={Object.keys(tone.finishes).length === 1} onChange={(e) => pedir(mudarChapa(cfg, "surface", e.target.value))}>{Object.entries(tone.finishes).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></Campo>
        </Grelha>
      )}
      {series && tone && finish && book && (
        <div className="border-l-4 pl-3 text-sm" style={{ borderColor: tone.edge }}>
          <p className="text-[15px] font-semibold">{series.label} · {tone.label}</p>
          <p className="text-muted-foreground">Coverlam Top · 12 mm · {finish.label}</p>
          <p className="text-muted-foreground">Chapa original · {series.slab[1] / 10} × {series.slab[0] / 10} cm</p>
          <p className="text-muted-foreground">{book.label} · Ref. {finish.refs[cfg.book]}</p>
        </div>
      )}
      {series && tone && book && (
        <details className="rounded-lg border border-border p-2">
          <summary className="min-h-11 cursor-pointer content-center text-[15px]">Ver textura da chapa</summary>
          <img src={ficheiroDaChapa(book.file)} alt={`Chapa completa · ${series.label} · ${tone.label} · ${book.label}`} className="mt-2 max-h-72 rounded border border-border" loading="lazy" />
          <p className="pt-1 text-sm text-muted-foreground">{series.label} · {tone.label} · {book.label} · imagem original do fabricante</p>
          <a className="text-sm underline" href={tone.source ?? series.source} target="_blank" rel="noopener noreferrer">Ficha oficial ↗</a>
        </details>
      )}
      <Grelha>{cm("length", "Comprimento · cm", 160, 320)}{cm("depth", "Profundidade · cm", 60, 120)}</Grelha>

      <Campo rotulo="Lava-loiça"><select className={SEL} value={cfg.sink} onChange={(e) => equipamento("sink", e.target.value)}>{lavaLoicasDaBancada().map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}</select></Campo>
      <Grelha>
        <Campo rotulo="Montagem"><select className={SEL} value={cfg.mount} onChange={(e) => pedir({ ...cfg, mount: e.target.value as ConfigBancada["mount"] })}>{montagensPermitidas(cfg.sink).map((m) => <option key={m} value={m}>{m === "under" ? "Por baixo" : "Por cima"}</option>)}</select></Campo>
        {acabamento("sink", "sinkFinish", "Acabamento", cfg.sink)}
      </Grelha>
      <Campo rotulo="Placa"><select className={SEL} value={cfg.hob} onChange={(e) => equipamento("hob", e.target.value)}>{placasDaBancada().map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}</select></Campo>
      {acabamento("hob", "hobFinish", "Acabamento da placa", cfg.hob)}
      {placa && <p className="text-sm text-muted-foreground">Encastre {placa.cut[0]} × {placa.cut[1]} mm.</p>}
      <Caixa rotulo="Mostrar os móveis por baixo" marcado={cfg.cabinet} onMudar={(v) => pedir({ ...cfg, cabinet: v })} />
      <Campo rotulo="Torneira"><select className={SEL} value={cfg.tap} onChange={(e) => equipamento("tap", e.target.value)}>{torneirasDaBancada().map((f) => <option key={f.id} value={f.id}>{f.marca} · {f.nome.replace(/^Torneira /, "").replace(/ \(demo\)$/, "")}</option>)}</select></Campo>
      {acabamento("tap", "tapFinish", "Acabamento da torneira", cfg.tap)}

      <details open className="rounded-lg border border-border p-2">
        <summary className="min-h-11 cursor-pointer content-center text-[15px] font-medium">Posição dos equipamentos</summary>
        <p className="pb-2 text-sm text-muted-foreground">Centros medidos a partir da extremidade esquerda.</p>
        <Grelha>{cm("sinkX", "Lava-loiça · cm", 0, 320)}{cm("hobX", "Placa · cm", 0, 320)}</Grelha>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => pedir(trocarLados(cfg))}>Trocar lados ⇄</Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => pedir(distribuir(cfg), "Equipamentos distribuídos com espaço livre entre si.")}>Distribuir</Button>
        </div>
        {sink?.reversible && <Caixa rotulo="Escorredor à esquerda" marcado={cfg.reverse} onMudar={(v) => pedir(distribuir({ ...cfg, reverse: v }))} />}
      </details>

      <details className="rounded-lg border border-border p-2">
        <summary className="min-h-11 cursor-pointer content-center text-[15px] font-medium">Rodatampo e veios</summary>
        <div className="space-y-2 pt-1">
          {cm("upstand", "Altura do rodatampo · cm", 0, 20)}
          <div className="flex flex-wrap gap-x-4">
            <Caixa rotulo="Traseiro" marcado={cfg.back} onMudar={(v) => pedir({ ...cfg, back: v })} />
            <Caixa rotulo="Esquerdo" marcado={cfg.left} onMudar={(v) => pedir({ ...cfg, left: v })} />
            <Caixa rotulo="Direito" marcado={cfg.right} onMudar={(v) => pedir({ ...cfg, right: v })} />
          </div>
          {tone && finish && (
            <Campo rotulo="Desenho da chapa"><select className={SEL} value={cfg.book} disabled={Object.keys(tone.books).length === 1} onChange={(e) => pedir({ ...cfg, book: e.target.value })}>{Object.entries(tone.books).map(([k, b]) => <option key={k} value={k}>{b.label} · {finish.refs[k]}</option>)}</select></Campo>
          )}
          <Campo rotulo="Sentido dos veios"><select className={SEL} value={cfg.direction} onChange={(e) => pedir({ ...cfg, direction: Number(e.target.value) as 0 | 180 })}><option value={0}>Longitudinal</option><option value={180}>Longitudinal · invertido</option></select></Campo>
          <Campo rotulo="Faixa da chapa"><input type="range" min={0} max={100} step={1} value={cfg.textureOffset} className="h-11 w-full" onChange={(e) => pedir({ ...cfg, textureOffset: Number(e.target.value) })} /></Campo>
          <p className="text-sm text-muted-foreground">O desenho mantém a escala da chapa ao alterar as dimensões.</p>
        </div>
      </details>

      <p role="status" aria-live="polite" className={`min-h-5 text-sm ${mensagem?.erro ? "text-red-700" : "text-muted-foreground"}`}>{mensagem?.texto ?? ""}</p>
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => pedir({ ...BANCADA_OMISSAO }, "Composição inicial reposta.")}>Repor composição de exemplo</Button>

      <div className="rounded-lg border border-border p-2">
        <p className="text-[15px] font-medium">Peças para venda (cada uma vende-se à parte)</p>
        <ul className="divide-y divide-border text-sm">
          {linhas.map((l) => <li key={l.papel} className="flex justify-between gap-3 py-1.5"><span>{l.nome}{l.sku ? <span className="text-muted-foreground"> · {l.sku}</span> : null}</span><span className="shrink-0">{l.preco !== undefined ? eur(l.preco) : "preço a definir"}</span></li>)}
        </ul>
        <p className="pt-1 text-sm text-muted-foreground">Equipamentos e móveis: {eur(total)} (preços de demonstração; a chapa não tem preço no catálogo de origem).</p>
      </div>
      <p className="text-sm text-muted-foreground">Pré-visualização. Recortes dos lava-loiças, fixações, apoios e ventilação a validar para execução.</p>
    </section>
  );
}
