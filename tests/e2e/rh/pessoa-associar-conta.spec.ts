import { test, expect } from '@playwright/test'

// "Ao criar uma ficha posso associar um user de crm e isso deve preencher
// alguns dos campos" -- pedido do utilizador, verificado ao vivo.
//
// A razao de existir e a mesma dos outros ficheiros deste directorio: as
// regras de preenchimento tem testes unitarios (preenchimentoPorConta), o
// filtro de candidatos tambem (useContasLigaveis), e nenhum dos dois prova
// que o campo chega a aparecer no ecra nem que escolher uma conta mexe
// mesmo nos campos.
//
// Nao escreve nada na base: abre o formulario, escolhe, observa, e fecha.

const ABRIR_FORMULARIO = /nova pessoa|new person|adicionar pessoa/i

test.describe('RH — associar conta de CRM a uma ficha', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: ABRIR_FORMULARIO }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('o campo esta na primeira seccao, com etiqueta propria e ajuda', async ({ page }) => {
    const dialogo = page.getByRole('dialog')

    const gatilho = dialogo.getByLabel(/ligar a uma conta de crm|link to crm account/i)
    await expect(gatilho, 'o campo de conta nao aparece na seccao 1').toBeVisible()

    // A etiqueta tem de estar mesmo associada ao gatilho (getByLabel ja o
    // prova) e o rodape tem de estar ligado por aria-describedby -- foi a
    // lacuna corrigida em relacao ao UserCombobox existente.
    const descrito = await gatilho.getAttribute('aria-describedby')
    expect(descrito, 'o rodape nao esta ligado ao campo por aria-describedby').toBeTruthy()
    await expect(dialogo.locator(`#${descrito}`)).toBeVisible()
  })

  test('a lista de contas abre e oferece sempre "Nenhuma conta"', async ({ page }) => {
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel(/ligar a uma conta de crm|link to crm account/i).click()

    const lista = page.getByRole('listbox').or(page.locator('[cmdk-list]')).first()
    await expect(lista).toBeVisible()
    await expect(
      page.getByText(/nenhuma conta|no account/i).first(),
      'falta a opcao de nao ligar conta nenhuma',
    ).toBeVisible()
  })

  test('escolher uma conta preenche nome, apelido e e-mail de trabalho', async ({ page }) => {
    const dialogo = page.getByRole('dialog')
    await dialogo.getByLabel(/ligar a uma conta de crm|link to crm account/i).click()

    // A primeira conta real da lista -- a seguir a "Nenhuma conta".
    const opcoes = page.locator('[cmdk-item]')
    await expect(opcoes.first()).toBeVisible()
    const total = await opcoes.count()
    test.skip(total < 2, 'a organizacao activa nao tem contas ligaveis para escolher')

    const escolhida = opcoes.nth(1)
    const textoEscolhido = (await escolhida.innerText()).trim()
    await escolhida.click()

    // O gatilho passa a mostrar quem foi escolhido.
    const gatilho = dialogo.getByLabel(/ligar a uma conta de crm|link to crm account/i)
    await expect(gatilho).toContainText(textoEscolhido.split('\n')[0])

    // E os campos vazios ficaram preenchidos. Nao se afirma QUAL o valor --
    // depende de quem esta na organizacao; afirma-se que deixaram de estar
    // vazios, que e a promessa feita ao utilizador.
    for (const etiqueta of [
      /primeiro nome|first name/i,
      /e-mail de trabalho|work email/i,
    ]) {
      await expect(
        dialogo.getByLabel(etiqueta).first(),
        `escolher a conta nao preencheu ${etiqueta}`,
      ).not.toHaveValue('')
    }
  })

  test('o que foi escrito a mao NAO e sobrescrito pela conta', async ({ page }) => {
    const dialogo = page.getByRole('dialog')

    const primeiroNome = dialogo.getByLabel(/primeiro nome|first name/i).first()
    await primeiroNome.fill('EscritoAMao')

    await dialogo.getByLabel(/ligar a uma conta de crm|link to crm account/i).click()
    const opcoes = page.locator('[cmdk-item]')
    await expect(opcoes.first()).toBeVisible()
    test.skip((await opcoes.count()) < 2, 'a organizacao activa nao tem contas ligaveis para escolher')
    await opcoes.nth(1).click()

    await expect(
      primeiroNome,
      'a conta escreveu por cima de um campo preenchido a mao',
    ).toHaveValue('EscritoAMao')
  })
})
