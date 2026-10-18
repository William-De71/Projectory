// Same loose semver comparison as server/src/sync/http.js.
export function compareVersions(a, b) {
  const parse = (v) => {
    const [main, pre = ''] = String(v).trim().replace(/^v/i, '').split('-', 2)
    return { nums: main.split('.').map((n) => parseInt(n, 10) || 0), pre }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const diff = (pa.nums[i] || 0) - (pb.nums[i] || 0)
    if (diff) return Math.sign(diff)
  }
  if (pa.pre === pb.pre) return 0
  if (!pa.pre) return 1
  if (!pb.pre) return -1
  return pa.pre < pb.pre ? -1 : 1
}
