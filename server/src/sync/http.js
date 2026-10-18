const USER_AGENT = 'devdeck (+https://github.com)'

export class HttpError extends Error {
  constructor(url, status, body) {
    super(`${status} sur ${url}${body ? ` : ${body.slice(0, 200)}` : ''}`)
    this.status = status
  }
}

export async function fetchText(url, { headers = {}, timeout = 15000 } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeout),
  })
  const text = await res.text()
  if (!res.ok) throw new HttpError(url, res.status, text)
  return text
}

export async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, { ...options, headers: { Accept: 'application/json', ...options?.headers } }))
}

// Loose semver-ish comparison: "v1.10.0" > "1.9.3", "2.0.0-rc1" < "2.0.0".
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

export const looksLikeVersion = (v) => /^v?\d+(\.\d+)+/.test(String(v))
