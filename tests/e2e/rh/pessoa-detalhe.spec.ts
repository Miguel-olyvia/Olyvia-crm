import { test, expect } from '@playwright/test'

// O painel DETALHES da visao geral de uma ficha.
//
// Existe por causa de um defeito concreto: a entidade legal nao se escolhe --
// e sempre a da organizacao -- e por isso a coluna fica nula em todas as
// fichas. O valor era calculado uma vez e usado em dois sitios, e so um deles
// tinha a alternativa. O painel dizia "Nao preenchido" ao lado do separador
// Laborais, que mostrava o nome certo.
//
// Nao escreve nada: abre a primeira ficha da lista e le.

const NIKE = 'b6ffce4f-f630-4933-833a-008649757a33'

async function abrirPrimeiraFicha(page: import('@playwright/test').Page) {
  await page.addInitScript(id => localStorage.setItem('activeCompanyId', id), NIKE)
  await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })
  const primeira = page.locator('table tbody tr').first()
  await expect(primeira).toBeVisible({ timeout: 60000 })
  await primeira.click()
  await page.waitForURL(/\/rh\/pessoas\/[0-9a-f-]{36}/, { timeout: 30000 })
}

test.describe('RH — detalhe de uma pessoa', () => {
  test('a entidade legal mostra a organizacao, nunca "Nao preenchido"', async ({ page }) => {
    await page.addInitScript(id => localStorage.setItem('activeCompanyId', id), NIKE)
    await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })

    const primeira = page.locator('table tbody tr').first()
    await expect(primeira).toBeVisible({ timeout: 60000 })
    await primeira.click()
    await page.waitForURL(/\/rh\/pessoas\/[0-9a-f-]{36}/, { timeout: 30000 })

    // O painel lateral da visao geral.
    const etiqueta = page.getByText(/^entidade legal$|^legal entity$/i).first()
    await expect(etiqueta, 'o painel de detalhes nao tem a entidade legal').toBeVisible({ timeout: 30000 })

    // O valor e o irmao imediato da etiqueta no painel.
    const valor = etiqueta.locator('xpath=following-sibling::*[1]')
    const texto = (await valor.innerText()).trim()

    expect(
      texto,
      'a entidade legal aparece por preencher, quando e sempre a da organizacao',
    ).not.toMatch(/não preenchido|nao preenchido|not filled|—|^$/i)

    // E e mesmo o nome de uma organizacao, nao um identificador.
    expect(texto.length, `valor inesperado na entidade legal: "${texto}"`).toBeGreaterThan(1)
    console.log('ENTIDADE LEGAL :: ' + texto)
  })

  test('sem contrato, o cartao nao diz "em vigor" nem se contradiz', async ({ page }) => {
    await abrirPrimeiraFicha(page)
    await page.getByRole('tab', { name: /contratos|contracts/i }).click()

    const cartao = page.locator('div').filter({ hasText: /^(Novo contrato|New contract|Contrato em vigor|Current contract)/ }).first()
    await expect(cartao).toBeVisible({ timeout: 30000 })

    const criar = page.getByRole('button', { name: /^criar$|^create$/i })
    const temContrato = !(await criar.isVisible().catch(() => false))

    if (!temContrato) {
      // O botao diz "Criar": nao ha contrato. Entao o titulo nao pode dizer
      // que ha um, nem pode existir uma etiqueta a dizer o contrario.
      await expect(
        page.getByText(/contrato em vigor|current contract/i),
        'o titulo diz "em vigor" mas o botao diz "Criar"',
      ).toHaveCount(0)
      await expect(
        page.getByText(/^sem contrato$|^no contract yet$/i),
        'a etiqueta "Sem contrato" continua ao lado do titulo',
      ).toHaveCount(0)
      await expect(page.getByText(/novo contrato|new contract/i).first()).toBeVisible()
    }
  })

  test('os campos do periodo experimental so aparecem depois de o ligar', async ({ page }) => {
    await abrirPrimeiraFicha(page)
    await page.getByRole('tab', { name: /contratos|contracts/i }).click()

    const interruptor = page.getByRole('switch', { name: /período experimental|periodo experimental|probation period/i })
    await expect(interruptor, 'nao ha interruptor de periodo experimental').toBeVisible({ timeout: 30000 })

    const dias = page.getByLabel(/período experimental \(dias\)|probation period \(days\)/i)
    const ate = page.getByLabel(/período experimental até|probation ends on/i)

    if (await interruptor.isChecked()) {
      await interruptor.click()
    }
    await expect(dias, 'os campos aparecem com o interruptor desligado').toHaveCount(0)
    await expect(ate).toHaveCount(0)

    await interruptor.click()
    await expect(dias, 'ligar o interruptor nao mostrou os campos').toBeVisible()
    await expect(ate).toBeVisible()

    // E desligar volta a escondê-los, limpos.
    await dias.fill('90')
    await interruptor.click()
    await expect(dias).toHaveCount(0)
    await interruptor.click()
    await expect(dias, 'desligar nao limpou o que la estava').toHaveValue('')
  })
})
