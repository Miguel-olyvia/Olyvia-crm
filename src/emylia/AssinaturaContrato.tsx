// A assinatura do contrato no portal do cliente (15/10/2026; 21/10: sem caneta, a pedido do Ruben). Duas formas, à escolha:
// · Chave Móvel Digital: o telemóvel e o PIN, depois o código de 6 dígitos. É assinatura qualificada (eIDAS), com o valor
//   da assinatura à mão. No protótipo é simulada (qualquer código de 6 dígitos serve, e diz-se).
// · Código por SMS: as regras do sistema da Olyvia original (edge function sms-otp, SMS pela SMSAPI; a assinatura fica em
//   client_contract_parties com a hora, o IP e o browser, por validate-contract-signature): código de 6 dígitos para o
//   telemóvel do cliente, válido 5 minutos, 5 tentativas, reenviar só ao fim de 60 s e no máximo 3 códigos em 10 minutos.
//   É assinatura eletrónica simples/avançada: vale, mas o contrato deve dizer que as partes a aceitam. No protótipo o
//   "SMS" aparece no ecrã.
// Desenhar no ecrã deixou de existir; as assinaturas desenhadas antes continuam a mostrar-se (SeloAssinatura).
// Em ambas, a caixa "Li e aceito o contrato" é obrigatória. O selo mostra-se no contrato (DocsCliente) e no negócio (CaminhoObra).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, MessageSquareText, PenLine, ShieldCheck, Smartphone } from "lucide-react";
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

const Botao = ({ children, onClick, ghost, disabled }: { children: ReactNode; onClick: () => void; ghost?: boolean; disabled?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={cn("min-h-12 w-full rounded-xl px-4 text-[15px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
      ghost ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50" : "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500")}>
    {children}
  </button>
);
const CAMPO = "h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[17px] tabular-nums tracking-wide outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

/** O selo da assinatura: a imagem do desenho, ou o carimbo da assinatura digital. */
export function SeloAssinatura({ a, compacto, meio: meioDado }: { a: Assinatura; compacto?: boolean; /** digital: como assinou (a empresa: "Certificado qualificado") */ meio?: string }) {
  const meio = meioDado ?? (a.tipo === "sms" ? `Código por SMS${a.telemovel ? ` · ${a.telemovel}` : ""}` : "Chave Móvel Digital");
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

/* ================================================================== código por SMS (simulado) */
/** 21/10: as regras da sms-otp da Olyvia original: 5 tentativas por código, reenviar ao fim de 60 s, no máximo 3 códigos em 10 minutos. */
export const TENTATIVAS_SMS = 5, ESPERA_SMS = 60, CODIGOS_SMS = 3;
/** O texto do SMS, igual ao da sms-otp. */
export const textoSms = (codigo: string) => `O seu código de verificação é: ${codigo}. Válido por 5 minutos.`;
/** Um código de 6 dígitos (no protótipo aparece no ecrã, como se fosse o SMS; na app real vem do fornecedor de SMS). */
export const novoCodigoSms = () => String(Math.floor(100000 + Math.random() * 900000));
/** O identificador curto de uma assinatura por SMS (ex.: "SMS-7K3QX9"). */
export const idAssinaturaSms = () => idAssinatura().replace(/^CMD-/, "SMS-");

function Sms({ telemovel, onPronto }: { telemovel?: string; onPronto: (dados: { id: string; telemovel: string } | null) => void }) {
  // o número é o do cliente no negócio: a assinatura prova a posse desse telemóvel (se não houver, pede-se)
  const fixo = !!telemovel && telemovelValido(telemovel);
  const [tel, setTel] = useState(fixo ? telemovel! : "");
  const [certo, setCerto] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [restam, setRestam] = useState(TENTATIVAS_SMS);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [espera, setEspera] = useState(0);
  const [enviados, setEnviados] = useState(0);
  const codigoRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (certo) codigoRef.current?.focus(); }, [certo]);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);
  const enviar = () => {
    if (enviados >= CODIGOS_SMS) { setErro("Demasiados pedidos. Aguarde alguns minutos antes de tentar novamente."); return; }
    setEnviados((n) => n + 1); setCerto(novoCodigoSms()); setCodigo(""); setRestam(TENTATIVAS_SMS); setErro(""); setOk(false); setEspera(ESPERA_SMS); onPronto(null);
  };
  const escrever = (v: string) => {
    const c = v.replace(/\D/g, "").slice(0, 6);
    setCodigo(c);
    if (c.length < 6 || !certo) return;
    if (c === certo) { setOk(true); setErro(""); onPronto({ id: idAssinaturaSms(), telemovel: mascararTelemovel(tel) }); return; }
    const r = restam - 1;
    setRestam(r); setCodigo("");
    if (r <= 0) { setCerto(null); setEspera(0); setErro("Número máximo de tentativas excedido. Solicite um novo código."); }
    else setErro(`Código incorreto. ${r === 1 ? "Resta 1 tentativa" : `Restam ${r} tentativas`}.`);
  };

  if (!certo) return (
    <div className="space-y-3">
      {fixo
        ? <p className="text-[15px] text-slate-700">Enviamos um código de 6 dígitos para o telemóvel {mascararTelemovel(tel)}, o que nos deu. Se não é o seu, fale connosco antes de assinar.</p>
        : <label className="block">
            <span className="text-[15px] font-medium">Telemóvel</span>
            <input inputMode="numeric" autoComplete="tel" maxLength={11} value={tel} onChange={(e) => setTel(e.target.value.replace(/[^\d\s]/g, ""))} placeholder="912 345 678" className={cn(CAMPO, "mt-1")} />
          </label>}
      {erro && <p role="alert" className="text-[15px] text-red-700">{erro}</p>}
      <Botao onClick={enviar} disabled={!telemovelValido(tel)}>Enviar o código por SMS</Botao>
    </div>
  );
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-slate-700">Enviámos um código por SMS para o {mascararTelemovel(tel)}. É válido durante 5 minutos.</p>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Protótipo, SMS simulado: «{textoSms(certo)}» <span className="sr-only">Código: </span><b className="font-mono tracking-widest" data-testid="codigo-sms">{certo}</b></p>
      <label className="block">
        <span className="text-[15px] font-medium">Código de 6 dígitos</span>
        <input ref={codigoRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => escrever(e.target.value)} disabled={ok}
          aria-invalid={!!erro} aria-describedby={erro ? "sms-erro" : undefined} placeholder="000000" className={cn(CAMPO, "mt-1 text-center text-xl tracking-[0.4em]")} />
      </label>
      {ok
        ? <p className="flex items-center gap-1.5 text-[15px] text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" />Código confirmado.</p>
        : erro ? <p id="sms-erro" role="alert" className="text-[15px] text-red-700">{erro}</p> : null}
      {!ok && (
        <button type="button" onClick={enviar} disabled={espera > 0} className="min-h-11 text-[15px] font-medium text-slate-700 underline-offset-4 hover:underline disabled:text-slate-400 disabled:no-underline">
          {espera > 0 ? `Pedir outro código daqui a ${espera} s` : "Não recebi: enviar outro código"}
        </button>
      )}
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
  /** 21/10: o telemóvel do cliente no negócio, para onde vai o código por SMS */
  telemovel?: string;
  /** o número do contrato, para a caixa "Li e aceito" (ex.: "CT 2026/1031") */
  contrato: string;
  onAssinar: (a: Assinatura) => void;
  onCancelar: () => void;
  /** 15/10: o mesmo componente assina a adenda e o auto de receção: a frase do "Li e aceito", o botão e o "Voltar". */
  aceito?: string;
  acao?: string;
  voltar?: string;
};

export function AssinaturaContrato({ nome, telemovel, contrato, onAssinar, onCancelar, aceito: textoAceito, acao = "Assinar o contrato", voltar = "Voltar ao contrato" }: AssinaturaContratoProps) {
  const [forma, setForma] = useState<"sms" | "digital" | null>(null);
  const [digital, setDigital] = useState<{ id: string; telemovel: string } | null>(null);
  const [aceito, setAceito] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, [forma]);
  const pronto = aceito && !!forma && !!digital;

  const assinar = () => {
    if (!pronto) return;
    const q = agoraAssinatura();
    onAssinar({ tipo: forma!, nome, q, id: digital!.id, telemovel: digital!.telemovel });
  };

  return (
    <section aria-labelledby="assinar-titulo" className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2">
        {forma && (
          <button type="button" onClick={() => { setForma(null); setDigital(null); }} aria-label="Escolher outra forma de assinar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
        )}
        <h2 id="assinar-titulo" ref={titulo} tabIndex={-1} className="text-xl font-semibold outline-none">
          {forma === "sms" ? "Código por SMS" : forma === "digital" ? "Chave Móvel Digital" : "Como quer assinar?"}
        </h2>
      </div>

      {!forma && (
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Formas de assinar">
          {([
            ["digital", Smartphone, "Chave Móvel Digital", "Com o telemóvel e o PIN: assinatura digital qualificada."],
            ["sms", MessageSquareText, "Código por SMS", "Recebe um código no telemóvel e escreve-o aqui."],
          ] as const).map(([k, Ic, t, sub]) => (
            <button key={k} type="button" onClick={() => setForma(k)}
              className="flex min-h-24 items-start gap-3 rounded-2xl border border-slate-300 bg-white p-4 text-left outline-none transition-colors hover:border-slate-900 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-900" aria-hidden="true"><Ic className="h-5 w-5" /></span>
              <span><span className="block text-base font-semibold">{t}</span><span className="mt-0.5 block text-[15px] text-slate-600">{sub}</span></span>
            </button>
          ))}
        </div>
      )}

      {forma === "sms" && <Sms telemovel={telemovel} onPronto={setDigital} />}
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
