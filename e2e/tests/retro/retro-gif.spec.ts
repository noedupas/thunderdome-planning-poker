import { Page } from "@playwright/test";
import { expect, test } from "@fixtures/user-sessions";
import { RetroPage } from "@fixtures/pages/retro-page";

// Requires the app to run with CONFIG_GIF_PROVIDER=giphy and any CONFIG_GIF_API_KEY:
// GIPHY is mocked below, no real API call is made and no quota is used.
const GIF_URL = "https://media1.giphy.com/media/e2e/200w.gif?cid=e2e";
// 1x1 transparent GIF
const TINY_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

async function mockGiphy(page: Page) {
  await page.route("https://api.giphy.com/v1/gifs/search**", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "e2e",
            title: "E2E party",
            images: {
              fixed_width: { url: GIF_URL, width: "200", height: "150" },
              fixed_width_small: { url: GIF_URL, width: "100", height: "75" },
            },
          },
        ],
        pagination: { total_count: 1, count: 1, offset: 0 },
      },
    }),
  );
  await page.route("https://*.giphy.com/media/**", (route) =>
    route.fulfill({ body: TINY_GIF, contentType: "image/gif" }),
  );
}

async function addGifItem(bp: RetroPage, text: string) {
  await bp.retroWorkedWellInput.fill(text);
  await bp.retroGifAddBtn.first().click();
  await bp.retroGifSearchInput.fill("party");
  await bp.retroGifResults.first().click();
  await bp.retroGifSubmitBtn.click();
}

const itemGif = (page: Page, text: string) =>
  page.getByTestId("retro-feedback-item").filter({ hasText: text }).getByTestId("retro-item-gif");

test.describe("Retro GIFs", { tag: ["@retro"] }, () => {
  test("a GIF is visible to everyone when feedback is visible", async ({
    registeredPage,
    verifiedPage,
  }) => {
    const retro = await registeredPage.createRetro({
      retroName: "e2e retro gif visible",
      maxVotes: 3,
      brainstormVisibility: "visible",
    });
    await mockGiphy(registeredPage.page);
    await mockGiphy(verifiedPage.page);

    const author = new RetroPage(registeredPage.page);
    await author.goto(retro.id);
    await author.retroPhaseBrainstormBtn.click();
    await addGifItem(author, "Party time");

    await expect(itemGif(author.page, "Party time")).toHaveAttribute("src", GIF_URL);

    const other = new RetroPage(verifiedPage.page);
    await other.goto(retro.id);
    await expect(itemGif(other.page, "Party time")).toBeVisible();
  });

  test("a GIF is hidden from other users when feedback is hidden", async ({
    registeredPage,
    verifiedPage,
  }) => {
    const retro = await registeredPage.createRetro({
      retroName: "e2e retro gif hidden",
      maxVotes: 3,
      brainstormVisibility: "hidden",
    });
    await mockGiphy(registeredPage.page);
    await mockGiphy(verifiedPage.page);

    const author = new RetroPage(registeredPage.page);
    await author.goto(retro.id);
    await author.retroPhaseBrainstormBtn.click();
    await addGifItem(author, "Secret party");

    // the author still sees their own GIF
    await expect(itemGif(author.page, "Secret party")).toBeVisible();

    // another participant sees neither the text nor the GIF
    const other = new RetroPage(verifiedPage.page);
    await other.goto(retro.id);
    await expect(other.page.getByText("Feedback Hidden")).toBeVisible();
    await expect(other.page.getByText("Secret party")).toHaveCount(0);
    await expect(other.retroItemGifs).toHaveCount(0);
  });

  test("a GIF is displayed in every phase after brainstorm and in the export", async ({
    registeredPage,
  }) => {
    const retro = await registeredPage.createRetro({
      retroName: "e2e retro gif phases",
      maxVotes: 3,
      brainstormVisibility: "hidden",
    });
    await mockGiphy(registeredPage.page);

    const bp = new RetroPage(registeredPage.page);
    await bp.goto(retro.id);
    await bp.retroPhaseBrainstormBtn.click();
    await addGifItem(bp, "All phases");

    for (const phaseBtn of [
      bp.retroPhaseGroupBtn,
      bp.retroPhaseVoteBtn,
      bp.retroPhaseActionItemsBtn,
      bp.retroPhaseDoneBtn,
    ]) {
      await phaseBtn.click();
      await expect(itemGif(bp.page, "All phases")).toBeVisible();
    }

    await bp.retroExportBtn.click();
    await expect(bp.retroItemGifs).toHaveCount(1);
    await expect(bp.retroItemGifs).toHaveAttribute("src", GIF_URL);
  });

  test("a GIF is persisted", async ({ registeredPage }) => {
    const retro = await registeredPage.createRetro({
      retroName: "e2e retro gif persistence",
      maxVotes: 3,
      brainstormVisibility: "visible",
    });
    await mockGiphy(registeredPage.page);

    const bp = new RetroPage(registeredPage.page);
    await bp.goto(retro.id);
    await bp.retroPhaseBrainstormBtn.click();
    await addGifItem(bp, "Persisted");
    await expect(itemGif(bp.page, "Persisted")).toBeVisible();

    await bp.page.reload();
    await expect(itemGif(bp.page, "Persisted")).toHaveAttribute("src", GIF_URL);
  });

  test("the GIF picker shows the GIPHY attribution", async ({ registeredPage }) => {
    const retro = await registeredPage.createRetro({
      retroName: "e2e retro gif attribution",
      maxVotes: 3,
      brainstormVisibility: "visible",
    });
    await mockGiphy(registeredPage.page);

    const bp = new RetroPage(registeredPage.page);
    await bp.goto(retro.id);
    await bp.retroPhaseBrainstormBtn.click();
    await bp.retroGifAddBtn.first().click();

    await expect(bp.page.getByTestId("gif-picker-attribution")).toHaveText("Powered by GIPHY");
  });
});
