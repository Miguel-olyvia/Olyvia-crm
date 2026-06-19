# Fase 0 — Inventário read-only dos 4 blocos

Mapeamento 1:1 do binding hardcoded **atual**. Cada `defaultResolver` no `registry.ts` deve reproduzir exatamente esta coluna. Sem isto não há garantia de não-regressão.

Convenção de contexto: `ctx = { quote, client, company, commercial, authUser, proposal?, contract? }`.

## 1. Rodapé / contacto (PDF)

Fonte: `QuotePDFDocument.tsx` (linhas 783-802) + `generateQuotePdfBlob.ts` + `QuotePdfPreviewDialog.tsx` via `resolveQuotePdfCommercialUser`.

| Chave registry         | Label humano                          | Default resolver atual                                                                 |
|------------------------|---------------------------------------|----------------------------------------------------------------------------------------|
| `footer.commercial.name`  | Rodapé · Nome do comercial         | `commercial.name` (resolveQuotePdfCommercialUser: assigned_to → created_by → authUser) |
| `footer.commercial.email` | Rodapé · Email do comercial        | `commercial.email`                                                                     |
| `footer.commercial.phone` | Rodapé · Telefone do comercial     | `commercial.phone`                                                                     |
| `footer.legalText`        | Rodapé · Texto legal               | `proposalTemplate.footer_text` (mantido em template, não no resolver — fica como está) |

## 2. Bloco do cliente (PDF)

Fonte: `QuotePDFDocument.tsx` (linhas 541-554) com `client` montado por `resolveQuotePdfClient` → `buildEntityClientForPdf`.

| Chave registry      | Label humano        | Default resolver atual                                                  |
|---------------------|---------------------|-------------------------------------------------------------------------|
| `client.name`       | Cliente · Nome      | `client.display_name` (já é entity.display_name ou first+last)          |
| `client.email`      | Cliente · Email     | `client.email` (anew_entity_emails primary)                             |
| `client.phone`      | Cliente · Telefone  | `client.phone` (anew_entity_phones primary)                             |
| `client.vat`        | Cliente · NIF       | `client.vat` (fiscal_entities.nif via anew_entity_fiscal_entities)      |
| `client.address`    | Cliente · Morada    | primary de `client.client_addresses` formatado (já calculado no PDF)    |

## 3. Bloco da empresa (PDF)

Fonte: `QuotePDFDocument.tsx` (linhas 530-539) com `company` montado em `generateQuotePdfBlob` e `QuotePdfPreviewDialog` a partir de `anew_organizations`.

| Chave registry        | Label humano         | Default resolver atual                                              |
|-----------------------|----------------------|---------------------------------------------------------------------|
| `company.name`        | Empresa · Nome       | `org.name`                                                          |
| `company.vat`         | Empresa · NIF        | `org.metadata.vat`                                                  |
| `company.email`       | Empresa · Email      | `org.metadata.email`                                                |
| `company.phone`       | Empresa · Telefone   | `org.metadata.phone` (+ `phone_country_code`)                       |
| `company.logo`        | Empresa · Logótipo   | `org.logo_url` (base64 no PDF, URL no preview)                      |
| `company.address`     | Empresa · Morada     | `companyFullAddress` (atualmente vazio — `company_addresses: []`)   |

## 4. Email de envio

Fonte: `src/utils/emailTemplateVariables.ts` (resolveEntityVariables) + edge functions `send-quote-email`, `send-proposal-email`, `trigger-email-template`.

### Aliases obrigatórios (paridade FE ↔ edge)

| Alias `{{...}}`        | Chave registry canónica       | Default resolver atual                                                  |
|------------------------|-------------------------------|-------------------------------------------------------------------------|
| `{{nome_cliente}}`     | `client.name`                 | entity.display_name do cliente do documento                             |
| `{{nome_utilizador}}`  | `commercial.name`             | anewUser.name do auth user (no email é o utilizador autenticado)        |
| `{{nome_empresa}}`     | `company.name`                | org.name                                                                |
| `{{titulo_proposta}}`  | `proposal.title`              | proposals.title                                                         |
| `{{valor_proposta}}`   | `proposal.value`              | formatCurrency(proposals.value) — pt-PT, € prefix                       |
| `{{link_proposta}}`    | `proposal.publicUrl`          | proposals.public_url ou `${origin}/public-proposal/${proposal.id}`      |

### Variáveis legadas mantidas com aliases (não removidas)

`company_name`, `company_email`, `company_phone`, `commercial_name`, `commercial_email`, `commercial_phone`, `client_name`, `client_email`, `client_phone`, `client_nif`, `proposal_title`, `proposal_value`, `proposal_link`, `quote_title`, `quote_value`, `quote_number`, `contract_*`. **Mantêm-se a funcionar** via tabela de aliases no resolver.

## Regras invariantes para os resolvers

1. Resolver **nunca** lê pricing, IVA, fees, bundles, snapshots, catálogo.
2. Resolver recebe `ctx` já populado pelos resolvers existentes (`resolveQuotePdfClient`, `resolveQuotePdfCommercialUser`, fetch de `anew_organizations`).
3. Sem `fieldModes[key]` ou com `"default"` → chama `defaultResolver(ctx)` que devolve o mesmo valor que o código hardcoded atual.
4. `"variable"` → resolve por outra chave do registry (mesma `ctx`).
5. `"fixed"` → devolve texto literal de `fieldFallbacks[key]`.
6. Vazio + modo `"variable"` no envio/PDF final → erro estruturado `{ field, label, mode: "variable" }` para UI mostrar mensagem amigável.
7. Vazio + modo `"default"` → mantém comportamento atual (string vazia, secção condicional não renderiza).
