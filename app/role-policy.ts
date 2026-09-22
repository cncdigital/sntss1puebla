const AUTOMATIC_QR_READER_STYLES = new Set<string>();

export function grantsAutomaticQrReader(style: string | null | undefined) {
  return AUTOMATIC_QR_READER_STYLES.has(style || "");
}

export function effectiveQrFacilities(
  _style: string | null | undefined,
  facilities: string[],
) {
  return facilities;
}
