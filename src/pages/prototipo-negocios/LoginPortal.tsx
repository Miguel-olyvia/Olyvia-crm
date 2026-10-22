// O login dos portais no protótipo (22/10/2026), em /prototipo/negocios?login=1, com o aspeto do login da Olyvia (src/pages/Auth.tsx):
// o mesmo ecrã para o cliente e para o fornecedor; a conta diz qual dos portais abre (acessosPortal.ts). As credenciais aparecem no popup
// do envio (AcessoPortalDialog.tsx), por isso "Esqueceu a password?" só explica onde as encontrar.
// · Cliente: no primeiro acesso troca a password temporária (como FirstLoginModal.tsx) e abre o portal do negócio do envio mais recente.
// · Fornecedor: convidado, corre o primeiro acesso de sempre (PrimeiroAcesso, que já pede a password nova); ativo com a password reposta
//   ("Reenviar"), troca-a primeiro. Sair do portal volta a este ecrã.
// · 22/10: o portal do fornecedor só se abre por aqui (já não há entrada no menu). "Abrir como fornecedor →" e "Simular" no Inventário
//   abrem este ecrã com o email da conta já posto (`pre`); depois de entrar abre a encomenda pedida, e "Sair" volta ao Inventário.
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Info, ShieldCheck } from "lucide-react";
import olyviaIcon from "@/assets/olyvia-icon.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Ctx } from "./pecas";
import { PortalCliente } from "./PortalCliente";
import { entrar, mudarPassword, negocioDaConta, type LoginPrefill } from "./acessosPortal";
import { fornecedor } from "./inventario/base";
import { useInventario } from "./inventario/loja";

// o portal do fornecedor só se carrega quando um fornecedor entra (como no resto do protótipo)
const PortalFornecedor = lazy(() => import("./portalFornecedor/PortalFornecedor"));

const CHAVE_LEMBRAR = "olyvia-prototipo-login-email";
const lerLembrado = (): string => { try { return localStorage.getItem(CHAVE_LEMBRAR) || ""; } catch { return ""; } };

/** A troca da password temporária no primeiro acesso (o FirstLoginModal do portal real): não se fecha sem trocar. */
function PrimeiraPassword({ aoMudar }: { aoMudar: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const submeter = (e: React.FormEvent): void => {
    e.preventDefault();
    if (pw.length < 8) { setErro("A password deve ter no mínimo 8 caracteres."); return; }
    if (!pw2) { setErro("Confirme a password."); return; }
    if (pw !== pw2) { setErro("As passwords não coincidem."); return; }
    aoMudar(pw);
  };
  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" hideClose onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>Bem-vindo ao Portal!</DialogTitle>
          </div>
          <DialogDescription>Por segurança, altere a sua password temporária antes de continuar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submeter} className="mt-2 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="lp-nova">Nova password</Label>
            <div className="relative">
              <Input id="lp-nova" type={ver ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => { setErro(""); setPw(e.target.value); }} placeholder="Mínimo 8 caracteres" className="pr-11" />
              <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder a password" : "Mostrar a password"}
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {ver ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lp-nova2">Confirmar password</Label>
            <Input id="lp-nova2" type={ver ? "text" : "password"} autoComplete="new-password" value={pw2} onChange={(e) => { setErro(""); setPw2(e.target.value); }} placeholder="Repita a password" />
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <Button type="submit" className="w-full">Alterar password e entrar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** `pre` (22/10): vindo do Inventário, o email do fornecedor já posto e a encomenda a abrir; "Sair" do portal volta logo ao Inventário. */
export function LoginPortal({ ctx, voltar, pre }: { ctx: Ctx; voltar: () => void; pre?: LoginPrefill | null }) {
  const { S, run } = ctx;
  const db = useInventario();
  const [modo, setModo] = useState<"login" | "recuperar">("login");
  const [email, setEmail] = useState(() => pre?.email || lerLembrado());
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [lembrar, setLembrar] = useState(() => !!lerLembrado());
  const [erro, setErro] = useState("");
  const [recuperado, setRecuperado] = useState(false);
  // quem entrou: o email da conta e, no fornecedor, se entrou com o convite por aceitar (corre o primeiro acesso do portal)
  const [sessao, setSessao] = useState<{ email: string; assistente: boolean } | null>(null);

  useEffect(() => { const prev = document.title; document.title = "Olyvia · Login dos portais (protótipo)"; return () => { document.title = prev; }; }, []);

  const sair = (): void => { setSessao(null); setPassword(""); setErro(""); };
  const submeter = (e: React.FormEvent): void => {
    e.preventDefault();
    const c = entrar(S, email, password);
    if (!c) { setErro("Email ou password incorretos."); return; }
    // o Inventário do protótipo vive em memória: noutro separador sem a partilha ao vivo, o fornecedor não tem aqui o convite
    if (c.tipo === "fornecedor" && (fornecedor(db, c.ref)?.portal ?? "none") === "none") {
      setErro("Protótipo: o acesso deste fornecedor foi dado noutro separador e o Inventário só passa entre separadores com a partilha ao vivo. Entre pelo «Login dos portais» do separador onde enviou o acesso.");
      return;
    }
    try { if (lembrar) localStorage.setItem(CHAVE_LEMBRAR, c.email); else localStorage.removeItem(CHAVE_LEMBRAR); } catch { /* sem storage */ }
    setErro("");
    setSessao({ email: c.email, assistente: c.tipo === "fornecedor" && fornecedor(db, c.ref)?.portal === "invited" });
  };

  // com sessão: o portal da conta (a conta lê-se do Estado de agora: outro separador pode tê-la mudado)
  const conta = sessao ? S.acessos?.[sessao.email] : undefined;
  // a conta saiu (ex.: o convite foi para outro email): volta ao login
  useEffect(() => { if (sessao && !conta) setSessao(null); }, [sessao, conta]);
  const trocar = (pw: string): void => { if (conta) run(() => mudarPassword(S, conta.email, pw)); };

  if (conta && conta.tipo === "cliente" && conta.mudouPassword) {
    const d = negocioDaConta(S, conta);
    if (d) return <PortalCliente ctx={ctx} d={d} fechar={sair} />;
  }
  if (conta && conta.tipo === "fornecedor" && (sessao?.assistente || conta.mudouPassword)) {
    // 22/10: entrou com a conta pedida no Inventário: abre a encomenda dessa PO e "Sair" volta ao Inventário
    const doInv = !!pre && pre.email === conta.email;
    return (
      <Suspense fallback={<p className="p-6 text-[15px] text-muted-foreground" role="status">A abrir o portal do fornecedor…</p>}>
        <PortalFornecedor sup={conta.ref} po={doInv ? pre.po : null} aoVoltar={doInv ? voltar : sair} rotuloVoltar="Sair" aoDefinirPassword={trocar} />
      </Suspense>
    );
  }

  const semDocumento = conta?.tipo === "cliente" && conta.mudouPassword; // a conta não tem nenhum negócio no portal
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <Button variant="ghost" className="absolute left-4 top-4 gap-2" onClick={voltar}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar
      </Button>

      <div className="mx-4 w-full max-w-md space-y-3">
        <Card className="w-full">
          <CardHeader className="flex flex-col items-center space-y-1">
            <div className="mb-4">
              <img src={olyviaIcon} alt="Olyvia" width={64} height={64} className="h-16 w-16" />
            </div>
            <CardTitle className="text-center text-2xl font-bold">{modo === "login" ? "Login" : "Recuperar Password"}</CardTitle>
            <CardDescription className="text-center">
              {modo === "login" ? "Introduza as suas credenciais para aceder à Olyvia" : "Introduza o seu email para receber instruções de recuperação"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {modo === "recuperar" ? (
              <form onSubmit={(e) => { e.preventDefault(); setRecuperado(true); }} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lp-email-r">Email</Label>
                  <Input id="lp-email-r" type="email" placeholder="seu@email.com" value={email} onChange={(e) => { setRecuperado(false); setEmail(e.target.value); }} required />
                </div>
                {recuperado && (
                  <p role="status" className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>No protótipo não se enviam emails: a password está no popup do acesso, que aparece no CRM ao enviar ao portal do cliente ou ao enviar (ou reenviar) o acesso a um fornecedor.</span>
                  </p>
                )}
                <Button type="submit" className="w-full">Enviar Email de Recuperação</Button>
              </form>
            ) : (
              <form onSubmit={submeter} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="lp-email">Email</Label>
                  <Input id="lp-email" type="email" autoComplete="username" placeholder="seu@email.com" value={email} onChange={(e) => { setErro(""); setEmail(e.target.value); }} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lp-password">Password</Label>
                  <div className="relative">
                    <Input id="lp-password" type={ver ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={password} autoFocus={!!pre}
                      onChange={(e) => { setErro(""); setPassword(e.target.value); }} required className="pr-11" />
                    <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder a password" : "Mostrar a password"}
                      className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {ver ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="lp-lembrar" checked={lembrar} onCheckedChange={(v) => setLembrar(v === true)} />
                  <Label htmlFor="lp-lembrar" className="cursor-pointer text-sm font-normal">Lembrar-me</Label>
                </div>
                {erro && <p role="alert" className="text-center text-sm text-destructive">{erro}</p>}
                {semDocumento && <p role="status" className="text-center text-sm text-muted-foreground">Ainda não há nenhum documento seu no portal.</p>}
                {pre && <p className="text-center text-sm text-muted-foreground">Protótipo: o email do fornecedor já vem preenchido. A password está no popup do acesso («Reenviar», na ficha do fornecedor › Portal, gera outra).</p>}
                <Button type="submit" className="w-full">Entrar</Button>
              </form>
            )}
            <div className="mt-4 space-y-2 text-center text-sm">
              {modo === "login"
                ? <button type="button" onClick={() => { setErro(""); setModo("recuperar"); }} className="block w-full text-muted-foreground hover:text-primary hover:underline">Esqueceu a password?</button>
                : <button type="button" onClick={() => { setRecuperado(false); setModo("login"); }} className="block w-full text-primary hover:underline">Voltar ao Login</button>}
            </div>
          </CardContent>
        </Card>
        <p className="px-2 text-center text-sm text-muted-foreground">
          Protótipo: o mesmo login serve o portal do cliente e o do fornecedor. As credenciais aparecem num popup quando se envia ao portal.
        </p>
      </div>

      {conta && !conta.mudouPassword && <PrimeiraPassword aoMudar={trocar} />}
    </div>
  );
}
