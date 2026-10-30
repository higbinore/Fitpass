export function isFeatureEnabled(features: Record<string, boolean> | null | undefined, key: string): boolean {
  return Boolean(features && Object.hasOwn(features, key) && features[key] === true);
}
