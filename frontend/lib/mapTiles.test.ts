import assert from "node:assert/strict";
import { test } from "node:test";
import { baseMap } from "./mapTiles.ts";

test("demo map uses a reachable tiled basemap with visible data credits", () => {
  assert.equal(baseMap.url, "https://a.tile.opentopomap.org/{z}/{x}/{y}.png");
  assert.match(baseMap.attribution, /OpenStreetMap/);
  assert.match(baseMap.attribution, /OpenTopoMap/);
  assert.match(baseMap.attribution, /SRTM/);
});
