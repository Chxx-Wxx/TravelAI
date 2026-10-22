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
  "東武伊勢崎線〔スカイツリーライン〕":
    "도부 스카이트리 라인",
  "東武伊勢崎線〔スカイツリーライン〕（浅草-東武動物公園）":
    "도부 스카이트리 라인",
  東武スカイツリーライン: "도부 스카이트리 라인",
};

const KOREAN_TRANSIT_LINES_BY_ID: Readonly<
  Record<string, string>
> = {
  "00000123:00000798": "도부 스카이트리 라인",
  "00000123:00000999": "도부 스카이트리 라인",
  "00000121:00000795": "도에이 아사쿠사선",
};

const KOREAN_TRANSIT_STATIONS_BY_ID: Readonly<
  Record<string, string>
> = {
  "00005270": "아사쿠사역",
  "00001789": "도쿄 스카이트리역",
  "00000813": "오시아게역",
  "00000323": "이세사키역",
};

const KOREAN_TRANSIT_STATION_NAMES: Readonly<
  Record<string, string>
> = {
  浅草: "아사쿠사역",
  浅草駅: "아사쿠사역",
  "とうきょうスカイツリー[業平橋]":
    "도쿄 스카이트리역",
  とうきょうスカイツリー駅: "도쿄 스카이트리역",
  "押上[スカイツリー前]": "오시아게역",
  押上: "오시아게역",
  押上駅: "오시아게역",
  伊勢崎: "이세사키역",
};

const KOREAN_TRANSIT_OPERATORS_BY_ID: Readonly<
  Record<string, string>
> = {
  "00000123": "도부 철도",
  "00000121": "도쿄도 교통국",
};

const KOREAN_TRANSIT_OPERATOR_NAMES: Readonly<
  Record<string, string>
> = {
  東武鉄道: "도부 철도",
  東京都交通局: "도쿄도 교통국",
};

export type LocalizedTransitName = {
  primaryName: string;
  originalName: string | null;
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
  lineName: string,
  lineId?: string,
  operatorId?: string
) {
  const normalizedLineName =
    normalizeTransitLineNameForDisplay(lineName);
  const lookupLineName =
    normalizeOperatorNotationForLookup(
      normalizedLineName
    );

  const idKey =
    lineId && operatorId
      ? `${operatorId}:${lineId}`
      : null;

  return (
    (idKey
      ? KOREAN_TRANSIT_LINES_BY_ID[idKey]
      : undefined) ??
    KOREAN_TRANSIT_LINE_NAMES[lookupLineName] ??
    normalizedLineName
  );
}

function createLocalizedTransitName(
  originalName: string,
  primaryName: string
): LocalizedTransitName {
  const normalizedOriginal =
    normalizeTransitLineNameForDisplay(originalName);

  return {
    primaryName,
    originalName:
      primaryName === normalizedOriginal
        ? null
        : normalizedOriginal,
  };
}

export function getTransitLineDisplayName(
  lineName: string,
  lineId?: string,
  operatorId?: string
) {
  return createLocalizedTransitName(
    lineName,
    localizeTransitLineName(
      lineName,
      lineId,
      operatorId
    )
  );
}

export function getTransitStationDisplayName(
  stationName: string,
  stationId?: string
) {
  const normalizedName =
    normalizeTransitLineNameForDisplay(stationName);
  const localizedName =
    (stationId
      ? KOREAN_TRANSIT_STATIONS_BY_ID[stationId]
      : undefined) ??
    KOREAN_TRANSIT_STATION_NAMES[normalizedName] ??
    normalizedName;

  return createLocalizedTransitName(
    stationName,
    localizedName
  );
}

export function getTransitOperatorDisplayName(
  operatorName: string,
  operatorId?: string
) {
  const normalizedName =
    normalizeTransitLineNameForDisplay(operatorName);
  const localizedName =
    (operatorId
      ? KOREAN_TRANSIT_OPERATORS_BY_ID[operatorId]
      : undefined) ??
    KOREAN_TRANSIT_OPERATOR_NAMES[normalizedName] ??
    normalizedName;

  return createLocalizedTransitName(
    operatorName,
    localizedName
  );
}
