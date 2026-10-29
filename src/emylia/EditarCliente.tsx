// "Editar os dados do cliente" (29/10/2026, pedido do Rúben), no menu do negócio. Depois do contacto a fase fica só de leitura e o V1 não
// deixava mudar o nome, o telefone, o email, o NIF nem a morada da obra. Aqui mudam-se no negócio (gravam-se com ele) e, numa organização
// real, também no contacto do CRM (quem ouve: definirGuardarCliente, a página /negocios). Com o email mudado e a proposta já no portal, o
// acesso segue para o email novo (a conta do portal é a do email).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { emailOk, modoReal } from "./acessosPortal";
import { temPortal } from "./AcessoPortalNegocio";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

export interface DadosCliente { nome: string; telefone: string; email: string; nif: string; morada: string; cp: string; localidade: string; fracao: string }

/** Os dados do cliente como estão no negócio (o telefone fica vazio quando o contacto escrito era um email). */
export function dadosDoNegocio(d: Negocio): DadosCliente {
  const telEmail = d.tel.includes("@");
  return {
    nome: d.nome, telefone: telEmail ? "" : d.tel, email: d.f.email || (telEmail ? d.tel : ""), nif: d.f.nif || "",
    morada: d.f.morada || "", cp: d.f.cp || "", localidade: d.f.localidade || "", fracao: d.f.fracao || "",
  };
}

/** O que está mal (vazio se nada): o nome, um contacto (telefone ou email), o email e o NIF quando escritos. */
export function errosDados(x: DadosCliente): string[] {
  const e: string[] = [];
  if (!x.nome.trim()) e.push("Escreva o nome do cliente.");
  if (!x.telefone.trim() && !x.email.trim()) e.push("Escreva o telefone ou o email.");
  if (x.email.trim() && !emailOk(x.email.trim().toLowerCase())) e.push("O email não é válido (por exemplo nome@exemplo.pt).");
  if (x.nif.trim() && !/^\d{9}$/.test(x.nif.replace(/\s/g, ""))) e.push("O NIF tem 9 algarismos.");
  return e;
}

/** Põe os dados no negócio (sem passar pelo motor: só os campos do cliente) e devolve o que mudou. */
export function aplicarDados(d: Negocio, x: DadosCliente): (keyof DadosCliente)[] {
  const antes = dadosDoNegocio(d), mudou = (Object.keys(x) as (keyof DadosCliente)[]).filter((k) => x[k].trim() !== antes[k].trim());
  const email = x.email.trim().toLowerCase();
  d.nome = x.nome.trim();
  d.tel = x.telefone.trim() || email;
  if (email) d.f.email = email; else delete d.f.email;
  for (const k of ["nif", "morada", "cp", "localidade", "fracao"] as const) { const v = x[k].trim(); if (v) d.f[k] = k === "nif" ? v.replace(/\s/g, "") : v; else delete d.f[k]; }
  if (d.sug) for (const k of mudou) delete d.sug[k];
  d.local = [d.f.morada, d.f.cp, d.f.localidade].filter(Boolean).join(", ") || d.local;
  if (mudou.length) d.hist.push({ t: "Dados do cliente mudados: " + mudou.join(", "), q: "hoje", k: "a" });
  return mudou;
}

/* ------------------------------------------------------------------ quem grava no contacto do CRM */
type Guardar = (d: Negocio, x: DadosCliente, mudou: readonly (keyof DadosCliente)[]) => void;
let guardar: Guardar | null = null;
/** A página regista quem grava os dados no contacto do CRM. Devolve como desligar. */
export function definirGuardarCliente(fn: Guardar): () => void { guardar = fn; return () => { if (guardar === fn) guardar = null; }; }

const CAMPOS: [keyof DadosCliente, string, string?][] = [
  ["nome", "Nome"], ["telefone", "Telefone", "tel"], ["email", "Email", "email"], ["nif", "NIF"],
  ["morada", "Rua e número"], ["cp", "Código postal"], ["localidade", "Localidade"], ["fracao", "Andar / fração"],
];

export function EditarCliente({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const [x, setX] = useState<DadosCliente>(() => dadosDoNegocio(d));
  const [erros, setErros] = useState<string[]>([]);
  const emailMudou = x.email.trim().toLowerCase() !== dadosDoNegocio(d).email.trim().toLowerCase() && !!x.email.trim();
  const comPortal = modoReal() && temPortal(d);
  const [reenviar, setReenviar] = useState(true);
  const gravar = () => {
    const e = errosDados(x);
    setErros(e);
    if (e.length) return;
    ctx.run(() => {
      const mudou = aplicarDados(d, x);
      if (mudou.length) guardar?.(d, x, mudou);
      if (mudou.includes("email") && comPortal && reenviar) ctx.A.acessoPortal(d.id);
    });
    fechar();
  };
  const inp = "h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
  return (
    <form role="group" aria-label="Editar os dados do cliente" onSubmit={(e) => { e.preventDefault(); gravar(); }}
      onKeyDown={(e) => { if (e.key === "Escape") fechar(); }}
      className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <h3 className="text-[17px] font-semibold">Dados do cliente</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {CAMPOS.map(([k, l, tipo]) => (
          <label key={k} className="grid gap-1.5 text-sm font-medium">
            {l}
            <input type={tipo ?? "text"} value={x[k]} autoComplete="off" onChange={(e) => setX({ ...x, [k]: e.target.value })} className={inp} />
          </label>
        ))}
      </div>
      {emailMudou && comPortal && (
        <label className="mt-3 flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={reenviar} onChange={(e) => setReenviar(e.target.checked)} className="h-5 w-5" />
          Enviar o acesso ao portal para o email novo
        </label>
      )}
      {erros.length > 0 && <ul role="alert" className="mt-3 space-y-1 text-[15px] text-destructive">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="mt-4 flex gap-2">
        <Button type="submit">Guardar</Button>
        <Button type="button" variant="ghost" onClick={fechar}>Cancelar</Button>
      </div>
    </form>
  );
}
