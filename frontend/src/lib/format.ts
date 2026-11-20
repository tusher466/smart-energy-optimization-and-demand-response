export function money(v: number, sym: string) {
  return `${sym}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
export function num(v: number, d = 1) {
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })
}
