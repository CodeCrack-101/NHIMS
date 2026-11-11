import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { reportsService } from '../services/reportsService.js'
import { formatCatalogueLabel } from '../services/catalogueService.js'
import '../styles/SalesAnalyticsChart.css'

// Helper to format Date to 'YYYY-MM-DD' in local IST/browser time (prevents UTC date rollback)
const formatLocalDateKey = (d) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Reusable Dedicated Chart Component (Sales Revenue or Rolls Sold)
 */
function SingleMetricChart({
  metric, // 'revenue' | 'rolls'
  title,
  icon,
  accent, // 'indigo' | 'emerald'
  seriesData,
  totalLabel,
  loading,
}) {
  const [chartType, setChartType] = useState('line') // Default line chart view as requested
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const containerRef = useRef(null)

  // Chart layout dimensions
  const chartWidth = 520
  const chartHeight = 220
  const padLeft = metric === 'revenue' ? 56 : 42
  const padRight = 18
  const padTop = 20
  const padBottom = 28
  const plotWidth = chartWidth - padLeft - padRight
  const plotHeight = chartHeight - padTop - padBottom

  // Dynamic maximum scale ceiling
  const maxVal = useMemo(() => {
    let highest = 0
    seriesData.forEach((p) => {
      const v = metric === 'revenue' ? p.revenue : p.rolls
      if (v > highest) highest = v
    })
    if (highest === 0) return metric === 'revenue' ? 5000 : 20
    const magnitude = Math.pow(10, Math.floor(Math.log10(highest))) || 1
    return Math.ceil((highest * 1.18) / magnitude) * magnitude
  }, [seriesData, metric])

  // 5 horizontal gridlines and Y-ticks
  const yTicks = useMemo(() => {
    return [
      { val: maxVal, y: padTop },
      { val: Math.round(maxVal * 0.75), y: padTop + plotHeight * 0.25 },
      { val: Math.round(maxVal * 0.5), y: padTop + plotHeight * 0.5 },
      { val: Math.round(maxVal * 0.25), y: padTop + plotHeight * 0.75 },
      { val: 0, y: padTop + plotHeight },
    ]
  }, [maxVal, padTop, plotHeight])

  // Formatted Y-axis labels
  const formatYTick = (val) => {
    if (metric === 'revenue') {
      if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`
      if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
      if (val >= 1000) return `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
      return `₹${val}`
    }
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`
    return `${val}`
  }

  // Calculate coordinates for all data points
  const mappedPoints = useMemo(() => {
    const len = seriesData.length
    if (len === 0) return []
    const step = len > 1 ? plotWidth / (len - 1) : plotWidth / 2

    return seriesData.map((item, idx) => {
      const x = len > 1 ? padLeft + idx * step : padLeft + plotWidth / 2
      const val = metric === 'revenue' ? item.revenue : item.rolls
      const y = padTop + plotHeight - (val / maxVal) * plotHeight
      return {
        ...item,
        x,
        y: Math.min(padTop + plotHeight, Math.max(padTop, y)),
        val,
      }
    })
  }, [seriesData, metric, maxVal, plotWidth, plotHeight, padLeft, padTop])

  // Smooth Bézier Spline for Line Chart
  const splinePaths = useMemo(() => {
    if (mappedPoints.length === 0) return { line: '', area: '' }
    if (mappedPoints.length === 1) {
      const pt = mappedPoints[0]
      return {
        line: `M ${pt.x - 20} ${pt.y} L ${pt.x + 20} ${pt.y}`,
        area: `M ${pt.x - 20} ${pt.y} L ${pt.x + 20} ${pt.y} L ${pt.x + 20} ${padTop + plotHeight} L ${pt.x - 20} ${padTop + plotHeight} Z`,
      }
    }

    let linePath = `M ${mappedPoints[0].x.toFixed(1)} ${mappedPoints[0].y.toFixed(1)}`

    for (let i = 0; i < mappedPoints.length - 1; i++) {
      const p0 = mappedPoints[i === 0 ? 0 : i - 1]
      const p1 = mappedPoints[i]
      const p2 = mappedPoints[i + 1]
      const p3 = mappedPoints[i + 2 < mappedPoints.length ? i + 2 : i + 1]

      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6

      linePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }

    const first = mappedPoints[0]
    const last = mappedPoints[mappedPoints.length - 1]
    const bottomY = padTop + plotHeight
    const areaPath = `${linePath} L ${last.x.toFixed(1)} ${bottomY} L ${first.x.toFixed(1)} ${bottomY} Z`

    return { line: linePath, area: areaPath }
  }, [mappedPoints, padTop, plotHeight])

  // Responsive bar width based on points density
  const barWidth = useMemo(() => {
    const len = seriesData.length
    if (len <= 7) return 26
    if (len <= 15) return 18
    if (len <= 31) return 10
    return 8
  }, [seriesData.length])

  // Colors based on accent
  const mainColor = accent === 'indigo' ? '#4f46e5' : '#059669'
  const hoverColor = accent === 'indigo' ? '#3730a3' : '#047857'
  const gradPrefix = metric

  return (
    <div className="analytics-subcard" ref={containerRef}>
      {/* Subcard Header: Title, Metric Total Badge, and Bar/Line switcher */}
      <div className="subcard-header">
        <div className="subcard-title-group">
          <div className={`subcard-icon ${accent}`}>{icon}</div>
          <div>
            <h3 className="subcard-name">{title}</h3>
            <span className="subcard-total">
              Total: <strong className={accent === 'indigo' ? 'text-indigo' : 'text-emerald'}>{totalLabel}</strong>
            </span>
          </div>
        </div>

        {/* Bar vs Line Switcher */}
        <div className="chart-type-toggle">
          <button
            type="button"
            className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
            onClick={() => setChartType('line')}
            title="Line View"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>Line</span>
          </button>
          <button
            type="button"
            className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
            onClick={() => setChartType('bar')}
            title="Bar View"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="3" y="10" width="4" height="11" rx="1" />
              <rect x="10" y="4" width="4" height="17" rx="1" />
              <rect x="17" y="13" width="4" height="8" rx="1" />
            </svg>
            <span>Bar</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="analytics-canvas-wrap">
        {loading ? (
          <div className="chart-skeleton-box">
            <div className="chart-loading-bar-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="skeleton-shimmer chart-skeleton-bar"
                  style={{ height: `${25 + (i % 4) * 18}%` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="svg-chart-container">
            <svg
              className="analytics-svg"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="xMidYMid meet"
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                {/* Custom Gradients for this metric */}
                <linearGradient id={`${gradPrefix}BarGrad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={mainColor} />
                  <stop offset="100%" stopColor={accent === 'indigo' ? '#818cf8' : '#34d399'} />
                </linearGradient>
                <linearGradient id={`${gradPrefix}BarHover`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={hoverColor} />
                  <stop offset="100%" stopColor={accent === 'indigo' ? '#6366f1' : '#10b981'} />
                </linearGradient>
                <linearGradient id={`${gradPrefix}AreaGrad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={mainColor} stopOpacity="0.38" />
                  <stop offset="85%" stopColor={accent === 'indigo' ? '#818cf8' : '#34d399'} stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines & Y-Axis Labels */}
              {yTicks.map((tick, i) => (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={tick.y}
                    x2={chartWidth - padRight}
                    y2={tick.y}
                    stroke="#e2e8f0"
                    strokeDasharray={i === yTicks.length - 1 ? 'none' : '4 4'}
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={tick.y + 3.5}
                    textAnchor="end"
                    className="chart-axis-label"
                  >
                    {formatYTick(tick.val)}
                  </text>
                </g>
              ))}

              {/* X-Axis Baseline */}
              <line
                x1={padLeft}
                y1={padTop + plotHeight}
                x2={chartWidth - padRight}
                y2={padTop + plotHeight}
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />

              {/* BAR CHART VIEW */}
              {chartType === 'bar' &&
                mappedPoints.map((pt, idx) => {
                  const bHeight = Math.max(0, padTop + plotHeight - pt.y)
                  const isHovered = hoveredPoint?.dateKey === pt.dateKey
                  const barColor = isHovered
                    ? `url(#${gradPrefix}BarHover)`
                    : `url(#${gradPrefix}BarGrad)`

                  return (
                    <g key={idx}>
                      {/* Transparent Hover Hit Area */}
                      <rect
                        x={pt.x - barWidth}
                        y={padTop}
                        width={barWidth * 2}
                        height={plotHeight}
                        fill={isHovered ? (accent === 'indigo' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)') : 'transparent'}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredPoint(pt)}
                      />

                      {/* Actual Data Bar */}
                      {bHeight > 0 ? (
                        <rect
                          x={pt.x - barWidth / 2}
                          y={pt.y}
                          width={barWidth}
                          height={bHeight}
                          rx={Math.min(4, barWidth / 2)}
                          fill={barColor}
                          style={{
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={() => setHoveredPoint(pt)}
                        />
                      ) : (
                        <circle
                          cx={pt.x}
                          cy={padTop + plotHeight - 3}
                          r="2"
                          fill="#cbd5e1"
                        />
                      )}

                      {/* X-axis Label */}
                      {(mappedPoints.length <= 15 || idx % Math.ceil(mappedPoints.length / 8) === 0) && (
                        <text
                          x={pt.x}
                          y={chartHeight - 10}
                          textAnchor="middle"
                          className={`chart-x-label ${isHovered ? 'x-label-active' : ''}`}
                        >
                          {pt.label}
                        </text>
                      )}
                    </g>
                  )
                })}

              {/* LINE / AREA CHART VIEW */}
              {chartType === 'line' && (
                <>
                  {/* Glowing Fill Under Curve */}
                  <path
                    d={splinePaths.area}
                    fill={`url(#${gradPrefix}AreaGrad)`}
                  />

                  {/* Main Curve Line */}
                  <path
                    d={splinePaths.line}
                    fill="none"
                    stroke={mainColor}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Interactive Points on Line */}
                  {mappedPoints.map((pt, idx) => {
                    const isHovered = hoveredPoint?.dateKey === pt.dateKey

                    return (
                      <g key={idx}>
                        {/* Transparent Hover Hit Target */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={14}
                          fill="transparent"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredPoint(pt)}
                        />

                        {/* Outer Glow Ring on Hover */}
                        {isHovered && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={8}
                            fill={accent === 'indigo' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(16, 185, 129, 0.25)'}
                          />
                        )}

                        {/* Main Dot Marker */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 5.5 : pt.val > 0 ? 3.5 : 2}
                          fill="#ffffff"
                          stroke={mainColor}
                          strokeWidth={isHovered ? 2.5 : 2}
                          style={{ transition: 'all 0.15s ease' }}
                        />

                        {/* X-axis Label */}
                        {(mappedPoints.length <= 15 || idx % Math.ceil(mappedPoints.length / 8) === 0) && (
                          <text
                            x={pt.x}
                            y={chartHeight - 10}
                            textAnchor="middle"
                            className={`chart-x-label ${isHovered ? 'x-label-active' : ''}`}
                          >
                            {pt.label}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </>
              )}
            </svg>

            {/* Interactive Floating Tooltip */}
            {hoveredPoint && (
              <div
                className="chart-floating-tooltip"
                style={{
                  left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                  top: `${(hoveredPoint.y / chartHeight) * 100}%`,
                }}
              >
                <div className="tooltip-header">{hoveredPoint.displayDate}</div>
                <div className="tooltip-stat-row">
                  <span className="tooltip-label">
                    {metric === 'revenue' ? 'Sales Revenue:' : 'Rolls Sold:'}
                  </span>
                  <strong className={`tooltip-value ${accent === 'indigo' ? 'text-indigo' : 'text-emerald'}`}>
                    {metric === 'revenue'
                      ? `₹${hoveredPoint.revenue.toLocaleString('en-IN')}`
                      : `${hoveredPoint.rolls} Rolls`}
                  </strong>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Main Sales & Roll Volume Analytics Container + Executive Intelligence Suite
 */
export function SalesAnalyticsChart({
  catalogues = [],
  selectedCatalogue: externalCatalogue,
  onSelectCatalogue,
}) {
  const [internalCatalogue, setInternalCatalogue] = useState('ALL')
  const selectedCatalogue =
    externalCatalogue !== undefined ? externalCatalogue : internalCatalogue

  const handleCatalogueChange = (val) => {
    if (onSelectCatalogue) onSelectCatalogue(val)
    setInternalCatalogue(val)
  }

  const [timeRange, setTimeRange] = useState('this_month') // 'today' | 'this_week' | 'this_month' | 'last_3_months' | 'custom'
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
    return formatLocalDateKey(d)
  })
  const [customEnd, setCustomEnd] = useState(() => formatLocalDateKey(new Date()))

  const [loading, setLoading] = useState(true)
  const [reportData, setReportData] = useState({
    summary: { totalBills: 0, totalRollsSold: 0, totalSales: 0 },
    dailySales: [],
    hourlySales: [],
    catalogueBreakdown: [],
    patternBreakdown: [],
  })

  const fetchChartData = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        filterType: timeRange,
        catalogue: selectedCatalogue === 'ALL' ? undefined : selectedCatalogue,
      }
      if (timeRange === 'custom') {
        if (!customStart || !customEnd) {
          setLoading(false)
          return
        }
        params.customStart = customStart
        params.customEnd = customEnd
      }

      const res = await reportsService.getOverview(params)
      if (res.data?.success && res.data?.data) {
        setReportData(res.data.data)
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false)
    }
  }, [timeRange, selectedCatalogue, customStart, customEnd])

  useEffect(() => {
    fetchChartData()
  }, [fetchChartData])

  // Real-time SSE refresh on new invoices
  useEffect(() => {
    const eventSource = new EventSource('/api/inventory/stream', {
      withCredentials: true,
    })

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'INVENTORY_UPDATED') {
          fetchChartData()
        }
      } catch {
        // Heartbeats
      }
    }

    return () => {
      eventSource.close()
    }
  }, [fetchChartData])

  // Build continuous series of dates for the selected time range
  const seriesData = useMemo(() => {
    const salesMap = new Map()
    for (const d of reportData.dailySales || []) {
      const key = d.date || d._id
      if (key) {
        salesMap.set(key, {
          revenue: Number(d.totalSales) || 0,
          rolls: Number(d.rollsSold) || 0,
        })
      }
    }

    const now = new Date()
    const points = []

    if (timeRange === 'today') {
      const todayDateStr = formatLocalDateKey(now)
      const hourlyMap = new Map()
      for (const h of reportData.hourlySales || []) {
        const hourKey = h.hour || h._id
        if (hourKey) {
          hourlyMap.set(hourKey, {
            revenue: Number(h.totalSales) || 0,
            rolls: Number(h.rollsSold) || 0,
          })
        }
      }

      const standardHours = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00']
      const allHours = new Set(standardHours)
      for (const [k] of hourlyMap) {
        allHours.add(k)
      }
      const sortedHours = Array.from(allHours).sort()

      const todayTotalRevenue = Number(reportData.summary?.totalSales) || 0
      const todayTotalRolls = Number(reportData.summary?.totalRollsSold) || 0

      let totalMappedRevenue = 0
      for (const [, val] of hourlyMap) {
        totalMappedRevenue += val.revenue
      }

      // Find current hour bracket
      const currentH = now.getHours()
      let activeIndex = 0
      let closestDiff = 999
      sortedHours.forEach((h, idx) => {
        const hVal = parseInt(h.split(':')[0], 10)
        const diff = Math.abs(currentH - hVal)
        if (diff < closestDiff) {
          closestDiff = diff
          activeIndex = idx
        }
      })

      sortedHours.forEach((h, idx) => {
        let rev = 0
        let rolls = 0
        if (hourlyMap.has(h)) {
          rev = hourlyMap.get(h).revenue
          rolls = hourlyMap.get(h).rolls
        } else if (totalMappedRevenue === 0 && todayTotalRevenue > 0 && idx === activeIndex) {
          // If backend only returned aggregate total, place it at active hour so user immediately sees bar & line
          rev = todayTotalRevenue
          rolls = todayTotalRolls
        }

        points.push({
          dateKey: `${todayDateStr} ${h}`,
          label: h,
          displayDate: `Today at ${h}`,
          revenue: rev,
          rolls: rolls,
        })
      })
    } else if (timeRange === 'this_week') {
      // Monday through Sunday
      const currDay = now.getDay() || 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - currDay + 1)
      monday.setHours(0, 0, 0, 0)

      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        const dateKey = formatLocalDateKey(d)
        const entry = salesMap.get(dateKey) || { revenue: 0, rolls: 0 }
        points.push({
          dateKey,
          label: `${dayNames[i]} ${d.getDate()}`,
          displayDate: d.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          revenue: entry.revenue,
          rolls: entry.rolls,
        })
      }
    } else if (timeRange === 'this_month') {
      // Days from 1st to today (or end of month)
      const year = now.getFullYear()
      const month = now.getMonth()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const endDay = Math.min(now.getDate(), daysInMonth)

      for (let day = 1; day <= endDay; day++) {
        const d = new Date(year, month, day)
        const dateKey = formatLocalDateKey(d)
        const entry = salesMap.get(dateKey) || { revenue: 0, rolls: 0 }
        points.push({
          dateKey,
          label: `${day} ${d.toLocaleDateString('en-IN', { month: 'short' })}`,
          displayDate: d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          revenue: entry.revenue,
          rolls: entry.rolls,
        })
      }
    } else if (timeRange === 'last_3_months') {
      // Last 12 weeks / grouped points
      const startDate = new Date(now)
      startDate.setDate(now.getDate() - 84) // ~12 weeks

      // Group into 12 weekly bins
      for (let w = 0; w < 12; w++) {
        const weekStart = new Date(startDate)
        weekStart.setDate(startDate.getDate() + w * 7)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)

        let weekRevenue = 0
        let weekRolls = 0

        for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
          const key = formatLocalDateKey(d)
          const found = salesMap.get(key)
          if (found) {
            weekRevenue += found.revenue
            weekRolls += found.rolls
          }
        }

        points.push({
          dateKey: `W${w + 1}`,
          label: `${weekStart.getDate()} ${weekStart.toLocaleDateString('en-IN', { month: 'short' })}`,
          displayDate: `Week of ${weekStart.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
          })} - ${weekEnd.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}`,
          revenue: weekRevenue,
          rolls: weekRolls,
        })
      }
    } else if (timeRange === 'custom') {
      if (customStart && customEnd) {
        const startD = new Date(customStart)
        const endD = new Date(customEnd)
        const daysDiff = Math.max(1, Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1)

        if (daysDiff <= 35) {
          for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
            const key = formatLocalDateKey(d)
            const entry = salesMap.get(key) || { revenue: 0, rolls: 0 }
            points.push({
              dateKey: key,
              label: `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`,
              displayDate: d.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }),
              revenue: entry.revenue,
              rolls: entry.rolls,
            })
          }
        } else {
          const intervalDays = Math.ceil(daysDiff / 14)
          for (let d = new Date(startD); d <= endD; ) {
            const rangeStart = new Date(d)
            const rangeEnd = new Date(d)
            rangeEnd.setDate(rangeEnd.getDate() + intervalDays - 1)
            if (rangeEnd > endD) rangeEnd.setTime(endD.getTime())

            let groupRev = 0
            let groupRolls = 0
            for (let sub = new Date(rangeStart); sub <= rangeEnd; sub.setDate(sub.getDate() + 1)) {
              const k = formatLocalDateKey(sub)
              const ent = salesMap.get(k)
              if (ent) {
                groupRev += ent.revenue
                groupRolls += ent.rolls
              }
            }

            points.push({
              dateKey: `${formatLocalDateKey(rangeStart)}_${formatLocalDateKey(rangeEnd)}`,
              label: `${rangeStart.getDate()} ${rangeStart.toLocaleDateString('en-IN', { month: 'short' })}`,
              displayDate: `${rangeStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${rangeEnd.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
              revenue: groupRev,
              rolls: groupRolls,
            })

            d.setDate(d.getDate() + intervalDays)
          }
        }
      }
    }

    return points
  }, [reportData.dailySales, reportData.hourlySales, reportData.summary, timeRange, customStart, customEnd])

  // Top catalogue volume stat
  const topCatalogue = useMemo(() => {
    const list = reportData.catalogueBreakdown || []
    if (list.length === 0) return null
    return list[0]
  }, [reportData.catalogueBreakdown])

  // Best day stat
  const bestDay = useMemo(() => {
    let top = null
    seriesData.forEach((s) => {
      if (!top || s.revenue > top.revenue) {
        top = s
      }
    })
    return top && top.revenue > 0 ? top : null
  }, [seriesData])

  // Top 5 Best-Selling Patterns
  const topPatterns = useMemo(() => {
    const list = reportData.patternBreakdown || []
    const sorted = [...list].sort((a, b) => (b.rollsCount || 0) - (a.rollsCount || 0))
    return sorted.slice(0, 5)
  }, [reportData.patternBreakdown])

  const maxPatternRolls = useMemo(() => {
    if (topPatterns.length === 0) return 1
    return Math.max(...topPatterns.map((p) => p.rollsCount || 0), 1)
  }, [topPatterns])

  // Catalogue color palettes for comparative cards
  const CAT_PALETTES = useMemo(
    () => [
      { grad: 'linear-gradient(90deg, #4f46e5 0%, #818cf8 100%)', text: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' },
      { grad: 'linear-gradient(90deg, #7c3aed 0%, #a78bfa 100%)', text: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
      { grad: 'linear-gradient(90deg, #059669 0%, #34d399 100%)', text: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
      { grad: 'linear-gradient(90deg, #d97706 0%, #fbbf24 100%)', text: '#d97706', bg: '#fffbeb', border: '#fde68a' },
      { grad: 'linear-gradient(90deg, #e11d48 0%, #fb7185 100%)', text: '#e11d48', bg: '#fff1f2', border: '#fecdd3' },
    ],
    []
  )

  // Catalogue Share Data
  const catalogueShareData = useMemo(() => {
    const list = reportData.catalogueBreakdown || []
    const totalRolls = Number(reportData.summary?.totalRollsSold) || 0
    return list.map((c, idx) => {
      const rolls = Number(c.rollsCount) || 0
      const rev = Number(c.revenue) || 0
      const pct = totalRolls > 0 ? Math.round((rolls / totalRolls) * 100) : 0
      const palette = CAT_PALETTES[idx % CAT_PALETTES.length]
      return {
        id: c._id,
        name: formatCatalogueLabel(c._id),
        rolls,
        revenue: rev,
        pct,
        palette,
      }
    })
  }, [reportData.catalogueBreakdown, reportData.summary?.totalRollsSold, CAT_PALETTES])

  // Real-Time Stock Health Ring & Breakdown
  const stockHealth = useMemo(() => {
    let totalPatterns = 0
    let outOfStock = 0
    let lowStock = 0

    catalogues.forEach((c) => {
      totalPatterns += c.totalPatterns || 0
      outOfStock += c.outOfStock || 0
      lowStock += c.lowStock || 0
    })

    const healthy = Math.max(0, totalPatterns - outOfStock - lowStock)
    const outPct = totalPatterns > 0 ? Math.round((outOfStock / totalPatterns) * 100) : 0
    const lowPct = totalPatterns > 0 ? Math.round((lowStock / totalPatterns) * 100) : 0
    const healthyPct = Math.max(0, 100 - outPct - lowPct)

    // SVG Donut calculations (r = 44, C = 276.46)
    const C = 276.46
    const healthyLen = (healthyPct / 100) * C
    const lowLen = (lowPct / 100) * C
    const outLen = (outPct / 100) * C

    return {
      totalPatterns,
      healthy,
      lowStock,
      outOfStock,
      healthyPct,
      lowPct,
      outPct,
      C,
      healthyLen,
      lowLen,
      outLen,
    }
  }, [catalogues])

  return (
    <div className="sales-analytics-card">
      {/* Top Header Row with Title and Time Range Tabs */}
      <div className="analytics-card-header">
        <div className="analytics-header-left">
          <div className="analytics-icon-badge">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div>
            <div className="analytics-title-row">
              <h2 className="analytics-title">Sales &amp; Roll Volume Analytics</h2>
              <span className="analytics-live-tag">
                <span className="analytics-dot-pulse" /> Live Billing Sync
              </span>
            </div>
            <p className="analytics-subtitle">
              Interactive Revenue and Rolls Sold trends with Executive Intelligence
            </p>
          </div>
        </div>

        {/* Filter Controls Cluster: Catalogue Dropdown + Time Range + Custom Date */}
        <div className="analytics-filter-cluster">
          {/* Catalogue Selector Filter */}
          <div className="analytics-cat-filter-wrap">
            <select
              value={selectedCatalogue}
              onChange={(e) => handleCatalogueChange(e.target.value)}
              className="analytics-cat-select"
              title="Filter by Catalogue"
            >
              <option value="ALL">All Catalogues</option>
              {catalogues.map((cat) => (
                <option key={cat._id || cat.slug || cat.name} value={cat.name}>
                  {cat.name} ({cat.totalStock || 0} Rolls)
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Tabs */}
          <div className="segmented-tab-group" role="tablist">
            <button
              type="button"
              className={`segmented-tab ${timeRange === 'today' ? 'active' : ''}`}
              onClick={() => setTimeRange('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`segmented-tab ${timeRange === 'this_week' ? 'active' : ''}`}
              onClick={() => setTimeRange('this_week')}
            >
              Weekly
            </button>
            <button
              type="button"
              className={`segmented-tab ${timeRange === 'this_month' ? 'active' : ''}`}
              onClick={() => setTimeRange('this_month')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`segmented-tab ${timeRange === 'last_3_months' ? 'active' : ''}`}
              onClick={() => setTimeRange('last_3_months')}
            >
              Last 3 Months
            </button>
            <button
              type="button"
              className={`segmented-tab ${timeRange === 'custom' ? 'active' : ''}`}
              onClick={() => setTimeRange('custom')}
              title="Select custom date range"
            >
              Custom Range
            </button>
          </div>
        </div>
      </div>

      {/* Custom Date Range Picker Bar (Shown when 'custom' is active) */}
      {timeRange === 'custom' && (
        <div className="custom-datepicker-strip">
          <div className="custom-date-field">
            <label className="date-field-label">From Date:</label>
            <input
              type="date"
              className="custom-date-input"
              value={customStart}
              max={customEnd || formatLocalDateKey(new Date())}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="custom-date-field">
            <label className="date-field-label">To Date:</label>
            <input
              type="date"
              className="custom-date-input"
              value={customEnd}
              min={customStart}
              max={formatLocalDateKey(new Date())}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
          <span className="custom-range-note">
            Filtered: <strong>{customStart}</strong> to <strong>{customEnd}</strong>
          </span>
        </div>
      )}

      {/* Active Filter Indicators Bar */}
      {(selectedCatalogue !== 'ALL' || timeRange === 'custom') && (
        <div className="active-filters-strip">
          <span className="active-filter-label">Active Filter:</span>
          {selectedCatalogue !== 'ALL' && (
            <span className="active-filter-pill">
              Collection: <strong>{selectedCatalogue}</strong>
              <button
                type="button"
                className="filter-pill-remove"
                onClick={() => handleCatalogueChange('ALL')}
                title="Remove catalogue filter"
              >
                ✕
              </button>
            </span>
          )}
          {timeRange === 'custom' && (
            <span className="active-filter-pill">
              Dates: <strong>{customStart}</strong> → <strong>{customEnd}</strong>
              <button
                type="button"
                className="filter-pill-remove"
                onClick={() => setTimeRange('this_month')}
                title="Reset to Monthly"
              >
                ✕
              </button>
            </span>
          )}
          <button
            type="button"
            className="clear-all-filters-btn"
            onClick={() => {
              handleCatalogueChange('ALL')
              setTimeRange('this_month')
            }}
          >
            Clear All
          </button>
        </div>
      )}

      {/* Period Headline KPI Summary Pills */}
      <div className="analytics-summary-strip">
        <div className="analytics-stat-item">
          <span className="stat-label">TOTAL SALES REVENUE</span>
          <strong className="stat-value text-indigo">
            ₹{(reportData.summary?.totalSales || 0).toLocaleString('en-IN')}
          </strong>
        </div>
        <div className="analytics-stat-item">
          <span className="stat-label">TOTAL ROLLS SOLD</span>
          <strong className="stat-value text-emerald">
            {(reportData.summary?.totalRollsSold || 0).toLocaleString('en-IN')} Rolls
          </strong>
        </div>
        <div className="analytics-stat-item">
          <span className="stat-label">INVOICES GENERATED</span>
          <strong className="stat-value">
            {reportData.summary?.totalBills || 0} Bills
          </strong>
        </div>
      </div>

      {/* TWO SEPARATE CHARTS: Sales Revenue & Rolls Sold */}
      <div className="analytics-charts-grid">
        {/* Chart 1: Sales Revenue Trend */}
        <SingleMetricChart
          metric="revenue"
          title="Sales Revenue Trend"
          icon="₹"
          accent="indigo"
          seriesData={seriesData}
          totalLabel={`₹${(reportData.summary?.totalSales || 0).toLocaleString('en-IN')}`}
          loading={loading}
        />

        {/* Chart 2: Rolls Sold Volume Trend */}
        <SingleMetricChart
          metric="rolls"
          title="Rolls Sold Trend"
          icon="📦"
          accent="emerald"
          seriesData={seriesData}
          totalLabel={`${(reportData.summary?.totalRollsSold || 0).toLocaleString('en-IN')} Rolls`}
          loading={loading}
        />
      </div>

      {/* EXECUTIVE INTELLIGENCE SUITE: 3 ADVANCED ANALYTICS CARDS (UPGRADED) */}
      <div className="analytics-trio-grid">
        {/* WIDGET 1: Top 5 Best-Selling Patterns Leaderboard */}
        <div className="trio-card upgraded-card">
          <div className="trio-card-header">
            <div style={{ flex: 1 }}>
              <div className="trio-title-row">
                <h4 className="trio-title">Top 5 Best-Selling Patterns</h4>
                <span className="trio-chip gold">Hot Sellers</span>
              </div>
              <p className="trio-subtitle">Highest moving designs in this period</p>
            </div>
          </div>

          <div className="trio-body">
            {topPatterns.length === 0 ? (
              <div className="trio-empty-box">No pattern sales recorded in this period yet</div>
            ) : (
              <div className="leaderboard-list">
                {topPatterns.map((pat, idx) => {
                  const rankMedal =
                    idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
                  const rankClass =
                    idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-other'
                  const pct = Math.round(((pat.rollsCount || 0) / maxPatternRolls) * 100)
                  return (
                    <div className="leaderboard-row-card" key={idx}>
                      <span className={`rank-badge ${rankClass}`}>{rankMedal}</span>
                      <div className="leaderboard-info">
                        <div className="leaderboard-names">
                          <strong className="pattern-code">Pattern {pat.patternNumber}</strong>
                          <span className="catalogue-name-tag">{formatCatalogueLabel(pat.catalogue)}</span>
                        </div>
                        <div className="leaderboard-progress-bg">
                          <div
                            className="leaderboard-progress-fill"
                            style={{ width: `${Math.max(14, pct)}%` }}
                          />
                        </div>
                      </div>
                      <div className="leaderboard-nums">
                        <strong className="rolls-count-pill">{pat.rollsCount} Rolls</strong>
                        <span className="revenue-sub">₹{(pat.revenue || 0).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* WIDGET 2: Catalogue Sales & Roll Share */}
        <div className="trio-card upgraded-card">
          <div className="trio-card-header">
            <div style={{ flex: 1 }}>
              <div className="trio-title-row">
                <h4 className="trio-title">Catalogue Sales &amp; Roll Share</h4>
                <span className="trio-chip indigo">Volume Share</span>
              </div>
              <p className="trio-subtitle">Volume distribution across collections</p>
            </div>
          </div>

          <div className="trio-body">
            {catalogueShareData.length === 0 ? (
              <div className="trio-empty-box">No catalogue sales recorded yet</div>
            ) : (
              <div className="cat-share-list">
                {catalogueShareData.map((cat, idx) => (
                  <div className="cat-share-card" key={idx}>
                    <div className="cat-share-header">
                      <div className="cat-title-group">
                        <span className="cat-color-dot" style={{ background: cat.palette.text }} />
                        <span className="cat-title">{cat.name}</span>
                      </div>
                      <span
                        className="cat-share-badge"
                        style={{
                          color: cat.palette.text,
                          background: cat.palette.bg,
                          borderColor: cat.palette.border,
                        }}
                      >
                        {cat.pct}% Share
                      </span>
                    </div>
                    <div className="cat-progress-bg">
                      <div
                        className="cat-progress-fill"
                        style={{
                          width: `${Math.max(8, cat.pct)}%`,
                          background: cat.palette.grad,
                        }}
                      />
                    </div>
                    <div className="cat-share-metrics">
                      <span className="cat-metric-rolls">
                        <strong>{cat.rolls}</strong> rolls sold
                      </span>
                      <span className="cat-metric-rev">
                        Revenue: <strong>₹{cat.revenue.toLocaleString('en-IN')}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* WIDGET 3: Real-Time Stock Health Ring */}
        <div className="trio-card upgraded-card">
          <div className="trio-card-header">
            <div style={{ flex: 1 }}>
              <div className="trio-title-row">
                <h4 className="trio-title">Inventory Stock Health</h4>
                <span className="trio-chip emerald">Live Inventory</span>
              </div>
              <p className="trio-subtitle">Live availability of catalogued patterns</p>
            </div>
          </div>

          <div className="trio-body">
            <div className="donut-widget-wrap">
              {/* SVG Circular Donut Chart */}
              <div className="donut-chart-container">
                <svg className="donut-svg" viewBox="0 0 140 140">
                  <defs>
                    <filter id="donutGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
                    </filter>
                  </defs>
                  {/* Background Track Ring */}
                  <circle
                    cx="70"
                    cy="70"
                    r="44"
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="15"
                  />
                  {/* Healthy Segment (Emerald) */}
                  {stockHealth.healthyLen > 0 && (
                    <circle
                      cx="70"
                      cy="70"
                      r="44"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="15"
                      strokeDasharray={`${stockHealth.healthyLen} ${stockHealth.C}`}
                      strokeDashoffset="0"
                      transform="rotate(-90 70 70)"
                      strokeLinecap="round"
                      filter="url(#donutGlow)"
                    />
                  )}
                  {/* Low Stock Segment (Amber) */}
                  {stockHealth.lowLen > 0 && (
                    <circle
                      cx="70"
                      cy="70"
                      r="44"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="15"
                      strokeDasharray={`${stockHealth.lowLen} ${stockHealth.C}`}
                      strokeDashoffset={`-${stockHealth.healthyLen}`}
                      transform="rotate(-90 70 70)"
                      strokeLinecap="round"
                    />
                  )}
                  {/* Out of Stock Segment (Red) */}
                  {stockHealth.outLen > 0 && (
                    <circle
                      cx="70"
                      cy="70"
                      r="44"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="15"
                      strokeDasharray={`${stockHealth.outLen} ${stockHealth.C}`}
                      strokeDashoffset={`-${stockHealth.healthyLen + stockHealth.lowLen}`}
                      transform="rotate(-90 70 70)"
                      strokeLinecap="round"
                    />
                  )}
                  {/* Donut Inner Text */}
                  <text x="70" y="66" textAnchor="middle" className="donut-center-num">
                    {stockHealth.totalPatterns}
                  </text>
                  <text x="70" y="80" textAnchor="middle" className="donut-center-lbl">
                    Designs
                  </text>
                </svg>
              </div>

              {/* Upgraded Status Cards Legend */}
              <div className="donut-legend-upgraded">
                <div className="legend-card status-healthy">
                  <div className="legend-card-header">
                    <span className="dot dot-healthy" />
                    <span className="legend-status-text">In Stock (&gt;10)</span>
                    <span className="legend-pct-pill green">{stockHealth.healthyPct}%</span>
                  </div>
                  <strong className="legend-count text-emerald">{stockHealth.healthy} Patterns</strong>
                </div>

                <div className="legend-card status-low">
                  <div className="legend-card-header">
                    <span className="dot dot-low" />
                    <span className="legend-status-text">Low Stock (≤10)</span>
                    <span className="legend-pct-pill amber">{stockHealth.lowPct}%</span>
                  </div>
                  <strong className="legend-count text-amber">{stockHealth.lowStock} Patterns</strong>
                </div>

                <div className="legend-card status-out">
                  <div className="legend-card-header">
                    <span className="dot dot-out" />
                    <span className="legend-status-text">Out of Stock (0)</span>
                    <span className="legend-pct-pill red">{stockHealth.outPct}%</span>
                  </div>
                  <strong className="legend-count text-danger">{stockHealth.outOfStock} Patterns</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Insights Strip */}
      <div className="analytics-footer-insights">
        <div className="insight-badge">
          <span className="insight-text">
            <strong>Peak Performance:</strong>{' '}
            {bestDay ? (
              <>
                {bestDay.displayDate} with <strong>₹{bestDay.revenue.toLocaleString('en-IN')}</strong> ({bestDay.rolls} Rolls)
              </>
            ) : (
              'No sales recorded in this period yet'
            )}
          </span>
        </div>

        {topCatalogue && (
          <div className="insight-badge">
            <span className="insight-text">
              <strong>Top Collection:</strong>{' '}
              {formatCatalogueLabel(topCatalogue._id)} (
              <strong>{topCatalogue.rollsCount}</strong> Rolls sold, ₹{topCatalogue.revenue?.toLocaleString('en-IN')})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
