// A entrada no Portal do Fornecedor simulado (20/10, demo), com o aspeto dos ecrãs de acesso do portal real (SupplierPortalLayout.tsx):
// · convidado: o primeiro acesso (abrir o convite → definir password → confirmar os dados da empresa → concluído), que corre a mesma regra do
//   portal real (submeterPortal, via primeiroAcessoPortal): o fornecedor passa a ativo e a ficha no CRM mostra "Ativo desde";
// · revogado ou sem acesso: "Acesso revogado" / "Sem acesso ativo", sem nenhuma ação sobre encomendas.
import { useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, KeyRound, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtD } from "../inventario/base";
import { executar, useInventario } from "../inventario/loja";
import type { Fornecedor } from "../inventario/tipos";
import { FormDados } from "./CatalogoDadosPortal";
import { dadosDoFornecedor, primeiroAcessoPortal, type DadosFornPortal } from "./regrasPortal";

export function SemAcesso({ s, aoVoltar, rotuloVoltar = "Voltar ao CRM" }: { s: Fornecedor; aoVoltar: () => void; rotuloVoltar?: string }) {
  const revogado = s.portal === "revoked";
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {revogado ? <ShieldOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" /> : <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />}
        </div>
        <h1 className="text-lg font-semibold text-foreground">{revogado ? "Acesso revogado" : "Sem acesso ativo"}</h1>
        <p className="text-[15px] text-muted-foreground">
          {revogado ? `${s.company || "A empresa"} revogou o acesso de ${s.name} ao portal. Contacte a empresa para voltar a ter acesso.` : "A sua conta não tem nenhum acesso ativo ao portal. Contacte a empresa que o convidou."}
        </p>
        <Button className="h-11 w-full gap-2" variant="outline" onClick={aoVoltar}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{rotuloVoltar}</Button>
      </div>
    </div>
  );
}

const PASSOS = ["Convite", "Password", "Dados da empresa", "Concluído"] as const;
/** 23/10 (2.0): a password já trocada na entrada da app não se guarda aqui (a regra só a valida): passa esta, com o tamanho mínimo. */
const PASSWORD_JA_DEFINIDA = "(definida no 1.º acesso da app)";

/** `aoDefinirPassword` (22/10): o login dos portais guarda na conta a password definida aqui (acessosPortal.ts).
 *  `semPassword` (23/10, 2.0): a password trocou-se na entrada da app (App.tsx): o passo "Password" sai, para não a pedir duas vezes. */
export function PrimeiroAcesso({ s, aoConcluir, aoDefinirPassword, semPassword }: { s: Fornecedor; aoConcluir: () => void; aoDefinirPassword?: (pw: string) => void; semPassword?: boolean }) {
  const db = useInventario();
  const [passo, setPasso] = useState(0);
  const [pw0, setPw] = useState({ password: "", password2: "" });
  const pw = semPassword ? { password: PASSWORD_JA_DEFINIDA, password2: PASSWORD_JA_DEFINIDA } : pw0;
  // os passos à vista (sem o da password, se já se trocou) e o número de cada um
  const visiveis = PASSOS.map((t, i) => ({ t, i })).filter((x) => !(semPassword && x.i === 1));
  const anterior = (p: number): number => (semPassword && p === 2 ? 0 : p - 1);
  const [d, setD] = useState<DadosFornPortal>(() => dadosDoFornecedor(db, s.id));
  const [erro, setErro] = useState("");
  const email = s.invite?.email || s.email;
  const seguinte = (): void => {
    setErro("");
    if (passo === 1) {
      if (pw.password.length < 8) { setErro("Password com pelo menos 8 caracteres."); return; }
      if (pw.password !== pw.password2) { setErro("As passwords não coincidem."); return; }
    }
    if (passo === 2) {
      const r = executar((x) => primeiroAcessoPortal(x, s.id, pw, d));
      if (!r.ok) { setErro(r.erro); return; }
      if (!semPassword) aoDefinirPassword?.(pw.password);
    }
    setPasso(semPassword && passo === 0 ? 2 : passo + 1);
  };
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Primeiro acesso">
        {visiveis.map(({ t, i }, k) => (
          <li key={t} aria-current={i === passo ? "step" : undefined}
            className={i === passo ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground" : i < passo ? "rounded-full bg-primary/10 px-3 py-1 text-primary" : "rounded-full bg-muted px-3 py-1 text-muted-foreground"}>{k + 1}. {t}</li>
        ))}
      </ol>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {passo === 3 ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" /> : <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />}
            {passo === 0 ? "Bem-vindo ao Portal do Fornecedor" : passo === 1 ? "Defina a sua password" : passo === 2 ? "Confirme os dados da sua empresa" : "Acesso ativo"}
          </CardTitle>
          <CardDescription className="text-[15px]">
            {passo === 0 ? `${s.company || "A empresa"} convidou ${s.name} (NIF ${s.nif}). Convite enviado para ${email} em ${fmtD(s.invitedAt)}.`
              : passo === 1 ? `Entra com o email ${email}.` : passo === 2 ? "A empresa vê estes dados na sua ficha de fornecedor." : `Pronto: ${s.name} já recebe e confirma as encomendas no portal.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {passo === 0 && <p className="text-[15px]">Aqui vai ver as encomendas, confirmar datas de entrega, expedir com a guia de remessa e manter o seu catálogo e preços.</p>}
          {passo === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label htmlFor="pf-pw">Nova password</Label><Input id="pf-pw" type="password" autoComplete="new-password" className="h-11 text-[15px]" value={pw.password} onChange={(e) => setPw((x) => ({ ...x, password: e.target.value }))} /><p className="text-sm text-muted-foreground">Pelo menos 8 caracteres.</p></div>
              <div className="grid gap-1.5"><Label htmlFor="pf-pw2">Repetir password</Label><Input id="pf-pw2" type="password" autoComplete="new-password" className="h-11 text-[15px]" value={pw.password2} onChange={(e) => setPw((x) => ({ ...x, password2: e.target.value }))} /></div>
            </div>
          )}
          {passo === 2 && <FormDados d={d} setD={(f) => { setErro(""); setD(f); }} prefixo="pf-pa" />}
          {erro && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[15px] text-destructive">{erro}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {passo > 0 && passo < 3 && <Button variant="outline" className="h-11" onClick={() => { setErro(""); setPasso(anterior(passo)); }}>Voltar</Button>}
            {passo < 3 ? <Button className="h-11" onClick={seguinte}>{passo === 0 ? "Aceitar convite" : passo === 1 ? "Definir password" : "Confirmar dados"}</Button>
              : <Button className="h-11" onClick={aoConcluir}>Entrar no portal</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
