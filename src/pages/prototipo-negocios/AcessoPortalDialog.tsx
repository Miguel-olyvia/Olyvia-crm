// O popup com o acesso ao portal (22/10/2026): ao enviar ao portal do cliente (proposta, contrato, adenda) ou ao dar acesso a um fornecedor,
// o protótipo mostra o email que a Olyvia real envia (create-client-portal-access / create-supplier-portal-access): para quem, o assunto,
// o texto, o link do login, o email e a password temporária. Assim quem testa entra no portal sem emails a sério (LoginPortal.tsx).
// Conta que já existia: o email real só leva o link; aqui junta-se "Credenciais de teste" com a password atual (só no protótipo).
import { useState } from "react";
import { Check, Copy, ExternalLink, Info, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { docComArtigo, docNovo, docUmNovo, linkLogin, type EnvioAcesso } from "./acessosPortal";

async function copiarTexto(t: string): Promise<void> {
  try { await navigator.clipboard.writeText(t); } catch { /* sem acesso à área de transferência */ }
}

/** Um botão de copiar que diz "Copiado" por um momento. */
function BotaoCopiar({ rotulo, valor, texto }: { rotulo: string; valor: string; texto?: string }) {
  const [ok, setOk] = useState(false);
  const copiar = async (): Promise<void> => { await copiarTexto(valor); setOk(true); setTimeout(() => setOk(false), 1600); };
  return (
    <Button type="button" variant="ghost" size="sm" onClick={copiar} aria-label={`Copiar ${rotulo}`} className="h-9 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground">
      {ok ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {texto ? <span>{ok ? "Copiado" : texto}</span> : <span className="sr-only">{ok ? "Copiado" : ""}</span>}
    </Button>
  );
}

/** Uma linha "rótulo · valor" da caixa das credenciais. */
function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <dt className="shrink-0 text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className={mono ? "min-w-0 break-all font-mono text-base font-semibold" : "min-w-0 break-all text-[15px] font-semibold"}>{valor}</span>
        <BotaoCopiar rotulo={rotulo.toLowerCase()} valor={valor} />
      </dd>
    </div>
  );
}

/** `entrarAqui`: abre o login neste separador (o fornecedor precisa: o Inventário do protótipo vive em memória neste separador). */
export function AcessoPortalDialog({ e, fechar, entrarAqui }: { e: EnvioAcesso; fechar: () => void; entrarAqui?: () => void }) {
  const { conta, comPassword, empresa } = e;
  const cliente = conta.tipo === "cliente";
  const link = linkLogin();
  const doc = e.doc ?? "proposta";
  const assunto = cliente
    ? (comPassword ? `Acesso ao Portal — ${empresa}` : `${docNovo(doc)} disponível — ${empresa}`)
    : (comPassword ? `Acesso ao Portal do Fornecedor — ${empresa}` : `${empresa} deu-lhe acesso no Portal do Fornecedor`);
  const tudo = [`Portal: ${link}`, `Email: ${conta.email}`, `Password: ${conta.password}`].join("\n");
  const caixa = (
    <dl className="my-3 rounded-lg border bg-muted/50 px-3 py-2">
      <Linha rotulo="Link do login" valor={link} />
      <Linha rotulo="Email" valor={conta.email} />
      <Linha rotulo={comPassword ? "Password temporária" : "Password atual"} valor={conta.password} mono />
    </dl>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente ? "Acesso ao portal do cliente" : "Acesso ao Portal do Fornecedor"}</DialogTitle>
          <DialogDescription className="text-[15px]">
            {comPassword ? "O email com as credenciais de acesso." : `O email de aviso: ${cliente ? "o cliente" : "o fornecedor"} já tem conta no portal.`}
          </DialogDescription>
        </DialogHeader>
        <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>Protótipo: em produção isto segue por email. Aqui fica à vista para entrar no portal sem emails a sério.
            {!cliente && " O Inventário do protótipo só passa para outro separador com a partilha ao vivo: sem ela, entre neste separador."}</span>
        </p>

        {/* a pré-visualização do email */}
        <article aria-label="Email enviado" className="rounded-lg border bg-background text-[15px]">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b px-4 py-3 text-sm">
            <dt className="text-muted-foreground">Para</dt><dd className="min-w-0 break-all font-medium">{conta.nome} &lt;{conta.email}&gt;</dd>
            <dt className="text-muted-foreground">Assunto</dt><dd className="min-w-0 font-medium">{assunto}</dd>
          </dl>
          <div className="space-y-2 px-4 py-3">
            <p className="text-lg font-semibold">Olá, {conta.nome}!</p>
            {cliente && comPassword && <>
              <p>Foi-lhe criado um acesso ao portal de <strong>{empresa}</strong>.</p>
              <p>Tem {docComArtigo(doc)} disponível para consulta{e.titulo ? <>: <em>{e.titulo}</em></> : "."}</p>
              <p className="font-medium">Aceda ao portal:</p>
              {caixa}
              <p className="text-sm text-muted-foreground">Recomendamos que altere a password no primeiro acesso.</p>
            </>}
            {cliente && !comPassword && <>
              <p>Tem {docUmNovo(doc)} disponível no seu portal{e.titulo ? <>: <em>{e.titulo}</em></> : "."}</p>
              <p>Aceda em: <a href={link} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-4 hover:underline">{link}</a></p>
            </>}
            {!cliente && comPassword && <>
              <p><strong>{empresa}</strong> deu-lhe acesso ao Portal do Fornecedor da Olyvia, onde pode gerir o seu catálogo de artigos.</p>
              <p>Entre com:</p>
              {caixa}
              <p>No primeiro acesso vai ser pedido para definir uma nova password.</p>
              <p className="text-sm text-muted-foreground">Não partilhe esta password. Se o acesso não funcionar, peça a {empresa} que lhe reenvie o acesso.</p>
            </>}
            {!cliente && !comPassword && <>
              <p>Passou a ter acesso ao Portal do Fornecedor da <strong>{empresa}</strong>.</p>
              <p>Entre em <a href={link} target="_blank" rel="noreferrer" className="break-all text-primary underline-offset-4 hover:underline">{link}</a> com o mesmo email ({conta.email}) e a mesma password que já usa.</p>
            </>}
            <p className="border-t pt-2 text-sm text-muted-foreground">Enviado por {empresa}</p>
          </div>
        </article>

        {/* conta que já existia: o email real não leva a password; aqui mostra-se para testar */}
        {!comPassword && (
          <section aria-label="Credenciais de teste" className="rounded-lg border border-dashed px-4 py-3">
            <p className="font-medium">Credenciais de teste</p>
            <p className="text-sm text-muted-foreground">
              Só no protótipo: o email real não leva a password. {conta.mudouPassword ? "É a password que já foi definida no primeiro acesso." : "Ainda é a password temporária (por trocar no primeiro acesso)."}
            </p>
            {caixa}
          </section>
        )}

        <DialogFooter className="gap-2 sm:flex-wrap">
          <BotaoCopiar rotulo="tudo" valor={tudo} texto="Copiar tudo" />
          {entrarAqui && <Button type="button" variant="outline" className="h-11 gap-2" onClick={entrarAqui}><LogIn className="h-4 w-4" aria-hidden="true" />Entrar neste separador</Button>}
          <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => window.open(link, "_blank", "noopener")}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />Abrir login num separador novo
          </Button>
          <Button type="button" className="h-11" onClick={fechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
