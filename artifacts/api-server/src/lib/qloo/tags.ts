/**
 * Qloo's public API overview lists Search Tags, but the current reference does
 * not expose a verifiable request path and response schema. Keep this boundary
 * explicit instead of guessing a URL or returning fabricated tag results.
 */
export function getQlooTagLookupStatus() {
  return {
    enabled: false,
    message:
      "Tag lookup is disabled until its official endpoint path and response schema can be verified.",
  };
}
