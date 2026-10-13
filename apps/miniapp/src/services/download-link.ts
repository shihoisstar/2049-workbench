export async function copyDownloadLink(url: string, clipboard: { writeText(value: string): Promise<void> } | undefined): Promise<boolean> {
  if (!clipboard) return false;
  try { await clipboard.writeText(url); return true; }
  catch { return false; }
}
