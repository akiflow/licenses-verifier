/**
 * Identification of a license from its text.
 *
 * Used only when a package does not declare a license in its `package.json`.
 * The identifiers returned here are reported with a `*` suffix by the caller,
 * to make it explicit that they were inferred rather than declared.
 */

interface ILicenseSignature {
  id: string
  /** All fragments must be present for the license to match. */
  requires: Array<string>
  /** None of these fragments may be present. */
  excludes?: Array<string>
}

/**
 * Ordered from the most specific to the most generic: the first match wins, so
 * e.g. AGPL must be tested before GPL and BSD-3 before BSD-2.
 */
const SIGNATURES: Array<ILicenseSignature> = [
  { id: 'AGPL-3.0', requires: ['gnu affero general public license', 'version 3'] },
  { id: 'AGPL-1.0', requires: ['affero general public license', 'version 1'] },
  { id: 'LGPL-3.0', requires: ['gnu lesser general public license', 'version 3'] },
  { id: 'LGPL-2.1', requires: ['gnu lesser general public license', 'version 2.1'] },
  { id: 'GPL-3.0', requires: ['gnu general public license', 'version 3'] },
  { id: 'GPL-2.0', requires: ['gnu general public license', 'version 2'] },
  { id: 'MPL-2.0', requires: ['mozilla public license', 'version 2.0'] },
  { id: 'MPL-1.1', requires: ['mozilla public license', 'version 1.1'] },
  { id: 'Apache-2.0', requires: ['apache license', 'version 2.0'] },
  { id: 'Artistic-2.0', requires: ['the artistic license 2.0'] },
  { id: 'BlueOak-1.0.0', requires: ['blue oak model license'] },
  { id: 'Unlicense', requires: ['this is free and unencumbered software released into the public domain'] },
  { id: 'CC0-1.0', requires: ['creative commons', 'cc0'] },
  { id: 'CC-BY-4.0', requires: ['creative commons attribution 4.0'] },
  { id: 'CC-BY-3.0', requires: ['creative commons attribution 3.0'] },
  { id: 'CC-BY-SA-4.0', requires: ['creative commons attribution-sharealike 4.0'] },
  { id: 'WTFPL', requires: ['do what the fuck you want to public license'] },
  { id: 'Python-2.0', requires: ['python software foundation license'] },
  { id: 'Zlib', requires: ['this software is provided \'as-is\'', 'altered source versions must be plainly marked as such'] },
  {
    id: '0BSD',
    requires: ['permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted'],
    excludes: ['the above copyright notice and this permission notice appear in all copies']
  },
  {
    id: 'ISC',
    requires: ['permission to use, copy, modify, and/or distribute this software for any purpose']
  },
  {
    id: 'MIT',
    requires: [
      'permission is hereby granted, free of charge',
      'the software is provided "as is"'
    ]
  },
  {
    id: 'BSD-3-Clause',
    requires: ['redistribution and use in source and binary forms', 'neither the name of']
  },
  {
    id: 'BSD-2-Clause',
    requires: ['redistribution and use in source and binary forms', 'reproduce the above copyright notice'],
    excludes: ['neither the name of', 'all advertising materials mentioning']
  },
  {
    id: 'BSD-4-Clause',
    requires: ['redistribution and use in source and binary forms', 'all advertising materials mentioning']
  }
]

/** Collapses whitespace and lowercases, so that line wrapping does not matter. */
function normalize (text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Returns the SPDX identifier matching the given license text, or null when the
 * text is not recognised.
 */
export function identifyLicenseFromText (text: string): string | null {
  if (!text) {
    return null
  }
  // Only the first part of the file is relevant, and this keeps the cost bounded
  // for packages that concatenate several licenses into one long file.
  const normalized = normalize(text.slice(0, 20000))
  for (const signature of SIGNATURES) {
    const matches = signature.requires.every(fragment => normalized.includes(fragment))
    if (!matches) {
      continue
    }
    const excluded = (signature.excludes || []).some(fragment => normalized.includes(fragment))
    if (!excluded) {
      return signature.id
    }
  }
  return null
}
