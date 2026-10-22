// 22/10: SÓ PROTÓTIPO. Depois de uma PO seguir para o fornecedor (Aprovar e enviar, Gravar e encomendar, ou o estado passado a Encomendado),
// o protótipo mostra o popup do acesso ao portal (acessosPortal.ts) para quem testa entrar como fornecedor sem emails a sério:
// · portal ativo: a PO foi publicada no portal; o popup leva o email "Nova encomenda" e as credenciais, e o login abre essa PO;
// · convidado: a PO seguiu por email; o popup leva o acesso (a conta de sempre, sem password nova se já existe);
// · sem acesso (ou revogado): a PO seguiu por email e dá-se também o acesso ao portal, com a regra do "Enviar acesso" (acessoPortal,
//   o convite para o email do fornecedor). Se a regra recusar (sem email, NIF, permissão), avisa e não há popup.
// Não mexe no envio da PO (po.ts) nem no stock: só corre depois de o envio ter ficado feito.
import { pedirAcessoForn } from "../acessosPortal";
import { fornecedor, poPorId } from "./base";
import { executar, lerInventario } from "./loja";
import { acessoPortal } from "./regrasForn";

/** Pede o popup do acesso ao portal para a PO `id`, se já seguiu para o fornecedor. `avisar` só se usa quando o acesso não pôde ser dado. */
export function acessoDaPoEnviada(id: string, avisar: (texto: string, erro?: boolean) => void): void {
  const db = lerInventario();
  const p = poPorId(db, id);
  if (!p || p.deleted || p.status === "pending" || p.portal.state === "none") return;
  const s = fornecedor(db, p.sup);
  if (!s) return;
  const publicada = p.portal.state === "sent";
  let acessoNovo = false;
  if (s.portal !== "active" && s.portal !== "invited") {
    const r = executar((d) => acessoPortal(d, s.id, "invite"));
    if (!r.ok) { avisar(`${id} seguiu por email. O acesso ao portal não foi enviado: ${r.erro}`, true); return; }
    acessoNovo = true;
  }
  pedirAcessoForn({ sid: s.id, reenviar: false, po: { id, publicada, acessoNovo } });
}
