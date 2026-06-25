import { CHANGELOGS, SECTION_ICONS } from "../js/changelog-data.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(CHANGELOGS.length >= 10, "expected changelog history");
for (const patch of CHANGELOGS) {
  assert(patch.version, "version required");
  assert(patch.sections?.length, `sections for ${patch.version}`);
  for (const section of patch.sections) {
    assert(SECTION_ICONS[section.id] || section.id, `icon for ${section.id}`);
    assert(section.items?.length, `items in ${patch.version}/${section.id}`);
  }
}

console.log(`OK: ${CHANGELOGS.length} patch notes validated`);
