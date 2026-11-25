import { describe, expect, it, vi } from "vitest";
import {
  initialKindState,
  isMissingFunctionError,
  planNameSave,
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
    const rpc = vi.fn().mockResolvedValue({ data: { display_name: "EVOLAR MOVEIS LDA" }, error: null });
    const r = await setEntityKind({ rpc }, "ent-1", plan);
    expect(rpc).toHaveBeenCalledWith("rpc_set_entity_kind", {
      p_entity_id: "ent-1",
      p_type: "organization",
      p_first_name: null,
      p_last_name: null,
      p_company_name: "EVOLAR MOVEIS LDA",
    });
    expect(r).toEqual({ status: "ok", displayName: "EVOLAR MOVEIS LDA" });
  });

  it("se a resposta nao traz o nome, usa o nome planeado", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    expect(await setEntityKind({ rpc }, "ent-1", plan)).toEqual({ status: "ok", displayName: "EVOLAR MOVEIS LDA" });
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
