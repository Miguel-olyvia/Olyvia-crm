import { describe, expect, it } from "vitest";
import {
  isBaseFieldCoveredByCampaignFields,
  stripCampaignCoveredBaseValues,
  type CampaignFieldMappingLike,
} from "@/lib/leads/campaignFieldCoverage";

const baseFields = [
  { field_key: "first_name" },
  { field_key: "last_name" },
  { field_key: "email" },
  { field_key: "phone" },
];

function campaignField(overrides: Partial<CampaignFieldMappingLike> = {}): CampaignFieldMappingLike {
  return {
    field_key: "campo_extra",
    contact_field_mapping: null,
    client_field_mapping: null,
    ...overrides,
  };
}

describe("isBaseFieldCoveredByCampaignFields", () => {
  it("não cobre nada quando não há campos de campanha", () => {
    expect(isBaseFieldCoveredByCampaignFields("email", [])).toBe(false);
  });

  it("cobre por contact_field_mapping", () => {
    const fields = [campaignField({ field_key: "po_email", contact_field_mapping: "email" })];
    expect(isBaseFieldCoveredByCampaignFields("email", fields)).toBe(true);
    expect(isBaseFieldCoveredByCampaignFields("phone", fields)).toBe(false);
  });

  it("cobre por client_field_mapping", () => {
    const fields = [campaignField({ field_key: "nif_cliente", client_field_mapping: "vat" })];
    expect(isBaseFieldCoveredByCampaignFields("vat", fields)).toBe(true);
  });

  it("cobre por field_key igual", () => {
    const fields = [campaignField({ field_key: "email" })];
    expect(isBaseFieldCoveredByCampaignFields("email", fields)).toBe(true);
  });

  it("ignora maiúsculas/minúsculas nos três mapeamentos", () => {
    const fields = [campaignField({ field_key: "PO_Email", contact_field_mapping: "EMAIL" })];
    expect(isBaseFieldCoveredByCampaignFields("Email", fields)).toBe(true);
  });

  it("não trata mapeamentos vazios como cobertura de uma chave vazia", () => {
    const fields = [campaignField({ field_key: "", contact_field_mapping: "", client_field_mapping: null })];
    expect(isBaseFieldCoveredByCampaignFields("", fields)).toBe(false);
    expect(isBaseFieldCoveredByCampaignFields("email", fields)).toBe(false);
  });
});

describe("stripCampaignCoveredBaseValues", () => {
  it("sem campanha escolhida não remove nada", () => {
    const values = { first_name: "Ana", email: "ana@example.com", phone: "910000000" };
    expect(stripCampaignCoveredBaseValues(values, baseFields, [])).toEqual(values);
  });

  it("remove as chaves base que a campanha mapeia (email e telefone)", () => {
    const values = { first_name: "Ana", email: "ana@example.com", phone: "910000000", po_email: "ana@empresa.pt" };
    const campaignFields = [
      campaignField({ field_key: "po_email", contact_field_mapping: "email" }),
      campaignField({ field_key: "po_telefone", contact_field_mapping: "phone" }),
    ];
    expect(stripCampaignCoveredBaseValues(values, baseFields, campaignFields)).toEqual({
      first_name: "Ana",
      po_email: "ana@empresa.pt",
    });
  });

  it("mantém o valor quando a campanha usa a MESMA field_key do campo base", () => {
    // Partilham slot: é o campo da campanha, visível, que escreve nesta chave.
    const values = { email: "ana@example.com", first_name: "Ana" };
    const campaignFields = [campaignField({ field_key: "email" })];
    expect(stripCampaignCoveredBaseValues(values, baseFields, campaignFields)).toEqual(values);
  });

  it("remove a chave base quando a cobertura vem de outra field_key com o mesmo mapeamento", () => {
    const values = { email: "ana@example.com", email_contacto: "ana@empresa.pt" };
    const campaignFields = [campaignField({ field_key: "email_contacto", contact_field_mapping: "email" })];
    expect(stripCampaignCoveredBaseValues(values, baseFields, campaignFields)).toEqual({
      email_contacto: "ana@empresa.pt",
    });
  });

  it("remove quando a cobertura é por client_field_mapping", () => {
    const values = { email: "ana@example.com", nif_cliente: "500000000" };
    const campaignFields = [campaignField({ field_key: "nif_cliente", client_field_mapping: "email" })];
    expect(stripCampaignCoveredBaseValues(values, baseFields, campaignFields)).toEqual({ nif_cliente: "500000000" });
  });

  it("preserva chaves internas e chaves da campanha", () => {
    const values = { email: "ana@example.com", _assigned_to: "user-1", observacoes: "nota" };
    const campaignFields = [campaignField({ field_key: "po_email", contact_field_mapping: "email" })];
    expect(stripCampaignCoveredBaseValues(values, baseFields, campaignFields)).toEqual({
      _assigned_to: "user-1",
      observacoes: "nota",
    });
  });

  it("não muta o objecto original", () => {
    const values = { email: "ana@example.com" };
    const campaignFields = [campaignField({ field_key: "po_email", contact_field_mapping: "email" })];
    stripCampaignCoveredBaseValues(values, baseFields, campaignFields);
    expect(values).toEqual({ email: "ana@example.com" });
  });

  it("caso real: só sobram os campos po_ do João, sem os dados residuais da Catarina", () => {
    // Lead do João criada com as caixas base já preenchidas com os dados de
    // outra cliente ANTES de a campanha ser escolhida -- nesse momento o filtro
    // ainda as desenha, porque `extraCampaignFieldDefs` está vazio. Ao escolher
    // a campanha as caixas desaparecem do ecrã e os valores ficam em memória.
    //
    // Como é que os valores dela lá entraram não ficou provado: pode ter sido
    // escrita à mão ou preenchimento automático do browser (os campos base saem
    // como type="email"/type="tel" e não declaram `autoComplete`). A correcção
    // não depende disso -- o que se corrige é gravar-se o que não se vê.
    const values = {
      first_name: "JOÃO",
      last_name: "GONÇALVES",
      email: "catarinacrv@gmail.com",
      phone: "916379705",
      po_email: "joao.barbosa.goncalves@outlook.pt",
      po_telefone: "932305850",
    };
    const campaignFields = [
      campaignField({ field_key: "first_name", contact_field_mapping: "first_name" }),
      campaignField({ field_key: "last_name", contact_field_mapping: "last_name" }),
      campaignField({ field_key: "po_email", contact_field_mapping: "email" }),
      campaignField({ field_key: "po_telefone", contact_field_mapping: "phone" }),
    ];

    const result = stripCampaignCoveredBaseValues(values, baseFields, campaignFields);

    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
    // O nome sobrevive: a campanha usa as MESMAS chaves e escreveu por cima.
    expect(result).toEqual({
      first_name: "JOÃO",
      last_name: "GONÇALVES",
      po_email: "joao.barbosa.goncalves@outlook.pt",
      po_telefone: "932305850",
    });
  });
});
