function installHeadedSceneBreaks(test) {
  test.beforeEach(async ({ page }, testInfo) => {
    if (process.env.PW_SCENE_BREAKS !== "1") {
      return;
    }

    await page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Next Test</title>
          <style>
            :root {
              color-scheme: light;
            }

            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: #f4f4ef;
              color: #183b2d;
              font-family: Georgia, "Times New Roman", serif;
            }

            .scene-break {
              width: min(52rem, calc(100vw - 4rem));
              padding: 2.25rem 2.5rem;
              border: 1px solid #c8d5ca;
              background: rgba(255, 255, 255, 0.92);
              box-shadow: 0 18px 40px rgba(24, 59, 45, 0.08);
            }

            .eyebrow {
              margin: 0 0 0.75rem;
              font: 600 0.8rem/1.2 system-ui, sans-serif;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #4e675a;
            }

            h1 {
              margin: 0;
              font-size: clamp(2rem, 4vw, 3.25rem);
              line-height: 1.05;
            }
          </style>
        </head>
        <body>
          <section class="scene-break">
            <p class="eyebrow">Next Test</p>
            <h1>${escapeHtml(testInfo.title)}</h1>
          </section>
        </body>
      </html>
    `);

    await page.waitForTimeout(2000);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

module.exports = {
  installHeadedSceneBreaks,
};
