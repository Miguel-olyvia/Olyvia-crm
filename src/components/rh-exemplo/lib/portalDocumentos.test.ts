// As regras puras da troca de documentos do Portal do colaborador: pedidos do RH (enviar, aceitar, recusar com motivo, máximo
// de 4 ficheiros), documentos enviados à pessoa (visto, assinar, recusar assinar) e pedidos da pessoa (preparar, responder,
// recusar; ao responder o documento aparece também em «Recebidos»). Só funções, sem ecrã nem memória.
import { describe, expect, it } from "vitest";
import {
  PORTAL_VAZIO, MAX_FICHEIROS_PEDIDO, aceitarPedidoRh, assinarRecebido, chaveErroPortal, enviarDocumentoAPessoa,
  enviarFicheirosPedidoRh, estadoRecebido, juntarFicheiros, marcarVisto, pedidoRhAtrasado, pedirDocumentoAoRh,
  pedirDocumentoPessoa, pendentesDaPessoa, pendentesDoRh, prepararPedidoPessoa, recusarAssinaturaRecebido, recusarPedidoPessoa,
  recusarPedidoRh, responderPedidoPessoa, type PortalPessoa, type ResultadoPortal,
} from "./portalDocumentos";

const AGORA = new Date("2026-10-14T12:00:00Z");

function ok(r: ResultadoPortal): PortalPessoa {
  if (!r.ok) throw new Error(`esperava ok, veio ${r.erro}`);
  return r.portal;
}

const comPedido = () => ok(pedirDocumentoPessoa(PORTAL_VAZIO, { tipo: "cartao_cidadao", titulo: "", nota: " frente e verso ", prazo: "2026-10-20" }, AGORA));

describe("pedidos do RH à pessoa", () => {
  it("o RH pede um documento: fica «por enviar», com prazo e nota, sem alterar o portal anterior", () => {
    const p = comPedido();
    expect(PORTAL_VAZIO.pedidosRh).toHaveLength(0);
    expect(p.pedidosRh[0]).toMatchObject({ tipo: "cartao_cidadao", estado: "por_enviar", nota: "frente e verso", prazo: "2026-10-20", ficheiros: [] });
  });

  it("«outro» exige título e o prazo tem de ser uma data", () => {
    expect(pedirDocumentoPessoa(PORTAL_VAZIO, { tipo: "outro", titulo: "  ", nota: "", prazo: "2026-10-20" }, AGORA).erro).toBe("titulo_obrigatorio");
    expect(pedirDocumentoPessoa(PORTAL_VAZIO, { tipo: "fotografia", titulo: "", nota: "", prazo: "20/10" }, AGORA).erro).toBe("prazo_invalido");
    const p = ok(pedirDocumentoPessoa(PORTAL_VAZIO, { tipo: "outro", titulo: " Certificado ", nota: "", prazo: "2026-10-20" }, AGORA));
    expect(p.pedidosRh[0].titulo).toBe("Certificado");
  });

  it("os ids não se repetem", () => {
    const p = ok(pedirDocumentoPessoa(comPedido(), { tipo: "fotografia", titulo: "", nota: "", prazo: "2026-10-21" }, AGORA));
    expect(new Set(p.pedidosRh.map((x) => x.id)).size).toBe(2);
  });

  it("a pessoa envia de 1 a 4 ficheiros; 0 ou 5 recusam-se e o pedido fica como estava", () => {
    const p = comPedido();
    const id = p.pedidosRh[0].id;
    expect(enviarFicheirosPedidoRh(p, id, [], AGORA).erro).toBe("sem_ficheiro");
    expect(enviarFicheirosPedidoRh(p, id, ["  "], AGORA).erro).toBe("sem_ficheiro");
    expect(MAX_FICHEIROS_PEDIDO).toBe(4);
    expect(enviarFicheirosPedidoRh(p, id, ["a", "b", "c", "d", "e"], AGORA).erro).toBe("max_ficheiros");
    const enviado = ok(enviarFicheirosPedidoRh(p, id, ["a.pdf", "b.pdf", "c.pdf", "d.pdf"], AGORA));
    expect(enviado.pedidosRh[0]).toMatchObject({ estado: "enviado", ficheiros: ["a.pdf", "b.pdf", "c.pdf", "d.pdf"], enviadoEm: AGORA.toISOString() });
    expect(p.pedidosRh[0].estado).toBe("por_enviar");
  });

  it("não se envia duas vezes: depois de enviado só o RH decide", () => {
    const enviado = ok(enviarFicheirosPedidoRh(comPedido(), "pr-1", ["a.pdf"], AGORA));
    expect(enviarFicheirosPedidoRh(enviado, "pr-1", ["b.pdf"], AGORA).erro).toBe("transicao_invalida");
    expect(enviarFicheirosPedidoRh(enviado, "nao-existe", ["b.pdf"], AGORA).erro).toBe("nao_encontrado");
  });

  it("aceitar só vale para um pedido enviado", () => {
    expect(aceitarPedidoRh(comPedido(), "pr-1").erro).toBe("transicao_invalida");
    const enviado = ok(enviarFicheirosPedidoRh(comPedido(), "pr-1", ["a.pdf"], AGORA));
    expect(ok(aceitarPedidoRh(enviado, "pr-1")).pedidosRh[0].estado).toBe("aceite");
  });

  it("recusar pede motivo de pelo menos 3 caracteres e deixa a pessoa voltar a enviar", () => {
    const enviado = ok(enviarFicheirosPedidoRh(comPedido(), "pr-1", ["a.pdf"], AGORA));
    expect(recusarPedidoRh(enviado, "pr-1", "ab").erro).toBe("motivo_curto");
    expect(recusarPedidoRh(enviado, "pr-1", "   ").erro).toBe("motivo_curto");
    const recusado = ok(recusarPedidoRh(enviado, "pr-1", " Ilegível "));
    expect(recusado.pedidosRh[0]).toMatchObject({ estado: "recusado", motivoRecusa: "Ilegível" });
    const reenviado = ok(enviarFicheirosPedidoRh(recusado, "pr-1", ["b.pdf"], AGORA));
    expect(reenviado.pedidosRh[0]).toMatchObject({ estado: "enviado", ficheiros: ["b.pdf"], motivoRecusa: null });
  });

  it("juntar ficheiros tira repetidos e vazios, e não passa do máximo", () => {
    expect(juntarFicheiros(["a"], ["a", " ", "b"])).toEqual({ ok: true, nomes: ["a", "b"] });
    expect(juntarFicheiros(["a", "b", "c"], ["d", "e"])).toEqual({ ok: false, erro: "max_ficheiros" });
    expect(juntarFicheiros(["a", "b"], ["c"], 2)).toEqual({ ok: false, erro: "max_ficheiros" });
  });

  it("um pedido por enviar com prazo passado está atrasado; enviado já não", () => {
    const p = comPedido();
    expect(pedidoRhAtrasado(p.pedidosRh[0], "2026-10-21")).toBe(true);
    expect(pedidoRhAtrasado(p.pedidosRh[0], "2026-10-20")).toBe(false);
    const enviado = ok(enviarFicheirosPedidoRh(p, "pr-1", ["a.pdf"], AGORA));
    expect(pedidoRhAtrasado(enviado.pedidosRh[0], "2026-12-01")).toBe(false);
  });
});

describe("documentos que o RH envia à pessoa", () => {
  const enviar = (precisaAssinatura: boolean) =>
    ok(enviarDocumentoAPessoa(PORTAL_VAZIO, { titulo: " Regulamento ", nomeFicheiro: "", precisaAssinatura }, AGORA));

  it("entra à cabeça de «Recebidos», como novo, e passa a visto quando a pessoa o abre", () => {
    const p = ok(enviarDocumentoAPessoa(enviar(false), { titulo: "Outro", nomeFicheiro: "outro.pdf", precisaAssinatura: false }, AGORA));
    expect(p.recebidos.map((d) => d.titulo)).toEqual(["Outro", "Regulamento"]);
    expect(p.recebidos[1].nomeFicheiro).toBe("Regulamento.pdf");
    expect(estadoRecebido(p.recebidos[1], p.vistos)).toBe("novo");
    const visto = marcarVisto(p, p.recebidos[1].id);
    expect(estadoRecebido(p.recebidos[1], visto.vistos)).toBe("visto");
    expect(marcarVisto(visto, p.recebidos[1].id)).toBe(visto);
  });

  it("sem título não há envio", () => {
    expect(enviarDocumentoAPessoa(PORTAL_VAZIO, { titulo: " ", nomeFicheiro: "x.pdf", precisaAssinatura: false }, AGORA).erro).toBe("titulo_obrigatorio");
  });

  it("assinar pede aceite e o nome completo; depois de assinado não se assina nem se recusa", () => {
    const p = enviar(true);
    const id = p.recebidos[0].id;
    expect(assinarRecebido(p, id, { nome: "Ana Silva", nomeEsperado: "Ana Silva", aceite: false }, AGORA).erro).toBe("aceite_obrigatorio");
    expect(assinarRecebido(p, id, { nome: "Ana", nomeEsperado: "Ana Silva", aceite: true }, AGORA).erro).toBe("nome_nao_confere");
    expect(assinarRecebido(p, id, { nome: "", nomeEsperado: "", aceite: true }, AGORA).erro).toBe("nome_nao_confere");
    const assinado = ok(assinarRecebido(p, id, { nome: " ana  SILVA ", nomeEsperado: "Ana Silva", aceite: true }, AGORA));
    expect(estadoRecebido(assinado.recebidos[0], assinado.vistos)).toBe("assinado");
    expect(assinado.recebidos[0].assinaturaNome).toBe("ana  SILVA");
    expect(assinarRecebido(assinado, id, { nome: "Ana Silva", nomeEsperado: "Ana Silva", aceite: true }, AGORA).erro).toBe("transicao_invalida");
    expect(recusarAssinaturaRecebido(assinado, id, "motivo", AGORA).erro).toBe("transicao_invalida");
  });

  it("um documento sem assinatura não se assina", () => {
    const p = enviar(false);
    expect(assinarRecebido(p, p.recebidos[0].id, { nome: "A", nomeEsperado: "A", aceite: true }, AGORA).erro).toBe("transicao_invalida");
  });

  it("recusar assinar pede motivo e deixa de contar como pendente", () => {
    const p = enviar(true);
    const id = p.recebidos[0].id;
    expect(pendentesDaPessoa(p.recebidos, p.pedidosRh)).toBe(1);
    expect(recusarAssinaturaRecebido(p, id, "no", AGORA).erro).toBe("motivo_curto");
    const recusado = ok(recusarAssinaturaRecebido(p, id, "Há um erro no horário", AGORA));
    expect(recusado.recebidos[0].recusa).toMatchObject({ motivo: "Há um erro no horário" });
    expect(pendentesDaPessoa(recusado.recebidos, recusado.pedidosRh)).toBe(0);
  });
});

describe("pedidos da pessoa ao RH", () => {
  const pedido = () => ok(pedirDocumentoAoRh(PORTAL_VAZIO, { tipo: "declaracao_vinculo", titulo: "", nota: "Para o banco", urgencia: "urgente" }, AGORA));

  it("o pedido nasce «Pedido», com a urgência e a nota", () => {
    expect(pedido().pedidosPessoa[0]).toMatchObject({ estado: "pedido", urgencia: "urgente", nota: "Para o banco", documentoId: null });
    expect(pedirDocumentoAoRh(PORTAL_VAZIO, { tipo: "outro", titulo: "", nota: "", urgencia: "normal" }, AGORA).erro).toBe("titulo_obrigatorio");
  });

  it("o RH prepara (uma vez), e depois responde ou recusa", () => {
    const p = ok(prepararPedidoPessoa(pedido(), "pp-1"));
    expect(p.pedidosPessoa[0].estado).toBe("em_preparacao");
    expect(prepararPedidoPessoa(p, "pp-1").erro).toBe("transicao_invalida");
    expect(recusarPedidoPessoa(p, "pp-1", "x").erro).toBe("motivo_curto");
    expect(ok(recusarPedidoPessoa(p, "pp-1", "Não emitimos esse documento")).pedidosPessoa[0]).toMatchObject({
      estado: "recusado", motivoRecusa: "Não emitimos esse documento",
    });
  });

  it("responder deixa o pedido «Disponível» e o documento aparece também em «Recebidos»", () => {
    const p = ok(responderPedidoPessoa(pedido(), "pp-1", "declaracao.pdf", "Declaração de vínculo", AGORA));
    expect(p.pedidosPessoa[0].estado).toBe("disponivel");
    const doc = p.recebidos.find((d) => d.id === p.pedidosPessoa[0].documentoId);
    expect(doc).toMatchObject({ titulo: "Declaração de vínculo", nomeFicheiro: "declaracao.pdf", origemPedidoId: "pp-1", precisaAssinatura: false });
    expect(p.recebidos).toHaveLength(1);
  });

  it("não se responde sem ficheiro nem a um pedido já tratado", () => {
    expect(responderPedidoPessoa(pedido(), "pp-1", "  ", "T", AGORA).erro).toBe("sem_ficheiro");
    const feito = ok(responderPedidoPessoa(pedido(), "pp-1", "d.pdf", "T", AGORA));
    expect(responderPedidoPessoa(feito, "pp-1", "e.pdf", "T", AGORA).erro).toBe("transicao_invalida");
    expect(recusarPedidoPessoa(feito, "pp-1", "motivo").erro).toBe("transicao_invalida");
    expect(feito.recebidos).toHaveLength(1);
  });
});

describe("contadores e erros", () => {
  it("pendentes da pessoa: por assinar mais por enviar (ou recusados); pendentes do RH: por aceitar mais pedidos por tratar", () => {
    let p = comPedido();
    p = ok(pedirDocumentoPessoa(p, { tipo: "fotografia", titulo: "", nota: "", prazo: "2026-10-21" }, AGORA));
    p = ok(enviarDocumentoAPessoa(p, { titulo: "Contrato", nomeFicheiro: "", precisaAssinatura: true }, AGORA));
    expect(pendentesDaPessoa(p.recebidos, p.pedidosRh)).toBe(3);
    expect(pendentesDoRh(p)).toBe(0);
    p = ok(enviarFicheirosPedidoRh(p, "pr-1", ["a.pdf"], AGORA));
    p = ok(pedirDocumentoAoRh(p, { tipo: "copia_contrato", titulo: "", nota: "", urgencia: "normal" }, AGORA));
    expect(pendentesDaPessoa(p.recebidos, p.pedidosRh)).toBe(2);
    expect(pendentesDoRh(p)).toBe(2);
  });

  it("cada erro tem a sua chave de tradução", () => {
    expect(chaveErroPortal("max_ficheiros")).toBe("rhPortal.erro.max_ficheiros");
    expect(chaveErroPortal("motivo_curto")).toBe("rhAdm.erro.motivo_curto");
    expect(chaveErroPortal("expirado")).toBe("rhAdm.erro.expirado");
  });
});
