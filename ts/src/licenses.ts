// License names in this list must be valid IDs defined in
// https://spdx.org/licenses/. When adding new licenses, please consult the
// relevant documents and OSPO.
const GREEN_LICENSES = [
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-3.0',
  'CC0-1.0',
  'ISC',
  'LGPL-2.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'MIT',
  'Unlicense',
];
export const GREEN_LICENSE_EXPR = `(${GREEN_LICENSES.join(' OR ')})`;

// List of license names that are not SPDX-conforming IDs but are allowed.
export const WHITELISTED_LICENSES = [
  'Public Domain',
];
