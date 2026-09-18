import { test, expect } from '@playwright/test';

const MOBILE = { width: 375, height: 812 };
const SAMPLE_TRACT = '12103027703';

test.describe('Mobile details drawer', () => {
  test.use({ viewport: MOBILE });

  test('map fills the viewport and details start closed', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[aria-label="South Pinellas & Gulf Beaches Census tract map"]', { timeout: 15000 });

    const map = page.locator('[aria-label="South Pinellas & Gulf Beaches Census tract map"]');
    const mapBox = await map.boundingBox();
    expect(mapBox).toBeTruthy();
    expect(mapBox!.height).toBeGreaterThan(MOBILE.height * 0.7);

    const tab = page.getByRole('button', { name: 'Show tract details' });
    await expect(tab).toBeVisible();

    const panel = page.locator('#details-panel');
    await expect(panel).toHaveAttribute('aria-hidden', 'true');

    const panelBox = await panel.boundingBox();
    if (panelBox) {
      expect(panelBox.x).toBeGreaterThanOrEqual(MOBILE.width - 1);
    }

    await expect(page.getByRole('region', { name: 'Quarter timeline' })).toBeVisible();
  });

  test('deep-linked tract opens the drawer and close hides it', async ({ page }) => {
    await page.goto(`/?tract=${SAMPLE_TRACT}`);
    await page.waitForSelector('[aria-label="South Pinellas & Gulf Beaches Census tract map"]', { timeout: 15000 });

    const panel = page.locator('#details-panel');
    await expect(panel).not.toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('button', { name: 'Close details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Census Tract 277.03' })).toBeVisible();

    const panelBox = await panel.boundingBox();
    expect(panelBox).toBeTruthy();
    expect(panelBox!.width).toBeGreaterThan(MOBILE.width * 0.85);
    expect(panelBox!.width).toBeLessThanOrEqual(MOBILE.width);

    await page.getByRole('button', { name: 'Close details' }).click();
    await expect(panel).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('button', { name: 'Show tract details' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Quarter timeline' })).toBeVisible();
  });

  test('edge tab reopens the drawer after it is closed', async ({ page }) => {
    await page.goto(`/?tract=${SAMPLE_TRACT}`);
    await page.waitForSelector('[aria-label="South Pinellas & Gulf Beaches Census tract map"]', { timeout: 15000 });

    await page.getByRole('button', { name: 'Close details' }).click();
    await page.getByRole('button', { name: 'Show tract details' }).click();

    await expect(page.locator('#details-panel')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('heading', { name: 'Census Tract 277.03' })).toBeVisible();
  });
});
