# Moradas, ficha do local e moradas no orçamento

> Trabalho de 02/10/2026 no CRM. Publicado em `74b513cd`, `cfbb5173` e
> `7f7d25a8`. Os três SQL de produção já correram.

## O que mudou, em poucas linhas

- **Morada do cliente** (ficha e criação): rua, nº, andar, fração, código
  postal e localidade, com o mesmo validador da morada de entrega. O código
  postal formata-se sozinho (0000-000).
- **Moradas de entrega**: passam a poder ser **editadas** e têm uma
  **Ficha do local** com duas secções, **Exterior** (edifício e acessos) e
  **Interior** (a casa). Na ficha do cliente, cada morada mostra o resumo em
  duas linhas:
  > Exterior: Difícil acesso (+15%) · Estac. pago · 3º de 5 · elevador ×1
  > Interior: T3 · 95 m² · 2 WC · 1985 · canalização ferro · habitada
- **Novo orçamento**: ao escolher a lead ou o cliente aparecem a **Morada
  fiscal** (preenchida sozinha, só leitura) e a **Morada de entrega / do
  serviço** (a 1.ª por defeito, com "+ Nova", "Editar" e o resumo da ficha).
  O detalhe e o PDF do orçamento mostram as duas.
- **Links do percurso** (Lead → Pedido → Proposta → Orçamento → Contrato →
  Cliente) e "Ver cliente" nos contratos abrem a **ficha** do registo
  (`/<lista>?open=<id>`), não a lista.

## Ficha do local

### Campos

**Exterior — edifício e acessos**

| Campo | Valores | Regra |
|---|---|---|
| `acesso` | `facil`, `dificil` | |
| `impacto_percent` | 0–100 | só com acesso difícil |
| `estacionamento` | `pago`, `nao_pago`, `sem_estacionamento` | |
| `zona_estacionamento` | `verde`, `amarela`, `vermelha` | só com estacionamento |
| `tem_elevador` / `n_elevadores` | sim/não; 1–50 | nº só com elevador |
| `n_andares` | 0–200 | o piso da morada não pode passar disto |
| `n_fracoes_por_andar` | 0–200 | |

O **piso** é o `floor` da própria morada (`anew_addresses.floor`). Não há um
segundo campo "piso". A regra piso ≤ andares usa `fn_piso_numerico` na base e
`pisoNumerico` no TS.

**Interior — a casa** (tudo opcional)

| Campo | Valores |
|---|---|
| `tipologia` | T0, T1, T2, T3, T4, T5+ |
| `area_util_m2` | > 0 e ≤ 10000, 2 casas decimais |
| `n_divisoes` / `n_casas_banho` | 0–100 / 0–50 |
| `ano_construcao` | 1800 até ao ano atual |
| `pavimento` | `ceramico`, `madeira`, `flutuante`, `vinilico`, `outro` |
| `eletrica` + `quadro_diferencial` | `antiga`, `renovada`; sim/não |
| `canalizacao` | `ferro`, `pvc`, `multicamada`, `cobre`, `misto`, `nao_sei` |
| `gas` | `canalizado`, `garrafa`, `sem` |
| `amianto` | `sim`, `nao`, `nao_sei` |
| `habitada_durante_obra`, `animais` | sim/não |
| `notas_interior` | até 2000 caracteres |

As regras existem **duas vezes, iguais**: CHECKs + `fn_validar_ficha_edificio`
na base, `validarFichaTecnica` em `src/lib/addresses/fichaTecnicaEdificio.ts`.
Quem mudar uma tem de mudar a outra (os testes de
`fichaTecnicaEdificio.test.ts` cobrem os limites).

### Onde vive

Tabela **`anew_address_building`**, 1:1 com `anew_addresses` (chave
`address_id`). RLS ligada e **sem policies**: só se lê e grava pelas RPCs
(`SECURITY DEFINER`).

- **Porquê tabela à parte e não colunas em `anew_addresses`:** essa tabela
  serve todas as moradas (organizações, utilizadores, contactos, clientes);
  a ficha só interessa às moradas de entrega, e assim só há linha quando
  alguém a preencheu.
- **Porquê o interior na mesma tabela:** uma linha de `anew_addresses` já é a
  casa concreta (rua, nº, **andar e fração** entram no `address_key`). As duas
  secções leem-se e gravam-se sempre juntas.
- **Consequências assumidas:**
  - a ficha é da **morada física**, não do cliente: dois clientes com a mesma
    morada veem a mesma ficha;
  - o exterior repete-se em cada fração do mesmo prédio.

### RPCs

| RPC | O que faz |
|---|---|
| `rpc_list_entity_delivery_addresses(p_entity_id)` | moradas de entrega com a ficha toda |
| `rpc_add_entity_delivery_address(...)` | cria; cada secção só é gravada se vier com algum dado (uma morada reutilizada não perde a ficha) |
| `rpc_update_entity_delivery_address(...)` | edita; exige poder editar o cliente (`fn_entity_delivery_address_access(…, 'edit')`) |

`rpc_update_entity_delivery_address` substitui o exterior como sempre (tudo
NULL = apagar). O **interior só é substituído** com `p_com_interior = true` ou
quando vem algum campo do interior. Assim, um browser com a versão antiga em
cache não apaga o interior gravado.

Os parâmetros novos estão sempre **no fim e com `DEFAULT NULL`**. As
assinaturas antigas são apagadas antes do `CREATE`, porque o PostgREST não
distingue sobrecargas. Os GRANT/REVOKE são repostos (anon sem `EXECUTE`).

**Permissões:** quem só tem acesso às encomendas pode acrescentar moradas de
entrega, mas não editar as que já existem (editar exige poder editar o cliente).

### Ecrãs e código

| Ficheiro | Papel |
|---|---|
| `src/lib/addresses/fichaTecnicaEdificio.ts` | tipos, listas de valores, validação, resumos (`resumoExterior`, `resumoInterior`, `linhasResumoFichaLocal`) |
| `src/lib/addresses/validarMorada.ts` | validador da morada (cliente e entrega) |
| `src/lib/addresses/entityDeliveryAddresses.ts` | listar, criar, editar e remover moradas de entrega |
| `src/components/addresses/CamposMorada.tsx` | campos da morada, partilhados |
| `src/components/addresses/FichaTecnicaCampos.tsx` | formulário da ficha, secções Exterior/Interior colapsáveis |
| `src/components/addresses/FichaLocalResumo.tsx` | resumo em duas linhas |
| `src/components/clients/DeliveryAddressForm.tsx`, `ClientDeliveryAddressesSection.tsx` | moradas de entrega na ficha do cliente |

Os nomes `FichaTecnica…` ficaram por compatibilidade (orçamentos e
encomendas usam-nos); `FichaLocal…` são sinónimos.

## Moradas no orçamento

- **Morada fiscal** = morada principal da **entidade** do orçamento
  (`anew_entity_addresses` ativa, não `delivery`; `is_primary` primeiro).
  A lead e o cliente em que se converte partilham a entidade, por isso a morada
  é a mesma antes e depois. Sem morada, aparece o aviso "Sem morada fiscal",
  com um link para a ficha.
- **Morada de entrega / do serviço** é gravada em:
  - `quotes.site_address_id`: já existia sem uso; ganhou FK para
    `anew_addresses(id)`, `NOT VALID` e `ON DELETE SET NULL`;
  - `quotes.obra_endereco`: o texto formatado, com andar e fração. É o que o
    PDF, a duplicação e as **Operações** leem.
- `rpc_save_quote` **não foi alterada**. O construtor chama
  `rpc_set_quote_morada_entrega` logo a seguir. Se esta falhar, o orçamento
  fica gravado e aparece um aviso.
- RPCs novas: `rpc_get_morada_fiscal(p_entity_id, p_quote_id)` e
  `rpc_set_quote_morada_entrega(p_quote_id, p_address_id)`. Código em
  `src/lib/quotes/quoteMoradas.ts` e `src/components/quote/QuoteMorada*.tsx`.
- Os orçamentos antigos mantêm o texto que tinham até alguém escolher uma
  morada de entrega.

## Migrações e SQL de produção

| Migração | SQL de produção (`reuniao-2026-10-01-operacoes/`) |
|---|---|
| `20261206160000_rpc_update_client_morada_completa.sql` | `crm-morada-cliente.sql` |
| `20261207100000_orcamento_moradas.sql` | `crm-orcamento-moradas.sql` |
| `20261207110000_ficha_local_interior.sql` | `crm-ficha-local-interior.sql` |

Correm **por esta ordem e antes** de publicar a app. Cada uma corre numa
transação, é idempotente e acaba com um bloco `CONFERIR`. Todas já foram
aplicadas em produção a 02/10/2026.

## A seguir

- **Operações a ler a ficha:** aplicar fatores aos tempos previstos da obra
  (por exemplo, demolições num 4.º andar sem elevador) e mostrar a ficha ao
  técnico junto à morada. Ver [`operacao-app/docs/a-seguir.md`](../../../operacao-app/docs/a-seguir.md).
- O `impacto_percent` ainda não entra no preço do orçamento. Por agora é
  só informativo.
- Os ecrãs foram verificados com testes (tipos, 74 testes das moradas,
  clientes e orçamentos, build), mas não com um teste de ponta a ponta no
  browser.
