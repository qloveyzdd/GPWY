import type {
  ValidationDetail,
  ValidationSection,
  ValidationSnapshot,
} from "@/lib/validation-types";

const tokenAssignmentPattern =
  /(token|authorization|cookie|headers?)\s*[:=]\s*[^,\s"}]+/gi;
const localPathPattern = /[A-Z]:[\\/][^,\s"}]+/g;
const secretLikePattern = /\b[A-Za-z0-9_-]*secret[A-Za-z0-9_-]*\b/gi;

function sanitizeText(value: string) {
  return value
    .replace(tokenAssignmentPattern, "$1=[redacted]")
    .replace(localPathPattern, "[redacted-path]")
    .replace(secretLikePattern, "[redacted]");
}

function sanitizeDetail(detail: ValidationDetail): ValidationDetail {
  return {
    label: sanitizeText(detail.label),
    value: sanitizeText(detail.value),
  };
}

function sanitizeSection(section: ValidationSection): ValidationSection {
  return {
    ...section,
    title: sanitizeText(section.title),
    summary: sanitizeText(section.summary),
    details: section.details?.map(sanitizeDetail),
  };
}

export function sanitizeValidationSnapshot(
  snapshot: ValidationSnapshot,
): ValidationSnapshot {
  return {
    ...snapshot,
    summary: sanitizeText(snapshot.summary),
    sections: snapshot.sections.map(sanitizeSection),
  };
}
