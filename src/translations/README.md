# Traduções

O texto da interface vem de `index.ts` (uma entrada por língua: PT, EN, ES, FR,
DE) e de módulos à parte (`today.ts`, `directSales`, `bundles`,
`priceContexts`…), juntos em `src/hooks/useTranslation.ts`. Quando falta uma
chave na língua da pessoa, o hook recua para EN.

## Falha conhecida: a interface não é totalmente traduzível

**Estado a 04/10/2026.** Na fase 0 da reestruturação do CRM, todas as chaves de
EN passaram a existir em PT (faltavam 71), e cerca de 200 textos em inglês
fixo no código passaram a `t()`. **O resto fica por resolver:**

| O quê | Tamanho | Efeito |
|---|---|---|
| Português fixo no código, sem `t()` | ~1650 textos. Os piores: `CampaignBrandingConfig`, `DealNeedsSection`, `ProposalTemplateEditor`, `LeadWorkflowConfig`, `DealNeedDiagnostic`, as abas do detalhe da lead, `CampaignDetail`, `ChannelOverviewTab`, `AnewLeads`, `Proposals` | Aparece bem em PT, mas não muda de língua |
| Padrão `t('x') \|\| 'texto PT'` | 274 vezes em 29 ficheiros | Esconde chaves em falta: o ecrã nunca mostra a chave crua |
| ES, FR e DE incompletas | faltam 468–486 chaves usadas em cada uma | Estas línguas mostram uma mistura com inglês |
| Lista de tipos de campo em inglês em `CampaignFormBuilder.tsx` | 1 array fora do componente | Mudar obriga a reestruturar (o array não tem acesso a `t`) |
| Corpo dos emails de teste SMTP em inglês (`Settings.tsx`, `EditProfileDialog.tsx`) | 2 | É conteúdo do email, não do ecrã |
| `aria-label="Select language"` em `FormLocaleSwitcher.tsx` | 1 | Formulário público, com língua própria |
| Termos técnicos deixados em inglês | "Template", "Preview", "Role", "User Agent", "Workflow", "Leads", "Bundles" | Decidir se ficam ou se se traduzem ("Modelo", "Pré-visualização", "Função"…) |

**Como resolver, quando for a altura:**

1. Decidir primeiro se o CRM vai mesmo ser usado noutras línguas. Se for só
   PT, a prioridade baixa muito: basta acabar com o inglês fixo.
2. Ficheiro a ficheiro, começar pelos ecrãs mais usados (leads, negócios,
   orçamentos). Passar o texto a `t()` e criar as chaves em PT e EN.
3. Tirar os `|| 'fallback'` à medida que as chaves existem.
4. Acrescentar um teste que falhe se uma chave usada no código não existir em
   PT ou EN. Há um script de comparação usado na fase 0 que pode servir de base.

Ver também a proposta de reestruturação do CRM (auditoria de 04/10/2026, §
Interface: "Português de Portugal a 100%").
