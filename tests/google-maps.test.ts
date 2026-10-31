import assert from "node:assert/strict";
import test from "node:test";

import { buildGoogleMapsDirectionsUrl, buildGoogleMapsEmbedUrl } from "../lib/google-maps.ts";

test("configured Maps Embed API key builds Google's official place embed URL", () => {
  const value = buildGoogleMapsEmbedUrl("FitPass Elite", "University of Benin, Ugbowo", "restricted-public-key");
  assert.ok(value);
  const url = new URL(value);
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps/embed/v1/place");
  assert.equal(url.searchParams.get("key"), "restricted-public-key");
  assert.equal(url.searchParams.get("q"), "FitPass Elite, University of Benin, Ugbowo");
});

test("missing Maps key uses no iframe URL but retains the published-address directions link", () => {
  assert.equal(buildGoogleMapsEmbedUrl("FitPass Elite", "University of Benin, Ugbowo", undefined), null);
  assert.equal(buildGoogleMapsEmbedUrl("FitPass Elite", "University of Benin, Ugbowo", "  "), null);
  const directions = buildGoogleMapsDirectionsUrl("FitPass Elite", "University of Benin, Ugbowo");
  assert.ok(directions);
  assert.equal(new URL(directions).searchParams.get("query"), "FitPass Elite, University of Benin, Ugbowo");
});

test("no address produces neither fabricated map result nor directions target", () => {
  assert.equal(buildGoogleMapsEmbedUrl("FitPass Elite", null, "restricted-public-key"), null);
  assert.equal(buildGoogleMapsDirectionsUrl("FitPass Elite", null), null);
});
