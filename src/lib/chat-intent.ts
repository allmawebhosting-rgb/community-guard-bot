const REPORTING_FLOWS = new Set(["Reporting", "Report an incident"]);
const REPORTING_LANGUAGE =
  /\b(report|stolen|theft|robbed|robbery|mugged|assault|harass(?:ment|ed)?|attacked|threatened|burglary|fraud|lost my)\b/i;

export function isReportingIntent(input: {
  flowLabel: string | null;
  matchedFlow?: string;
  intakeText: string;
}) {
  return (
    REPORTING_FLOWS.has(input.flowLabel ?? "") ||
    REPORTING_FLOWS.has(input.matchedFlow ?? "") ||
    REPORTING_LANGUAGE.test(input.intakeText)
  );
}

export function shouldShowDirectHelp(
  directService: string | null,
  isReporting: boolean,
  activeFlow: string | null,
) {
  const anotherFlowIsActive = Boolean(activeFlow && activeFlow !== "Find help");
  return Boolean(directService) && !isReporting && !anotherFlowIsActive;
}
