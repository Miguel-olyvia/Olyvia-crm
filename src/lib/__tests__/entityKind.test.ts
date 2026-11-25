import { describe, expect, it, vi } from "vitest";
import {
  clientNameArgsAfterKindStep,
  initialKindState,
  isMissingFunctionError,
  leadNameArgsAfterKindStep,
  personNamesFromEntity,
  planNameSave,
  resolveInitialPersonNames,
  runKindStep,
  saveKindThenRest,
  setEntityKind,
  type KindFormState,
} from "@/lib/entityKind";

const evolarPerson = { type: "person", display_name: "EVOLAR LDA", first_name: "Rui", last_name: "Silva" };

describe("initialKindState (o que o formulario mostra ao abrir)", () => {
  it("pessoa normal: Pessoa, nome e apelido, empresa vazia", () => {
    expect(initialKindState({ type: "person", display_name: "Rui Silva", first_name: "Rui", last_name: "Silva" }))
      .toEqual({ kind: "person", first: "Rui", last: "Silva", company: "" });
  });

  it("organizacao: Empresa, e o nome da empresa e o nome actual", () => {
    const s = initialKindState({ type: "organization", display_name: "Evolar Lda", first_name: "Evolar Lda", last_name: null });
    expect(s.kind).toBe("organization");
    expect(s.company).toBe("Evolar Lda");
  });

  it("pessoa cujo display_name nao e nome + apelido: continua Pessoa mas o nome da empresa mostra o que existe", () => {
    const s = initialKindState(evolarPerson);
    expect(s.kind).toBe("person");
    expect(s.company).toBe("EVOLAR LDA");
  });

  it("a coluna company_name, quando existe, manda no nome da empresa", () => {
    expect(initialKindState(evolarPerson, "EVOLAR MOVEIS LDA").company).toBe("EVOLAR MOVEIS LDA");
  });

  it("espacos a mais no nome + apelido nao contam como diferente", () => {
    expect(initialKindState({ type: "person", display_name: "Rui  Silva ", first_name: "Rui", last_name: "Silva" }).company).toBe("");
  });

  it("tipo em falta conta como pessoa", () => {
    expect(initialKindState({ display_name: "Ana", first_name: "Ana" }).kind).toBe("person");
  });
});

describe("planNameSave (quando se chama a RPC e com que argumentos)", () => {
  const original = initialKindState(evolarPerson);

  it("sem alteracoes: nao ha nada a gravar (o nome fica como esta)", () => {
    expect(planNameSave(original, { ...original }, "person")).toBeNull();
    expect(planNameSave(original, { ...original, first: " Rui ", last: "Silva  " }, "person")).toBeNull();
  });

  it("mudar o texto da empresa estando em Pessoa nao conta (so vale em Empresa)", () => {
    expect(planNameSave(original, { ...original, company: "OUTRA" }, "person")).toBeNull();
  });

  it("Pessoa EVOLAR LDA passa a Empresa com EVOLAR MOVEIS LDA: RPC com tipo organization e nome novo", () => {
    const plan = planNameSave(original, { ...original, kind: "organization", company: "EVOLAR MOVEIS  LDA " }, "person");
    expect(plan?.rpcArgs).toEqual({
      p_type: "organization",
      p_first_name: null,
      p_last_name: null,
      p_company_name: "EVOLAR MOVEIS LDA",
    });
    expect(plan?.displayName).toBe("EVOLAR MOVEIS LDA");
  });

  it("editar o apelido de uma Pessoa: RPC com Rui Costa", () => {
    const plan = planNameSave(original, { ...original, last: "Costa" }, "person");
    expect(plan?.rpcArgs).toEqual({ p_type: "person", p_first_name: "Rui", p_last_name: "Costa", p_company_name: null });
    expect(plan?.displayName).toBe("Rui Costa");
  });

  it("Empresa que muda so o nome da empresa: chama", () => {
    const org: KindFormState = { kind: "organization", first: "", last: "", company: "Evolar" };
    const plan = planNameSave(org, { ...org, company: "Evolar Moveis" }, "organization");
    expect(plan?.rpcArgs.p_company_name).toBe("Evolar Moveis");
    expect(plan?.displayName).toBe("Evolar Moveis");
  });

  it("Empresa que passa a Pessoa: chama com nome + apelido", () => {
    const org: KindFormState = { kind: "organization", first: "Rui", last: "Silva", company: "Evolar" };
    const plan = planNameSave(org, { ...org, kind: "person" }, "organization");
    expect(plan?.rpcArgs).toEqual({ p_type: "person", p_first_name: "Rui", p_last_name: "Silva", p_company_name: null });
  });

  it("caminho de recurso (RPC em falta): nome pelo tipo escolhido, sem mudar o tipo da ficha", () => {
    const toOrg = planNameSave(original, { ...original, kind: "organization", company: "EVOLAR MOVEIS LDA" }, "person");
    expect(toOrg?.fallback).toEqual({ displayName: "EVOLAR MOVEIS LDA", first: "Rui", last: "Silva" });
    const toPerson = planNameSave(original, { ...original, last: "Costa" }, "person");
    expect(toPerson?.fallback).toEqual({ displayName: "Rui Costa", first: "Rui", last: "Costa" });
    const orgFicha = planNameSave(
      { kind: "organization", first: "Evolar", last: "", company: "Evolar" },
      { kind: "organization", first: "Evolar", last: "", company: "Evolar Moveis" },
      "organization",
    );
    expect(orgFicha?.fallback).toEqual({ displayName: "Evolar Moveis", first: "Evolar Moveis", last: null });
  });
});

describe("isMissingFunctionError", () => {
  it.each([
    [{ code: "PGRST202", message: "Could not find the function public.rpc_set_entity_kind" }, true],
    [{ code: "42883", message: "function rpc_set_entity_kind(uuid) does not exist" }, true],
    [{ message: "Could not find the function public.rpc_set_entity_kind(...) in the schema cache" }, true],
    [{ code: "42501", message: "permission denied" }, false],
    [{ code: "P0001", message: "Nome obrigatorio" }, false],
    [null, false],
  ])("%j -> %s", (error, expected) => {
    expect(isMissingFunctionError(error)).toBe(expected);
  });
});

describe("setEntityKind (cliente tolerante a RPC por aplicar)", () => {
  const plan = planNameSave(
    initialKindState(evolarPerson),
    { ...initialKindState(evolarPerson), kind: "organization", company: "EVOLAR MOVEIS LDA" },
    "person",
  )!;

  it("chama rpc_set_entity_kind com os argumentos e devolve o nome final que a base devolve", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { display_name: "EVOLAR MOVEIS LDA", type: "organization", first_name: "Rui", last_name: "Silva" },
      error: null,
    });
    const r = await setEntityKind({ rpc }, "ent-1", plan);
    expect(rpc).toHaveBeenCalledWith("rpc_set_entity_kind", {
      p_entity_id: "ent-1",
      p_type: "organization",
      p_first_name: null,
      p_last_name: null,
      p_company_name: "EVOLAR MOVEIS LDA",
    });
    expect(r).toEqual({ status: "ok", displayName: "EVOLAR MOVEIS LDA", type: "organization", firstName: "Rui", lastName: "Silva" });
  });

  it("se a resposta nao traz o nome, usa o nome planeado", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    expect(await setEntityKind({ rpc }, "ent-1", plan)).toEqual({
      status: "ok", displayName: "EVOLAR MOVEIS LDA", type: "organization", firstName: null, lastName: null,
    });
  });

  it("funcao em falta (PGRST202): devolve 'missing' em vez de rebentar", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await setEntityKind({ rpc }, "ent-1", plan)).toEqual({ status: "missing" });
  });

  it("outro erro (permissao): propaga, para nao fingir que gravou", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    await expect(setEntityKind({ rpc }, "ent-1", plan)).rejects.toMatchObject({ code: "42501" });
  });
});

const okOutcome = { status: "ok", displayName: "EVOLAR MOVEIS LDA", type: "organization", firstName: "Rui", lastName: "Silva" } as const;

describe("runKindStep (primeira gravacao: o tipo e o nome)", () => {
  const plan = planNameSave(
    initialKindState(evolarPerson),
    { ...initialKindState(evolarPerson), kind: "organization", company: "EVOLAR MOVEIS LDA" },
    "person",
  )!;

  it("sem alteracoes (plano nulo): nao chama a base", async () => {
    const rpc = vi.fn();
    expect(await runKindStep({ rpc }, "ent-1", null)).toEqual({ status: "none" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falha que nao e 'funcao em falta': devolve 'failed' com o erro, nao rebenta", async () => {
    const error = { code: "42501", message: "permission denied" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    expect(await runKindStep({ rpc }, "ent-1", plan)).toEqual({ status: "failed", error });
  });

  it("funcao em falta: 'missing'", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "x" } });
    expect(await runKindStep({ rpc }, "ent-1", plan)).toEqual({ status: "missing" });
  });

  it("corre dentro do envolvente de auditoria que o ecra passa", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { display_name: "X" }, error: null });
    let wrapped = 0;
    const wrap = async <T,>(fn: () => Promise<T>): Promise<T> => { wrapped += 1; return fn(); };
    await runKindStep({ rpc }, "ent-1", plan, wrap);
    expect(wrapped).toBe(1);
  });
});

describe("saveKindThenRest (ordem: primeiro o tipo, depois o resto)", () => {
  const plan = planNameSave(
    initialKindState(evolarPerson),
    { ...initialKindState(evolarPerson), kind: "organization", company: "EVOLAR MOVEIS LDA" },
    "person",
  )!;

  it("chama a RPC do tipo ANTES das outras gravacoes", async () => {
    const calls: string[] = [];
    const rpc = vi.fn().mockImplementation(async () => { calls.push("tipo"); return { data: { display_name: "EVOLAR MOVEIS LDA" }, error: null }; });
    const saveRest = vi.fn().mockImplementation(async () => { calls.push("resto"); return "feito"; });
    const r = await saveKindThenRest({ client: { rpc }, entityId: "ent-1", plan, saveRest });
    expect(calls).toEqual(["tipo", "resto"]);
    expect(saveRest).toHaveBeenCalledWith(expect.objectContaining({ status: "ok", displayName: "EVOLAR MOVEIS LDA" }));
    expect(r.rest).toBe("feito");
  });

  it("o tipo falha (sem permissao): o resto corre na mesma, com o resultado 'failed'", async () => {
    const error = { code: "42501", message: "permission denied" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const saveRest = vi.fn().mockResolvedValue("feito");
    const r = await saveKindThenRest({ client: { rpc }, entityId: "ent-1", plan, saveRest });
    expect(saveRest).toHaveBeenCalledTimes(1);
    expect(saveRest).toHaveBeenCalledWith({ status: "failed", error });
    expect(r.outcome.status).toBe("failed");
    expect(r.rest).toBe("feito");
  });

  it("o resto falha DEPOIS de o tipo ter gravado: o erro sobe, mas o tipo ja ficou certo (nunca 'nome mudou e tipo nao')", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { display_name: "EVOLAR MOVEIS LDA" }, error: null });
    const saveRest = vi.fn().mockRejectedValue(new Error("rpc_update_client recusou"));
    await expect(saveKindThenRest({ client: { rpc }, entityId: "ent-1", plan, saveRest })).rejects.toThrow("recusou");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("sem alteracao do nome/tipo: so corre o resto", async () => {
    const rpc = vi.fn();
    const saveRest = vi.fn().mockResolvedValue(1);
    await saveKindThenRest({ client: { rpc }, entityId: "ent-1", plan: null, saveRest });
    expect(rpc).not.toHaveBeenCalled();
    expect(saveRest).toHaveBeenCalledWith({ status: "none" });
  });
});

describe("clientNameArgsAfterKindStep (o nome que vai para rpc_update_client)", () => {
  const plan = planNameSave(
    initialKindState(evolarPerson),
    { ...initialKindState(evolarPerson), kind: "organization", company: "EVOLAR MOVEIS LDA" },
    "person",
  )!;
  const resolved = { displayName: "EVOLAR LDA", first: "Rui", last: "Silva" };
  const original = { type: "person", displayName: "EVOLAR LDA", first: "Rui", last: "Silva" };

  it("tipo gravado: reenvia o que a base devolveu (nao o nome de recurso) e o tipo novo", () => {
    expect(clientNameArgsAfterKindStep(okOutcome, plan, resolved, original))
      .toEqual({ displayName: "EVOLAR MOVEIS LDA", first: "Rui", last: "Silva", entityType: "organization" });
  });

  it("RPC do tipo em falta (base antiga): nome pelo tipo escolhido E p_entity_type novo, para o codigo poder sair antes da base", () => {
    expect(clientNameArgsAfterKindStep({ status: "missing" }, plan, resolved, original))
      .toEqual({ displayName: "EVOLAR MOVEIS LDA", first: "Rui", last: "Silva", entityType: "organization" });
  });

  it("a RPC do tipo falhou: o nome fica como estava na ficha (nao se grava meio nome)", () => {
    expect(clientNameArgsAfterKindStep({ status: "failed", error: new Error("x") }, plan, resolved, { ...original, displayName: "NOME ANTIGO" }))
      .toEqual({ displayName: "NOME ANTIGO", first: "Rui", last: "Silva", entityType: "person" });
  });

  it("nada mudou: mantem o nome em bruto e o tipo", () => {
    expect(clientNameArgsAfterKindStep({ status: "none" }, null, resolved, original))
      .toEqual({ displayName: "EVOLAR LDA", first: "Rui", last: "Silva", entityType: "person" });
  });
});

describe("leadNameArgsAfterKindStep (o nome que vai para rpc_update_lead)", () => {
  const plan = planNameSave(
    initialKindState(evolarPerson),
    { ...initialKindState(evolarPerson), kind: "organization", company: "EVOLAR MOVEIS LDA" },
    "person",
  )!;

  it("tipo gravado, nada mudou ou falhou: nao envia nome (a lead nao mexe no nome da ficha)", () => {
    expect(leadNameArgsAfterKindStep(okOutcome, plan)).toEqual({});
    expect(leadNameArgsAfterKindStep({ status: "none" }, null)).toEqual({});
    expect(leadNameArgsAfterKindStep({ status: "failed", error: new Error("x") }, plan)).toEqual({});
  });

  it("RPC do tipo em falta: caminho de recurso com o nome pelo tipo escolhido", () => {
    expect(leadNameArgsAfterKindStep({ status: "missing" }, plan))
      .toEqual({ displayName: "EVOLAR MOVEIS LDA", first: "Rui", last: "Silva" });
  });
});

describe("nome inicial do formulario de edicao: vem da ficha quando a lead/cliente nao o tem", () => {
  it("personNamesFromEntity: nome e apelido da ficha", () => {
    expect(personNamesFromEntity({ display_name: "ZZ-TESTE-NOME Rui Neves", first_name: "ZZ-TESTE-NOME Rui", last_name: "Neves" }))
      .toEqual({ first: "ZZ-TESTE-NOME Rui", last: "Neves" });
  });

  it("personNamesFromEntity: ficha so com display_name nunca fica vazia (o nome inteiro vai para Nome)", () => {
    expect(personNamesFromEntity({ display_name: "Evolar  Lda ", first_name: null, last_name: null }))
      .toEqual({ first: "Evolar Lda", last: "" });
  });

  it("personNamesFromEntity: ficha sem nada fica vazia", () => {
    expect(personNamesFromEntity({ display_name: null, first_name: "", last_name: null })).toEqual({ first: "", last: "" });
  });

  it("resolveInitialPersonNames: field_values manda quando tem nome ou apelido", () => {
    expect(resolveInitialPersonNames({ first: "Rui", last: "" }, { first: "Outro", last: "Neves" })).toEqual({ first: "Rui", last: "" });
    expect(resolveInitialPersonNames({ first: "", last: "Costa" }, { first: "Outro", last: "Neves" })).toEqual({ first: "", last: "Costa" });
  });

  it("resolveInitialPersonNames: sem nome em field_values, a ficha (o par, nao campo a campo)", () => {
    expect(resolveInitialPersonNames({ first: "", last: "" }, { first: "ZZ-TESTE-NOME Rui", last: "Neves" }))
      .toEqual({ first: "ZZ-TESTE-NOME Rui", last: "Neves" });
    expect(resolveInitialPersonNames({ first: " ", last: "" }, { first: "Evolar Lda", last: "" })).toEqual({ first: "Evolar Lda", last: "" });
  });

  it("gravar sem alterar nada nao envia nome: original e editado sao o mesmo nome da ficha", () => {
    const names = resolveInitialPersonNames({ first: "", last: "" }, { first: "ZZ-TESTE-NOME Rui", last: "Neves" });
    const state = { kind: "person" as const, first: names.first, last: names.last, company: "" };
    expect(planNameSave(state, { ...state }, "person")).toBeNull();
  });

  it("ficha organizacao: continua Empresa e o nome da empresa e o nome da ficha", () => {
    const s = initialKindState({ type: "organization", display_name: "Evolar Lda", first_name: null, last_name: null });
    expect(s).toMatchObject({ kind: "organization", company: "Evolar Lda" });
  });

  it("ficha pessoa so com display_name: o nome da empresa (modo Empresa) e o display_name", () => {
    const s = initialKindState({ type: "person", display_name: "Evolar Lda", first_name: null, last_name: null });
    expect(s).toMatchObject({ kind: "person", company: "Evolar Lda" });
  });
});
