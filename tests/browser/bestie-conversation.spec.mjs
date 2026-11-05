import { test, expect } from "./source-fixture.mjs";

// Browser-only integration: native layout, split geometry, retained DOM while
// dragging a thread between panes, focus, and responsive/theme/text-size treatment.
test("Bestie uses the conversation split workspace and retains both drafts", async ({
  page,
}, testInfo) => {
  await page.goto("/tests/fixtures/bestie-conversation.html");
  const composer = page.getByRole("textbox", { name: "Message Bestie" });
  await composer.fill("Main draft");
  const handle = await composer.elementHandle();
  await page
    .getByRole("button", { name: "View thread: 1 reply" })
    .first()
    .click();
  const thread = page.getByLabel("Thread", { exact: true });
  await expect(thread).toBeVisible();
  await expect(composer).toBeVisible();
  const reply = page.getByRole("textbox", { name: "Reply to thread" });
  await reply.fill("Reply draft");
  const replyHandle = await reply.elementHandle();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.dataset.colorMode = theme;
    }, theme);
    for (const width of [1440, 800, 480]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(thread).toBeVisible();
      expect(
        await page
          .locator("body")
          .evaluate((el) => el.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expect
        .poll(async () => {
          const box = await page.locator("[data-panel-dock]").boundingBox();
          return box ? Math.round(box.x + box.width) : 0;
        })
        .toBe(width);
      if (
        process.env.BESTIE_SHOTS &&
        testInfo.project.name === "chromium" &&
        (width === 1440 || (width === 480 && theme === "dark"))
      ) {
        await page.screenshot({
          path: `${process.env.BESTIE_SHOTS}/final-${theme}-${width}-thread.png`,
        });
      }
      if (width === 1440) {
        const chatBox = await composer.boundingBox(),
          threadBox = await thread.boundingBox();
        expect(chatBox.x + chatBox.width).toBeLessThanOrEqual(threadBox.x);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await expect(thread).toBeVisible();
  await page.getByRole("button", { name: "Toggle tab pane" }).click();
  await expect(thread).not.toBeVisible();
  await expect(composer).toHaveText("Main draft");
  await page.getByRole("button", { name: "Toggle tab pane" }).click();
  await expect(reply).toHaveText("Reply draft");
  expect(await replyHandle.evaluate((el) => el.isConnected)).toBe(true);
  expect(await handle.evaluate((el) => el.isConnected)).toBe(true);
  const tab = page.getByRole("tab", { name: "Planning the day", exact: true });
  await tab.focus();
  await page.keyboard.press("Alt+Shift+ArrowLeft");
  await expect(
    page
      .locator("[data-main-workspace]")
      .getByRole("tab", { name: "Planning the day", exact: true }),
  ).toBeVisible();
  await expect(reply).toHaveText("Reply draft");
  await page
    .getByRole("button", { name: "Close Planning the day tab" })
    .click();
  await expect(composer).toBeVisible();
  await expect(composer).toHaveText("Main draft");
});

test("Bestie retains multiple threads and closes inactive tabs without stealing reply focus", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/bestie-conversation.html");
  const buttons = page.getByRole("button", { name: "View thread: 1 reply" });
  await buttons.nth(0).click();
  await expect(
    page.getByRole("tab", { name: "Planning the day", exact: true }),
  ).toBeVisible();
  await buttons.nth(1).click();
  const reply = page.getByRole("textbox", { name: "Reply to thread" });
  await reply.fill("Keep typing here");
  await page
    .getByRole("button", { name: "Close Planning the day tab" })
    .click();
  await expect(reply).toHaveText("Keep typing here");
  await expect(
    page.getByRole("tab", { name: "A second conversation", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  // Keyboard Close from the inactive tab exercises removal while its neighbour
  // remains selected, without a pointer deliberately moving focus elsewhere.
  await buttons.nth(0).click();
  await page
    .getByRole("tab", { name: "A second conversation", exact: true })
    .click();
  await reply.focus();
  await expect(reply).toBeFocused();
  await page.evaluate(() => {
    document.querySelector('[aria-label="Close Planning the day tab"]').click();
  });
  await expect(reply).toBeFocused();
  const target = await page.evaluate(() => window.bestieFixture.target());
  await page.evaluate(() => {
    void window.bestieFixture.open({
      version: 1,
      kind: "page",
      pluginId: "buzz.bestie",
      pageId: "bestie",
    });
  });
  await page.getByRole("textbox", { name: "Message Bestie" }).focus();
  await page.evaluate((target) => {
    void window.bestieFixture.open(target);
  }, target);
  await expect(
    page.locator("[data-panel-workspace] [data-message-id]").first(),
  ).toBeFocused();
});

test("Bestie profile tabs restore with history and explicit Close retires their visits", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/bestie-conversation.html");
  await page.getByRole("link", { name: "View profile" }).click();
  await expect(
    page.getByRole("tab", { name: "Profile", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fixture profile", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.bestieFixture.back());
  await expect
    .poll(() => page.evaluate(() => window.bestieFixture.target().route))
    .toBeUndefined();
  await page.evaluate(() => window.bestieFixture.forward());
  await expect(
    page.getByText("Fixture profile", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Profile tab" }).click();
  await expect(
    page.getByRole("tab", { name: "Profile", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.bestieFixture.back());
  await page.evaluate(() => window.bestieFixture.forward());
  await expect(
    page.getByRole("tab", { name: "Profile", exact: true }),
  ).toHaveCount(0);
});
