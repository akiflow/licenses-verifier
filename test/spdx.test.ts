import { describe, expect, test } from 'bun:test'
import { identifyLicenseFromText } from '../src/input/spdx'
import * as fixtures from './helpers'

describe('identifyLicenseFromText', () => {
  test('identifies the licenses shipped as fixtures', () => {
    expect(identifyLicenseFromText(fixtures.MIT_TEXT)).toBe('MIT')
    expect(identifyLicenseFromText(fixtures.ISC_TEXT)).toBe('ISC')
    expect(identifyLicenseFromText(fixtures.APACHE_TEXT)).toBe('Apache-2.0')
    expect(identifyLicenseFromText(fixtures.BSD3_TEXT)).toBe('BSD-3-Clause')
    expect(identifyLicenseFromText(fixtures.BSD2_TEXT)).toBe('BSD-2-Clause')
    expect(identifyLicenseFromText(fixtures.BSD4_TEXT)).toBe('BSD-4-Clause')
    expect(identifyLicenseFromText(fixtures.GPL3_TEXT)).toBe('GPL-3.0')
  })

  // One case per signature, so that adding a signature without a test is visible.
  const cases: Array<[string, string]> = [
    ['AGPL-3.0', 'GNU AFFERO GENERAL PUBLIC LICENSE Version 3, 19 November 2007'],
    ['AGPL-1.0', 'AFFERO GENERAL PUBLIC LICENSE Version 1, March 2002'],
    ['LGPL-3.0', 'GNU LESSER GENERAL PUBLIC LICENSE Version 3, 29 June 2007'],
    ['LGPL-2.1', 'GNU LESSER GENERAL PUBLIC LICENSE Version 2.1, February 1999'],
    ['GPL-3.0', 'GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007'],
    ['GPL-2.0', 'GNU GENERAL PUBLIC LICENSE Version 2, June 1991'],
    ['MPL-2.0', 'Mozilla Public License Version 2.0'],
    ['MPL-1.1', 'MOZILLA PUBLIC LICENSE Version 1.1'],
    ['Apache-2.0', 'Apache License Version 2.0, January 2004'],
    ['Artistic-2.0', 'The Artistic License 2.0 Copyright (c) 2000-2006'],
    ['BlueOak-1.0.0', 'Blue Oak Model License Version 1.0.0'],
    ['Unlicense', 'This is free and unencumbered software released into the public domain.'],
    ['CC0-1.0', 'Creative Commons Legal Code CC0 1.0 Universal'],
    ['CC-BY-4.0', 'Creative Commons Attribution 4.0 International Public License'],
    ['CC-BY-3.0', 'Creative Commons Attribution 3.0 Unported'],
    ['CC-BY-SA-4.0', 'Creative Commons Attribution-ShareAlike 4.0 International'],
    ['WTFPL', 'DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE Version 2'],
    ['Python-2.0', 'PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2'],
    ['Zlib', "This software is provided 'as-is', without any express warranty. Altered source versions must be plainly marked as such."],
    ['ISC', 'Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.'],
    ['MIT', 'Permission is hereby granted, free of charge, to any person. THE SOFTWARE IS PROVIDED "AS IS".'],
    ['BSD-3-Clause', 'Redistribution and use in source and binary forms are permitted. Neither the name of the holder may be used to endorse.'],
    ['BSD-2-Clause', 'Redistribution and use in source and binary forms are permitted provided that redistributions reproduce the above copyright notice.'],
    ['BSD-4-Clause', 'Redistribution and use in source and binary forms are permitted. All advertising materials mentioning features must display an acknowledgement.']
  ]

  for (const [expected, text] of cases) {
    test(`identifies ${expected}`, () => {
      expect(identifyLicenseFromText(text)).toBe(expected)
    })
  }

  test('distinguishes 0BSD from ISC by the notice requirement', () => {
    // 0BSD is ISC without the "notice must appear in all copies" clause.
    expect(identifyLicenseFromText(fixtures.ZERO_BSD_TEXT)).toBe('0BSD')
    expect(identifyLicenseFromText(fixtures.ISC_TEXT)).toBe('ISC')
  })

  test('does not report BSD-2-Clause for a text with the third or fourth clause', () => {
    expect(identifyLicenseFromText(fixtures.BSD3_TEXT)).not.toBe('BSD-2-Clause')
    expect(identifyLicenseFromText(fixtures.BSD4_TEXT)).not.toBe('BSD-2-Clause')
  })

  test('prefers the more specific license when several could match', () => {
    // Both the AGPL and the GPL signatures would match this text.
    expect(identifyLicenseFromText('GNU AFFERO GENERAL PUBLIC LICENSE Version 3')).toBe('AGPL-3.0')
    // Both LGPL-3.0 and GPL-3.0 mention "general public license" and "version 3".
    expect(identifyLicenseFromText('GNU LESSER GENERAL PUBLIC LICENSE Version 3')).toBe('LGPL-3.0')
  })

  test('is insensitive to case and to line wrapping', () => {
    expect(identifyLicenseFromText(fixtures.MIT_TEXT.toUpperCase())).toBe('MIT')
    expect(identifyLicenseFromText(fixtures.MIT_TEXT.replace(/ /g, '\n'))).toBe('MIT')
    expect(identifyLicenseFromText(fixtures.MIT_TEXT.replace(/\s+/g, '   \t  '))).toBe('MIT')
  })

  test('returns null for text that is not a license', () => {
    expect(identifyLicenseFromText('')).toBeNull()
    expect(identifyLicenseFromText('# my-package\n\nDoes things.')).toBeNull()
    expect(identifyLicenseFromText('Copyright (c) 2024 Someone. All rights reserved.')).toBeNull()
  })

  test('only looks at the beginning of a very long file', () => {
    // Bounds the cost for packages that concatenate many licenses into one file.
    const padded = 'x'.repeat(20001) + fixtures.MIT_TEXT
    expect(identifyLicenseFromText(padded)).toBeNull()
    expect(identifyLicenseFromText('x'.repeat(19000) + fixtures.MIT_TEXT)).toBe('MIT')
  })
})
