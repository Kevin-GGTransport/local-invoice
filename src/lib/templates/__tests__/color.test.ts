import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyExcelTint,
  normalizeTemplateColor,
  parseExcelThemeColors,
  resolveSpreadsheetColor,
  templateRenderColor,
} from '../color'

describe('template colors', () => {
  it('normalizes supported editor colors while preserving transparency', () => {
    assert.equal(normalizeTemplateColor('#f49b33'), '#F49B33')
    assert.equal(normalizeTemplateColor('#abc'), '#AABBCC')
    assert.equal(normalizeTemplateColor('rgb(249, 203, 211)'), '#F9CBD3')
    assert.equal(normalizeTemplateColor('rgba(0, 0, 0, 0.5)'), 'rgba(0, 0, 0, 0.5)')
    assert.equal(normalizeTemplateColor('rgba(0 0 0 / 25%)'), 'rgba(0, 0, 0, 0.25)')
    assert.equal(normalizeTemplateColor('#FF000080'), 'rgba(255, 0, 0, 0.502)')
    assert.equal(normalizeTemplateColor('not-a-color'), null)
    assert.equal(templateRenderColor('rebeccapurple'), 'rebeccapurple')
  })

  it('resolves Excel ARGB and theme tint to stable sRGB', () => {
    assert.equal(resolveSpreadsheetColor({ argb: '80FF0000' }, []), '#FF0000')
    assert.equal(resolveSpreadsheetColor({ argb: 'FFF49B33' }, []), '#F49B33')
    assert.equal(applyExcelTint('#000000', 0.5), '#808080')
    assert.equal(applyExcelTint('#FFFFFF', -0.25), '#BFBFBF')
    assert.equal(resolveSpreadsheetColor({ theme: 4, tint: 0.5 }, ['', '', '', '', '#4F81BD']), '#A7C0DE')
  })

  it('reads the indexed color scheme from an Office theme', () => {
    const xml = '<a:clrScheme><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:accent1><a:srgbClr val="4F81BD"/></a:accent1></a:clrScheme>'
    const colors = parseExcelThemeColors(xml)
    assert.equal(colors[0], '#FFFFFF')
    assert.equal(colors[1], '#000000')
    assert.equal(colors[4], '#4F81BD')
  })
})
