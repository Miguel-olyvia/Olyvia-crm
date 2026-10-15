// A assinatura do contrato no portal do cliente (15/10/2026, pedido do Ruben): duas formas, à escolha.
// · Desenhar no ecrã: com o dedo ou o rato, numa área com a linha de base e o nome por baixo. O traço é suave (curvas pelos
//   pontos médios) e nítido em ecrãs de alta densidade. Só deixa assinar com traço suficiente. Devolve a imagem (PNG).
// · Chave Móvel Digital: o telemóvel e o PIN, depois o código de 6 dígitos "enviado por SMS". No protótipo é simulado
//   (qualquer código de 6 dígitos serve, e diz-se). Gera um selo: nome, data e hora, o identificador.
// Em ambas, a caixa "Li e aceito o contrato" é obrigatória. O desenho tem alternativa sem rato nem dedo: a digital.
// O selo (SeloAssinatura) mostra-se no contrato (DocsCliente) e no negócio do comercial (CaminhoObra).
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ArrowLeft, Check, Eraser, PenLine, ShieldCheck, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Assinatura } from "./motor";

/** "15/10/2026 14:35": a data e a hora de agora. */
export function agoraAssinatura(dt = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}
/** O identificador curto de uma assinatura digital (ex.: "CMD-7K3QX9"). */
export function idAssinatura(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "CMD-" + Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}
/** O telemóvel mascarado: "912345678" → "9•• ••• 678". */
export function mascararTelemovel(t: string): string {
  const d = t.replace(/\D/g, "");
  return d.length >= 9 ? `${d[0]}•• ••• ${d.slice(-3)}` : d;
}
/** Telemóvel português válido (9 dígitos a começar por 9), sem espaços. */
export const telemovelValido = (t: string) => /^9\d{8}$/.test(t.replace(/\s/g, ""));
/** O traço mínimo (em px CSS) para aceitar o desenho: evita assinar com um ponto ou um risco acidental. */
export const TRACO_MINIMO = 80;

const Botao = ({ children, onClick, ghost, disabled }: { children: ReactNode; onClick: () => void; ghost?: boolean; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={cn("min-h-12 w-full rounded-xl px-4 text-[15px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
      ghost ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50" : "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500")}>
    {children}
  </button>
);
const CAMPO = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[17px] tabular-nums tracking-wide outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

/** O selo da assinatura: a imagem do desenho, ou o carimbo da assinatura digital. */
export function SeloAssinatura({ a, compacto, meio = "Chave Móvel Digital" }: { a: Assinatura; compacto?: boolean; /** digital: como assinou (a empresa: "Certificado qualificado") */ meio?: string }) {
  if (a.tipo === "desenho" && a.imagem) {
    // a imagem já vem cortada ao traço: fica do tamanho de uma assinatura à mão
    return <img src={a.imagem} alt={`Assinatura de ${a.nome}`} className={cn("max-w-full object-contain object-left", compacto ? "h-14" : "h-20")} />;
  }
  return (
    <div className={cn("inline-flex max-w-full items-start gap-2 rounded-lg border-2 border-emerald-700/60 bg-emerald-50/60 text-emerald-900", compacto ? "px-2 py-1.5" : "px-3 py-2")}
      role="img" aria-label={`Assinado digitalmente por ${a.nome}, ${meio}${a.q ? `, ${a.q}` : ""}${a.id ? `, ${a.id}` : ""}`}>
      <ShieldCheck className={cn("shrink-0", compacto ? "mt-0.5 h-4 w-4" : "mt-0.5 h-5 w-5")} aria-hidden="true" />
      <span className="min-w-0 leading-tight">
        <span className={cn("block font-semibold", compacto ? "text-xs" : "text-sm")}>Assinado digitalmente</span>
        <span className="block truncate text-xs">{a.nome}</span>
        <span className="block text-xs text-emerald-800/80">{meio}{a.q ? ` · ${a.q}` : ""}</span>
        {a.id && <span className="block font-mono text-[11px] text-emerald-800/80">{a.id}</span>}
      </span>
    </div>
  );
}

/* ================================================================== desenhar no ecrã */
function Desenho({ nome, onPronto }: { nome: string; onPronto: (imagem: string | null) => void }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const pontos = useRef<{ x: number; y: number }[]>([]);
  const traco = useRef(0);
  const caixa = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const alargar = (p: { x: number; y: number }) => {
    const c = caixa.current;
    caixa.current = c ? { x0: Math.min(c.x0, p.x), y0: Math.min(c.y0, p.y), x1: Math.max(c.x1, p.x), y1: Math.max(c.y1, p.y) } : { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  };
  const [comprimento, setComprimento] = useState(0);
  const desenhar = useRef(false);

  // o canvas à densidade do ecrã (nítido em telemóveis), redimensionado com a caixa
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const ajustar = () => {
      const r = c.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
      if (!r.width) return;
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext("2d");
      if (g) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 2.4; g.strokeStyle = "#0f172a"; }
      traco.current = 0; caixa.current = null; setComprimento(0); onPronto(null);
    };
    ajustar();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(ajustar);
    ro.observe(c);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ponto = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** A imagem cortada ao traço (com uma margem), à densidade do ecrã: no contrato fica do tamanho de uma assinatura. */
  const imagem = (): string => {
    try {
      const c = tela.current, bx = caixa.current;
      if (!c) return "";
      if (!bx) return c.toDataURL("image/png") || "";
      const dpr = c.width / Math.max(1, c.getBoundingClientRect().width || c.width), m = 6;
      const x = Math.max(0, (bx.x0 - m) * dpr), y = Math.max(0, (bx.y0 - m) * dpr);
      const w = Math.min(c.width - x, (bx.x1 - bx.x0 + 2 * m) * dpr), h = Math.min(c.height - y, (bx.y1 - bx.y0 + 2 * m) * dpr);
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(w)); out.height = Math.max(1, Math.round(h));
      const g = out.getContext("2d");
      if (!g) return c.toDataURL("image/png") || "";
      g.drawImage(c, x, y, w, h, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    } catch { return ""; }
  };
  const comecar = (e: RPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
    desenhar.current = true;
    const p = ponto(e);
    pontos.current = [p];
    alargar(p);
    const g = tela.current?.getContext("2d");
    if (g) { g.beginPath(); g.arc(p.x, p.y, 1.1, 0, Math.PI * 2); g.fillStyle = "#0f172a"; g.fill(); }
  };
  const mover = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!desenhar.current) return;
    const p = ponto(e), L = pontos.current, ant = L[L.length - 1];
    traco.current += Math.hypot(p.x - ant.x, p.y - ant.y);
    L.push(p);
    alargar(p);
    const g = tela.current?.getContext("2d");
    if (g && L.length >= 3) {
      // uma curva pelos pontos médios: o traço fica suave mesmo com poucos eventos
      const a = L[L.length - 3], b = L[L.length - 2], c = L[L.length - 1];
      g.beginPath();
      g.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      g.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
      g.stroke();
    }
  };
  const acabar = () => {
    if (!desenhar.current) return;
    desenhar.current = false;
    setComprimento(traco.current);
    onPronto(traco.current >= TRACO_MINIMO ? imagem() || "data:image/png;base64," : null);
  };
  const limpar = () => {
    const c = tela.current, g = c?.getContext("2d");
    if (c && g) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.restore(); }
    traco.current = 0; caixa.current = null; setComprimento(0); onPronto(null);
  };
  const ok = comprimento >= TRACO_MINIMO;

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-slate-300 bg-white">
        <canvas ref={tela} aria-label={`Área para assinar: desenhe a sua assinatura com o dedo ou o rato. Alternativa sem desenhar: a Chave Móvel Digital.`}
          role="img" data-testid="tela-assinatura"
          onPointerDown={comecar} onPointerMove={mover} onPointerUp={acabar} onPointerCancel={acabar} onPointerLeave={acabar}
          className="block h-44 w-full cursor-crosshair touch-none select-none sm:h-48" />
        {/* a linha de base, o × e o nome (por baixo do traço; não apanham toques) */}
        <span aria-hidden="true" className="pointer-events-none absolute bottom-10 left-5 text-lg text-slate-400">×</span>
        <span aria-hidden="true" className="pointer-events-none absolute bottom-10 left-10 right-5 border-b border-slate-300" />
        <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-10 text-sm text-slate-500">{nome}</span>
        {comprimento === 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 text-center text-[15px] text-slate-400">Assine aqui</span>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-sm", ok ? "text-emerald-700" : "text-slate-500")} aria-live="polite">
          {ok ? <span className="inline-flex items-center gap-1"><Check className="h-4 w-4" aria-hidden="true" />Assinatura pronta</span> : comprimento > 0 ? "Continue: a assinatura está curta." : "Use o dedo ou o rato."}
        </p>
        <button type="button" onClick={limpar} disabled={comprimento === 0}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[15px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40">
          <Eraser className="h-4 w-4" aria-hidden="true" />Limpar
        </button>
      </div>
    </div>
  );
}

/* ================================================================== Chave Móvel Digital (simulada) */
function Digital({ onPronto }: { onPronto: (dados: { id: string; telemovel: string } | null) => void }) {
  const [tel, setTel] = useState("");
  const [pin, setPin] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const codigoRef = useRef<HTMLInputElement>(null);
  const podePedir = telemovelValido(tel) && /^\d{4}$/.test(pin);
  useEffect(() => { if (enviado) codigoRef.current?.focus(); }, [enviado]);
  useEffect(() => { onPronto(enviado && /^\d{6}$/.test(codigo) ? { id: idAssinatura(), telemovel: mascararTelemovel(tel) } : null); }, [enviado, codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  return !enviado ? (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[15px] font-medium">Telemóvel</span>
        <input inputMode="numeric" autoComplete="tel" maxLength={11} value={tel} onChange={(e) => setTel(e.target.value.replace(/[^\d\s]/g, ""))} placeholder="912 345 678" className={cn(CAMPO, "mt-1")} />
      </label>
      <label className="block">
        <span className="text-[15px] font-medium">PIN da Chave Móvel Digital</span>
        <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="4 dígitos" className={cn(CAMPO, "mt-1")} />
      </label>
      <Botao onClick={() => setEnviado(true)} disabled={!podePedir}>Pedir o código</Botao>
    </div>
  ) : (
    <div className="space-y-3">
      <p className="text-[15px] text-slate-700">Enviámos um código por SMS para o {mascararTelemovel(tel)}.</p>
      <label className="block">
        <span className="text-[15px] font-medium">Código de 6 dígitos</span>
        <input ref={codigoRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
          placeholder="000000" className={cn(CAMPO, "mt-1 text-center text-xl tracking-[0.4em]")} />
      </label>
      <p className="text-sm text-slate-500">Protótipo: a Chave Móvel Digital é simulada; qualquer código de 6 dígitos serve.</p>
      <button type="button" onClick={() => { setEnviado(false); setCodigo(""); }} className="min-h-11 text-[15px] font-medium text-slate-700 underline-offset-4 hover:underline">Mudar o telemóvel</button>
    </div>
  );
}

/* ================================================================== o componente */
export type AssinaturaContratoProps = {
  /** o nome de quem assina (aparece por baixo da linha e no selo) */
  nome: string;
  /** o número do contrato, para a caixa "Li e aceito" (ex.: "CT 2026/1031") */
  contrato: string;
  onAssinar: (a: Assinatura) => void;
  onCancelar: () => void;
  /** 15/10: o mesmo componente assina a adenda e o auto de receção: a frase do "Li e aceito", o botão e o "Voltar". */
  aceito?: string;
  acao?: string;
  voltar?: string;
};

export function AssinaturaContrato({ nome, contrato, onAssinar, onCancelar, aceito: textoAceito, acao = "Assinar o contrato", voltar = "Voltar ao contrato" }: AssinaturaContratoProps) {
  const [forma, setForma] = useState<"desenho" | "digital" | null>(null);
  const [imagem, setImagem] = useState<string | null>(null);
  const [digital, setDigital] = useState<{ id: string; telemovel: string } | null>(null);
  const [aceito, setAceito] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, [forma]);
  const pronto = aceito && (forma === "desenho" ? !!imagem : forma === "digital" ? !!digital : false);

  const assinar = () => {
    if (!pronto) return;
    const q = agoraAssinatura();
    onAssinar(forma === "desenho" ? { tipo: "desenho", imagem: imagem!, nome, q } : { tipo: "digital", nome, q, id: digital!.id, telemovel: digital!.telemovel });
  };

  return (
    <section aria-labelledby="assinar-titulo" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2">
        {forma && (
          <button type="button" onClick={() => { setForma(null); setImagem(null); setDigital(null); }} aria-label="Escolher outra forma de assinar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        )}
        <h2 id="assinar-titulo" ref={titulo} tabIndex={-1} className="text-xl font-semibold outline-none">
          {forma === "desenho" ? "Desenhe a sua assinatura" : forma === "digital" ? "Chave Móvel Digital" : "Como quer assinar?"}
        </h2>
      </div>

      {!forma && (
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Formas de assinar">
          {([
            ["desenho", PenLine, "Desenhar no ecrã", "Com o dedo ou o rato, como no papel."],
            ["digital", Smartphone, "Chave Móvel Digital", "Com o telemóvel e o PIN: assinatura digital."],
          ] as const).map(([k, Ic, t, sub]) => (
            <button key={k} type="button" onClick={() => setForma(k)}
              className="flex min-h-24 items-start gap-3 rounded-2xl border border-slate-300 bg-white p-4 text-left outline-none transition-colors hover:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-900" aria-hidden="true"><Ic className="h-5 w-5" /></span>
              <span><span className="block text-base font-semibold">{t}</span><span className="mt-0.5 block text-[15px] text-slate-600">{sub}</span></span>
            </button>
          ))}
        </div>
      )}

      {forma === "desenho" && <Desenho nome={nome} onPronto={setImagem} />}
      {forma === "digital" && <Digital onPronto={setDigital} />}

      {forma && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3">
          <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-slate-900" />
          <span className="text-[15px] text-slate-800">{textoAceito ?? `Li e aceito o contrato ${contrato}.`}</span>
        </label>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {forma && <div className="sm:order-2"><Botao onClick={assinar} disabled={!pronto}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />{acao}</span></Botao></div>}
        <div className="sm:order-1"><Botao ghost onClick={onCancelar}>{voltar}</Botao></div>
      </div>
    </section>
  );
}
