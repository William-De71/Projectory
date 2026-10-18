import { useEffect, useRef, useState } from 'react'
import { Flex, theme } from 'antd'
import dayjs from 'dayjs'

// Validated categorical slots 1-2 (blue, orange), stepped per surface.
export const SERIES_COLORS = {
  light: ['#2a78d6', '#eb6834'],
  dark: ['#3987e5', '#d95926'],
}

const isDarkColor = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return false
  const n = parseInt(m[1], 16)
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 128
}

export function useSeriesColors() {
  const { token } = theme.useToken()
  return SERIES_COLORS[isDarkColor(token.colorBgContainer) ? 'dark' : 'light']
}

function niceMax(v) {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s * 4 >= v)
  return step * 4
}

const compact = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(Math.round(v * 10) / 10))

// Column chart, one or two series per week. Bars <= 24px, 4px rounded top,
// 2px gap between neighbours, hairline grid, hover tooltip on the whole band.
export default function BarChart({ weeks, series, height = 180, format = compact }) {
  const { token } = theme.useToken()
  const ref = useRef(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pad = { top: 8, right: 8, bottom: 22, left: 34 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const max = niceMax(Math.max(0, ...weeks.flatMap((w) => series.map((s) => w[s.key]))))
  const band = plotW / Math.max(1, weeks.length)
  const gap = 2
  const barW = Math.max(2, Math.min(24, (band * 0.7 - gap * (series.length - 1)) / series.length))
  const groupW = barW * series.length + gap * (series.length - 1)
  const y = (v) => pad.top + plotH - (v / max) * plotH
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max]
  const labelEvery = Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 70)))

  const bar = (x, v, color, key) => {
    if (!v) return null
    const top = y(v)
    const h = pad.top + plotH - top
    const r = Math.min(4, barW / 2, h)
    // Rounded at the data end, square at the baseline.
    const d = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`
    return <path key={key} d={d} fill={color} />
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} role="img" style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={token.colorBorderSecondary} strokeWidth={1} />
            <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={token.colorTextTertiary} style={{ fontVariantNumeric: 'tabular-nums' }}>{format(t)}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x0 = pad.left + i * band + (band - groupW) / 2
          return (
            <g key={w.week}>
              {hover === i && <rect x={pad.left + i * band} y={pad.top} width={band} height={plotH} fill={token.colorFillTertiary} />}
              {series.map((s, j) => bar(x0 + j * (barW + gap), w[s.key], s.color, s.key))}
              {i % labelEvery === 0 && (
                <text x={pad.left + i * band + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={token.colorTextTertiary}>{dayjs(w.week).format('D MMM')}</text>
              )}
              <rect x={pad.left + i * band} y={pad.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: Math.min(Math.max(0, pad.left + hover * band + band / 2 - 80), width - 170),
            width: 160,
            pointerEvents: 'none',
            background: token.colorBgElevated,
            boxShadow: token.boxShadowSecondary,
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
          }}
        >
          <div style={{ color: token.colorTextSecondary, marginBottom: 2 }}>{dayjs(weeks[hover].week).format('L')}</div>
          {series.map((s) => (
            <Flex key={s.key} justify="space-between" align="center" gap={8}>
              <span><span style={{ display: 'inline-block', width: 10, height: 2, background: s.color, verticalAlign: 'middle', marginRight: 6 }} />{s.label}</span>
              <strong>{format(weeks[hover][s.key])}</strong>
            </Flex>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legend({ series }) {
  const { token } = theme.useToken()
  if (series.length < 2) return null
  return (
    <Flex gap={16} style={{ fontSize: 12, color: token.colorTextSecondary }}>
      {series.map((s) => (
        <span key={s.key}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.color, marginRight: 6, verticalAlign: '-1px' }} />{s.label}</span>
      ))}
    </Flex>
  )
}
