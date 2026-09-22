type PdfLifecycleProxy = {
  destroy?: unknown;
  cleanup?: unknown;
};

export async function releasePdfDocument(value: unknown) {
  if (!value || typeof value !== "object") return;
  const proxy = value as PdfLifecycleProxy;
  const release =
    typeof proxy.destroy === "function"
      ? proxy.destroy
      : typeof proxy.cleanup === "function"
        ? proxy.cleanup
        : null;
  if (!release) return;
  try {
    await Promise.resolve(release.call(proxy));
  } catch {
    // La liberación es de mejor esfuerzo y nunca debe sustituir el resultado del PDF.
  }
}
