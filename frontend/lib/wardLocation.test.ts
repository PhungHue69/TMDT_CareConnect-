import assert from "node:assert/strict";
import { test } from "node:test";
import { locationForProvince, locationForWard } from "./wardLocation.ts";

test("choosing a province after GPS uses the province center immediately", () => {
  const province = { province: "TP. Hà Nội", lat: 21.02, lng: 105.84, wards: [] };
  assert.deepEqual(locationForProvince(province), { lat: 21.02, lng: 105.84, label: "TP. Hà Nội" });
  assert.equal(locationForProvince(undefined), null);
});

test("choosing a ward uses that ward's coordinates rather than its province center", () => {
  const province = {
    province: "TP. Hồ Chí Minh",
    lat: 10.8,
    lng: 106.7,
    wards: [
      { ward: "P. Bến Nghé", lat: 10.776, lng: 106.705 },
      { ward: "P. Tân Định", lat: 10.79, lng: 106.688 },
    ],
  };
  assert.deepEqual(locationForWard(province, "P. Bến Nghé"), {
    lat: 10.776,
    lng: 106.705,
    label: "P. Bến Nghé, TP. Hồ Chí Minh",
  });
  assert.equal(locationForWard(province, ""), null);
  assert.equal(locationForWard(province, "P. Không có"), null);
  assert.equal(locationForWard(undefined, "P. Bến Nghé"), null);
});
