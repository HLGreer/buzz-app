import { test, expect } from "./fixture.mjs";
import { newChat } from "./navigation.mjs";

const channelId = "33333333-3333-4333-8333-333333333333";
test.use({
  productionBroker: true,
  channelIds: [channelId],
  channelNames: { [channelId]: "Alpha" },
  soloChannels: [channelId],
  ownSoloChannels: [channelId],
  historyCounts: { [channelId]: 1 },
});

// Real flex geometry: an empty loading wrapper can still add a composer gap.
test("settled Solo choices leave only the normal inset below the toolbar", async ({
  page,
  app,
}) => {
  await page.goto(app.origin);
  await newChat(page);
  await page
    .getByRole("navigation", { name: "Solo conversations" })
    .locator(`[data-solo-channel-id="${channelId}"]`)
    .click();
  const input = page.getByRole("textbox", {
    name: "Message your agents",
    exact: true,
  });
  const form = page.locator("form").filter({ has: input });
  await expect(form).toBeVisible();
  await expect(form.locator(".buzz-loading-region")).toHaveCount(0);
  for (const mode of ["light", "dark"]) {
    for (const width of [1440, 600]) {
      await page.setViewportSize({ width, height: 950 });
      await page.locator("html").evaluate((root, mode) => {
        root.dataset.colorMode = mode;
      }, mode);
      const geometry = await form.evaluate((element) => {
        const style = getComputedStyle(element);
        const toolbar = element.querySelector('[aria-label="Send message"]')
          .parentElement.parentElement;
        return {
          inset:
            element.getBoundingClientRect().bottom -
            toolbar.getBoundingClientRect().bottom,
          expected:
            parseFloat(style.paddingBottom) +
            parseFloat(style.borderBottomWidth),
        };
      });
      expect(geometry.inset).toBeCloseTo(geometry.expected, 1);
      await form.screenshot({
        path: test.info().outputPath(`solo-composer-${mode}-${width}.png`),
      });
    }
  }
});
