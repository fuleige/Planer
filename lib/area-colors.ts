export const AREA_COLORS = [
  { name: '靛蓝', value: '#6366B8' },
  { name: '海蓝', value: '#4D86B7' },
  { name: '湖青', value: '#3E9A99' },
  { name: '松绿', value: '#6D9A72' },
  { name: '琥珀', value: '#C0944F' },
  { name: '杏橘', value: '#D08762' },
  { name: '珊瑚', value: '#CD756F' },
  { name: '莓粉', value: '#C57797' },
  { name: '藤紫', value: '#9477BA' },
  { name: '石蓝', value: '#72859D' },
] as const;

export const DEFAULT_AREA_COLOR = AREA_COLORS[0].value;

export function suggestAreaColor(existingColors: readonly string[]) {
  const used = new Set(existingColors.map((color) => color.toLowerCase()));
  return AREA_COLORS.find((color) => !used.has(color.value.toLowerCase()))?.value
    ?? AREA_COLORS[existingColors.length % AREA_COLORS.length].value;
}
