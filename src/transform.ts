import type { RequestFunction } from '../index.d'

function getSpace(count = 0) {
  return ' '.repeat(count)
}

function addStringQuote(target?: string | number) {
  if (typeof target === 'undefined') return target
  if (Array.isArray(target)) return target
  if (typeof target === 'number' || !Number.isNaN(Number(target))) return Number(target)
  return `"${target}"`
}

export function pageRequestTransform<
  T extends Record<string, string | number | RequestFunction[] | undefined> | RequestFunction[],
>(obj: T, space = 0): string {
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj))
    return (
      obj.reduce<string>(
        (acc, item) => `${acc}${getSpace(space + 2)}${pageRequestTransform(item, space + 2)},\n`,
        '[\n'
      ) + `${getSpace(space)}]`
    )
  function getItemValue(value?: string | number | RequestFunction[]) {
    if (value instanceof Object) return pageRequestTransform(value, space + 2)
    return addStringQuote(value)
  }
  return (
    Object.entries(obj).reduce<string>((acc, item) => {
      const key = `"${item[0].replace(/^@\/pages\//, '/')}"`
      if (Array.isArray(item[1]) && !item[1].length) return acc
      const value = getItemValue(item[1])
      return `${acc}${getSpace(space + 2)}${key}: ${value},\n`
    }, `{\n`) + `${getSpace(space)}}`
  )
}
