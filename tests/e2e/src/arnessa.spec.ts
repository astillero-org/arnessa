import { test, expect } from '@playwright/test';

test.describe('Arnessa E2E Scenarios', () => {
  
  test('basic message: should receive RUN_FINISHED', async ({ page }) => {
    await page.goto('/e2e/basic-message');
    
    // Wait for the message list to show run_complete
    const messages = page.locator('#messages');
    await expect(messages).toContainText('RUN_FINISHED');
    await expect(messages).toContainText('Arnessa is alive');
  });

  test('state patch: should update UI count', async ({ page }) => {
    await page.goto('/e2e/state-patch');
    
    const countVal = page.locator('#count-val');
    // It should eventually show 99
    await expect(countVal).toHaveText('99', { timeout: 15000 });
  });

  test('dynamic ui: should mount component in slot', async ({ page }) => {
    await page.goto('/e2e/dynamic-ui');
    
    const badge = page.locator('#test-badge');
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toContainText('Badge: 25');
  });

  test('deferred tool: should resolve and complete run', async ({ page }) => {
    await page.goto('/e2e/deferred-tool');
    
    // 1. Wait for deferred UI to appear
    const deferredUi = page.locator('#deferred-ui');
    await expect(deferredUi).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#deferred-question')).toContainText('What is your favorite color?');

    // 2. Click resolve
    await page.click('#resolve-btn');

    // 3. Wait for run completion
    const messages = page.locator('#messages');
    await expect(messages).toContainText('toolResolutionAck', { timeout: 15000 });
    await expect(messages).toContainText('RUN_FINISHED', { timeout: 15000 });
  });

  test('drawing approval: should ask, approve, and render image', async ({ page }) => {
    await page.goto('/e2e/drawing-approval');

    const renderedChat = page.locator('#chat-rendered');
    await expect(renderedChat).toContainText('Approval needed', { timeout: 15000 });
    await expect(renderedChat).toContainText('Allow Arnessa to draw this furniture image?');
    await expect(renderedChat).toContainText('Draw a yellow lounge chair');

    await renderedChat.getByRole('button', { name: 'Allow' }).click();

    await expect(page.locator('#messages')).toContainText('toolResolutionAck', { timeout: 15000 });
    await expect(renderedChat.locator('img')).toBeVisible({ timeout: 15000 });
    await expect(renderedChat).toContainText('Approved drawing sent.', { timeout: 15000 });
  });

});
