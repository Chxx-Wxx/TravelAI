export type StartupDiagnosticMode =
  | "normal"
  | "entry"
  | "shell";

const rawDiagnosticMode =
  process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTIC_MODE;

export const STARTUP_DIAGNOSTIC_MODE: StartupDiagnosticMode =
  rawDiagnosticMode === "entry" || rawDiagnosticMode === "shell"
    ? rawDiagnosticMode
    : "normal";

const startedAt = Date.now();
let sequence = 0;

type StartupDetails = Record<
  string,
  boolean | number | string | null | undefined
>;

export function logStartup(
  stage: string,
  details?: StartupDetails
) {
  if (!__DEV__) {
    return;
  }

  sequence += 1;
  const elapsed = Date.now() - startedAt;
  const detailText = details
    ? ` ${JSON.stringify(details)}`
    : "";

  console.info(
    `[TravelAI startup ${String(sequence).padStart(2, "0")} +${elapsed}ms] ${stage}${detailText}`
  );
}
