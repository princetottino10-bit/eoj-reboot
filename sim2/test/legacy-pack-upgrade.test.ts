import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSettings, defaultSettings, encodeSettings, upgradeLegacyPack } from "../src/settings.ts";

test("old share links / remembered setups on adopted-1006 open on adopted-1013, keeping rule changes", () => {
  const old = encodeSettings({ ...defaultSettings(), pack: "adopted-1006", config: { taijiDiscount: 2 } });
  const up = decodeSettings(upgradeLegacyPack(old), null);
  assert.ok(up.ok);
  if (!up.ok) return;
  assert.equal(up.value.pack, "adopted-1013");
  assert.deepEqual(up.value.config, { taijiDiscount: 2 });
});

test("other packs and unreadable strings pass through unchanged", () => {
  const other = encodeSettings({ ...defaultSettings(), pack: "adopted-1003" });
  assert.equal(upgradeLegacyPack(other), other);
  assert.equal(upgradeLegacyPack("!!"), "!!");
  assert.equal(defaultSettings().pack, "adopted-1013");
});
