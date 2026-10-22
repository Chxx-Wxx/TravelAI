const test = require("node:test");
const assert = require("node:assert/strict");

const transitNameModule = import("./transit-line-name.ts");

test("verified NAVITIME identifiers localize line and stations", async () => {
  const {
    getTransitLineDisplayName,
    getTransitOperatorDisplayName,
    getTransitStationDisplayName,
  } = await transitNameModule;

  assert.deepEqual(
    getTransitLineDisplayName(
      "東武伊勢崎線〔スカイツリーライン〕",
      "00000798",
      "00000123"
    ),
    {
      primaryName: "도부 스카이트리 라인",
      originalName: "東武伊勢崎線〔スカイツリーライン〕",
    }
  );
  assert.deepEqual(
    getTransitStationDisplayName("浅草", "00005270"),
    {
      primaryName: "아사쿠사역",
      originalName: "浅草",
    }
  );
  assert.deepEqual(
    getTransitStationDisplayName(
      "とうきょうスカイツリー[業平橋]",
      "00001789"
    ),
    {
      primaryName: "도쿄 스카이트리역",
      originalName: "とうきょうスカイツリー[業平橋]",
    }
  );
  assert.deepEqual(
    getTransitStationDisplayName(
      "押上[スカイツリー前]",
      "00000813"
    ),
    {
      primaryName: "오시아게역",
      originalName: "押上[スカイツリー前]",
    }
  );
  assert.deepEqual(
    getTransitOperatorDisplayName("東武鉄道", "00000123"),
    {
      primaryName: "도부 철도",
      originalName: "東武鉄道",
    }
  );
});

test("unknown names remain unchanged instead of guessed", async () => {
  const { getTransitStationDisplayName } =
    await transitNameModule;

  assert.deepEqual(
    getTransitStationDisplayName("未確認駅", "unknown"),
    {
      primaryName: "未確認駅",
      originalName: null,
    }
  );
});
