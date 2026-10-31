export function buildGoogleMapsEmbedUrl(name: string, address: string | null, apiKey: string | undefined): string | null {
  const cleanAddress = address?.trim();
  const cleanKey = apiKey?.trim();
  if (!cleanAddress || !cleanKey) return null;

  const query = new URLSearchParams({ key: cleanKey, q: `${name.trim()}, ${cleanAddress}` });
  return `https://www.google.com/maps/embed/v1/place?${query.toString()}`;
}

export function buildGoogleMapsDirectionsUrl(name: string, address: string | null): string | null {
  const cleanAddress = address?.trim();
  if (!cleanAddress) return null;
  const query = new URLSearchParams({ api: "1", query: `${name.trim()}, ${cleanAddress}` });
  return `https://www.google.com/maps/search/?${query.toString()}`;
}
