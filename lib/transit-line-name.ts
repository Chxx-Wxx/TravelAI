const KOREAN_TRANSIT_LINE_NAMES: Readonly<
  Record<string, string>
> = {
  JR山手線: "JR 야마노테선",
  JR中央線: "JR 주오선",
  JR中央総武線各停: "JR 주오·소부선 각역정차",
  JR埼京線: "JR 사이쿄선",
  JR京浜東北線: "JR 게이힌토호쿠선",
  東京メトロ銀座線: "도쿄메트로 긴자선",
  東京メトロ丸ノ内線: "도쿄메트로 마루노우치선",
  東京メトロ日比谷線: "도쿄메트로 히비야선",
  東京メトロ東西線: "도쿄메트로 도자이선",
  東京メトロ千代田線: "도쿄메트로 지요다선",
  東京メトロ有楽町線: "도쿄메트로 유라쿠초선",
  東京メトロ半蔵門線: "도쿄메트로 한조몬선",
  東京メトロ南北線: "도쿄메트로 난보쿠선",
  東京メトロ副都心線: "도쿄메트로 후쿠토신선",
  都営浅草線: "도에이 아사쿠사선",
  都営三田線: "도에이 미타선",
  都営新宿線: "도에이 신주쿠선",
  都営大江戸線: "도에이 오에도선",
  OsakaMetro御堂筋線: "오사카메트로 미도스지선",
  "のぞみ(東海道)": "노조미(도카이도 신칸센)",
  JR東海道新幹線: "JR 도카이도 신칸센",
  東海道新幹線: "도카이도 신칸센",
};

function normalizeOperatorNotationForLookup(
  lineName: string
) {
  return lineName
    .replace(/^Osaka\s*Metro\s*/i, "OsakaMetro")
    .replace(/^大阪メトロ\s*/, "OsakaMetro");
}

export function normalizeTransitLineNameForDisplay(
  lineName: string
) {
  return lineName
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

export function localizeTransitLineName(
  lineName: string
) {
  const normalizedLineName =
    normalizeTransitLineNameForDisplay(lineName);
  const lookupLineName =
    normalizeOperatorNotationForLookup(
      normalizedLineName
    );

  return (
    KOREAN_TRANSIT_LINE_NAMES[lookupLineName] ??
    normalizedLineName
  );
}
