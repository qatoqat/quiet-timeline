import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS, NAV_ITEMS } from '../src/shared/defaults';

// Every setting has exactly one control in the settings panel, and every control is a setting;
// a control that only works with another one on says so (data-needs → greyed out while it's off).
test('panel controls match the settings', () => {
  const html = readFileSync(new URL('../popup/popup.html', import.meta.url), 'utf8');
  const controls = [...html.matchAll(/data-path="([^"]+)"/g)].map((m) => m[1]).concat(NAV_ITEMS.map(([k]) => `nav.${k}`));
  const leaves = (o: object, pre = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${pre}${k}.`) : [`${pre}${k}`]));
  const settings = leaves(DEFAULTS);
  assert.deepEqual(controls.filter((p, i) => controls.indexOf(p) !== i), [], 'controls listed twice');
  assert.deepEqual(settings.filter((p) => !controls.includes(p)), [], 'settings without a control');
  assert.deepEqual(controls.filter((p) => !settings.includes(p)), [], 'controls without a setting');
  const needs = [...html.matchAll(/data-needs="([^"!]+)/g)].map((m) => m[1]);
  assert.deepEqual(needs.filter((p) => !settings.includes(p)), [], 'data-needs naming no setting');
});
