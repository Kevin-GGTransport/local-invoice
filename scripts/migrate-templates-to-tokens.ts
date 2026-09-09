/**
 * 一次性迁移：存量模板改为令牌式绑定。
 *
 * 1. 把已绑定字段的单元格文本替换为对应令牌；
 * 2. 把明细区域压缩为单个模板行；
 * 3. 从网格重新推导 binding_config。
 *
 * 运行：pnpm exec tsx scripts/migrate-templates-to-tokens.ts [--dry-run]
 */

import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { PrismaClient } from '@prisma/client'

import {
  deriveBindingFromGrid,
  DETAIL_TOKENS,
  FIELD_TOKENS,
  type DetailRole,
} from '../src/lib/templates/token-binding'
import { validateTemplateGrid } from '../src/lib/templates/template-grid'
import {
  TEMPLATE_FIELDS,
  type TemplateBinding,
  type TemplateGrid,
} from '../src/lib/templates/types'

if (!process.env.DATABASE_URL && fs.existsSync(path.join(process.cwd(), '.env'))) {
  process.loadEnvFile(path.join(process.cwd(), '.env'))
}

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

function removeRows(grid: TemplateGrid, start: number, end: number): TemplateGrid {
  const drop = end - start + 1
  const rowHeights = grid.rowHeights.filter((_, row) => row < start || row > end)
  const cells = grid.cells
    .filter((cell) => cell.row < start || cell.row > end)
    .map((cell) => (cell.row > end ? { ...cell, row: cell.row - drop } : cell))
    .map((cell) => {
      if (cell.row < start && cell.row + cell.rowSpan > start) {
        const overlap = Math.min(cell.row + cell.rowSpan - 1, end) - start + 1
        return { ...cell, rowSpan: Math.max(1, cell.rowSpan - overlap) }
      }
      return cell
    })

  return { colWidths: grid.colWidths, rowHeights, cells }
}

function backupTimestamp(now = new Date()): string {
  const two = (value: number) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    two(now.getMonth() + 1),
    two(now.getDate()),
    '-',
    two(now.getHours()),
    two(now.getMinutes()),
    two(now.getSeconds()),
  ].join('')
}

function writeBackup(rows: Awaited<ReturnType<typeof prisma.invoice_templates.findMany>>): string {
  const backupDir = path.join(process.cwd(), 'scripts', 'migrations-backup')
  const backupPath = path.join(backupDir, `invoice-templates-${backupTimestamp()}.json`)
  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(
    backupPath,
    `${JSON.stringify(rows, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  )
  return backupPath
}

async function main() {
  const templates = await prisma.invoice_templates.findMany({ orderBy: { id: 'asc' } })
  console.log(`共 ${templates.length} 个模板${dryRun ? '（dry-run，不写库）' : ''}`)

  if (!dryRun) {
    const backupPath = writeBackup(templates)
    console.log(`写入前备份：${backupPath}`)
  }

  let migrated = 0
  let skipped = 0
  let aborted = 0

  for (const template of templates) {
    const grid = structuredClone(template.grid_config) as unknown as TemplateGrid
    const binding = template.binding_config as unknown as TemplateBinding
    const idAndName = `#${template.id} ${template.name} [${template.status}]`

    const already = deriveBindingFromGrid(grid, { minRows: binding.lineItems?.minRows ?? 10 })
    const knownTokens = [...Object.values(FIELD_TOKENS), ...Object.values(DETAIL_TOKENS)]
    const hasKnownToken = grid.cells.some((cell) =>
      knownTokens.some((token) => cell.text.includes(token)),
    )
    const hasNoBindings =
      TEMPLATE_FIELDS.every((field) => (binding.fields[field.key]?.cells.length ?? 0) === 0) &&
      binding.lineItems == null
    if ((hasKnownToken || hasNoBindings) && isDeepStrictEqual(already.binding, binding)) {
      console.log(`跳过（已迁移） ${idAndName}`)
      skipped++
      continue
    }

    let touched = 0
    for (const field of TEMPLATE_FIELDS) {
      for (const bound of binding.fields[field.key]?.cells ?? []) {
        const target = grid.cells.find((cell) => cell.row === bound.row && cell.col === bound.col)
        if (target && target.text !== FIELD_TOKENS[field.key]) {
          target.text = FIELD_TOKENS[field.key]
          touched++
        }
      }
    }

    const lineItems = binding.lineItems
    if (lineItems) {
      for (const [role, col] of Object.entries(lineItems.columns) as [DetailRole, number | undefined][]) {
        if (col == null) continue
        const target = grid.cells.find((cell) => cell.row === lineItems.startRow && cell.col === col)
        if (target && target.text !== DETAIL_TOKENS[role]) {
          target.text = DETAIL_TOKENS[role]
          touched++
        }
      }

      if (lineItems.endRow > lineItems.startRow) {
        const nextGrid = removeRows(grid, lineItems.startRow + 1, lineItems.endRow)
        grid.cells = nextGrid.cells
        grid.rowHeights = nextGrid.rowHeights
        touched++
      }
    }

    const derived = deriveBindingFromGrid(grid, { minRows: lineItems?.minRows ?? 10 })
    const errors = [...derived.errors, ...validateTemplateGrid(grid, derived.binding)]
    if (errors.length > 0) {
      console.error(`中止（未写库） ${idAndName}：${errors.join('；')}`)
      aborted++
      continue
    }

    console.log(`${idAndName}：改写 ${touched} 处 → 令牌`)
    if (!dryRun) {
      await prisma.invoice_templates.update({
        where: { id: template.id },
        data: {
          grid_config: grid as unknown as object,
          binding_config: derived.binding as unknown as object,
        },
      })
    }
    migrated++
  }

  console.log(`汇总：迁移 ${migrated}，跳过 ${skipped}，中止 ${aborted}`)
  if (aborted > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error('迁移失败：', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
