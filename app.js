const dataUrl = "./public/data/site-data.json";

const formatNumber = (value) => {
  const number = Number(value || 0);
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(Math.round(number));
};

const percent = (count, total) => (total ? `${Math.round((count / total) * 100)}%` : "0%");
const growthText = (value) => (value === null || value === undefined ? "首次快照" : value >= 0 ? `+${formatNumber(value)}` : formatNumber(value));
const lengthBucketOrder = ["10-30分钟", "30-60分钟", "1-1.5小时", "1.5-2小时", "2-3小时", "3小时以上"];
const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const variance = (values) => {
  const avg = mean(values);
  return values.length ? mean(values.map((value) => (value - avg) ** 2)) : 0;
};
const standardDeviation = (values) => Math.sqrt(variance(values));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const log10 = (value) => Math.log10(Math.max(1, Number(value || 0)));

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function proxiedCoverUrl(url) {
  if (!url) return "";
  const normalized = String(url).replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(normalized)}&w=640&h=360&fit=cover&output=jpg&q=82`;
}

function fallbackCover(title, category) {
  const safeTitle = String(title || "视频播客").slice(0, 30);
  const safeCategory = String(category || "BILIBILI PODCAST");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#18212f"/>
          <stop offset="0.55" stop-color="#0f766e"/>
          <stop offset="1" stop-color="#2f6df6"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#g)"/>
      <rect x="34" y="34" width="572" height="292" rx="18" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.28)"/>
      <text x="54" y="92" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="700">${escapeSvgText(safeCategory)}</text>
      <text x="54" y="166" fill="#ffffff" font-family="Arial, sans-serif" font-size="36" font-weight="800">视频播客</text>
      <text x="54" y="218" fill="rgba(255,255,255,0.86)" font-family="Arial, sans-serif" font-size="24">${escapeSvgText(safeTitle)}</text>
      <circle cx="526" cy="226" r="42" fill="rgba(255,255,255,0.20)"/>
      <polygon points="512,203 512,249 550,226" fill="#ffffff"/>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function percentileValue(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function gini(values) {
  const sorted = values.filter((value) => value >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (!n) return 0;
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  const weighted = sorted.reduce((sum, value, index) => sum + (index + 1) * value, 0);
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (!n) return 0;
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const mx = mean(x);
  const my = mean(y);
  const numerator = x.reduce((sum, value, index) => sum + (value - mx) * (y[index] - my), 0);
  const denominator = Math.sqrt(x.reduce((sum, value) => sum + (value - mx) ** 2, 0) * y.reduce((sum, value) => sum + (value - my) ** 2, 0));
  return denominator ? numerator / denominator : 0;
}

function groupBy(items, key) {
  const map = new Map();
  items.forEach((item) => {
    const label = typeof key === "function" ? key(item) : item[key];
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(item);
  });
  return map;
}

function summarizeGroup(label, items, hotThreshold) {
  const views = items.map((item) => item.views || 0);
  const engagement = items.map((item) => item.engagementRate || 0);
  return {
    label,
    count: items.length,
    meanViews: Math.round(mean(views)),
    medianViews: Math.round(percentileValue(views, 0.5)),
    p90Views: Math.round(percentileValue(views, 0.9)),
    varianceViews: Math.round(variance(views)),
    hotRate: items.length ? items.filter((item) => (item.views || 0) >= hotThreshold).length / items.length : 0,
    engagementRate: mean(engagement)
  };
}

function renderStatsGrid(data, videos) {
  const views = videos.map((video) => video.views || 0);
  const durationMinutes = videos.map((video) => (video.durationSec || 0) / 60);
  const sortedViews = [...views].sort((a, b) => b - a);
  const top10Share = sortedViews.slice(0, 10).reduce((sum, value) => sum + value, 0) / Math.max(1, data.metrics.totalViews);
  const top20Share = sortedViews.slice(0, Math.ceil(videos.length * 0.2)).reduce((sum, value) => sum + value, 0) / Math.max(1, data.metrics.totalViews);
  const cv = standardDeviation(views) / Math.max(1, mean(views));
  const durationCorrelation = pearson(durationMinutes, views.map(log10));
  const p90 = percentileValue(views, 0.9);
  const p50 = percentileValue(views, 0.5);

  const cards = [
    ["播放均值", formatNumber(mean(views)), "样本总播放除以视频数。它容易被几个超级爆款拉高，所以要和中位数一起看。"],
    ["播放方差", formatNumber(variance(views)), "衡量每条视频播放量偏离均值的整体程度。数值越大，说明爆款和长尾之间的差距越剧烈。"],
    ["标准差", formatNumber(standardDeviation(views)), "方差开平方后的波动尺度，更接近播放量本身的单位。可以理解为单条视频常见的上下波动幅度。"],
    ["变异系数", cv.toFixed(2), "标准差除以均值，用来比较离散程度。大于 1 通常说明市场高度不均匀，平均数参考价值下降。"],
    ["P90 / P50", `${(p90 / Math.max(1, p50)).toFixed(1)}x`, "P90 是头部 10% 门槛，P50 是中位数。倍数越大，越说明一旦选题击中，上限会远高于普通视频。"],
    ["Gini 系数", gini(views).toFixed(2), "衡量播放量集中度，0 代表完全平均，1 代表极端集中。越高说明少数节目拿走了更多播放。"],
    ["Top10 播放占比", `${Math.round(top10Share * 100)}%`, "前 10 条视频贡献的总播放比例。这个数越高，越说明爆款策略比稳定日更更重要。"],
    ["Top20% 播放占比", `${Math.round(top20Share * 100)}%`, "样本前 20% 视频贡献的播放比例。可用来判断是否存在明显二八效应。"],
    ["时长-播放相关", durationCorrelation.toFixed(2), "时长与播放量对数之间的相关性。接近 0 说明变长本身不是爆款原因，题目和嘉宾更关键。"]
  ];

  document.querySelector("#stats-grid").innerHTML = cards
    .map(
      ([label, value, helper]) => `
        <article class="stat-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(helper)}</small>
        </article>
      `
    )
    .join("");
}

function renderHistogram(target, videos) {
  const buckets = [
    ["<1千", 0, 1000],
    ["1千-5千", 1000, 5000],
    ["5千-1万", 5000, 10000],
    ["1万-5万", 10000, 50000],
    ["5万-10万", 50000, 100000],
    ["10万-50万", 100000, 500000],
    ["50万-100万", 500000, 1000000],
    [">100万", 1000000, Infinity]
  ].map(([label, min, max]) => ({
    label,
    count: videos.filter((video) => (video.views || 0) >= min && (video.views || 0) < max).length
  }));
  const width = 720;
  const height = 310;
  const pad = { left: 42, right: 18, top: 20, bottom: 54 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const barWidth = chartWidth / buckets.length - 12;
  const bars = buckets
    .map((bucket, index) => {
      const x = pad.left + index * (chartWidth / buckets.length) + 6;
      const h = (bucket.count / maxCount) * chartHeight;
      const y = pad.top + chartHeight - h;
      return `
        <g>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="4" fill="#148f6a"></rect>
          <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" class="chart-value">${bucket.count}</text>
          <text x="${x + barWidth / 2}" y="${height - 24}" text-anchor="middle" class="chart-label">${escapeSvgText(bucket.label)}</text>
        </g>
      `;
    })
    .join("");
  target.innerHTML = chartSvg(width, height, `
    ${axisLines(pad, width, height)}
    ${bars}
  `);
}

function renderLorenz(target, videos) {
  const sorted = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0));
  const total = sorted.reduce((sum, video) => sum + (video.views || 0), 0) || 1;
  const width = 720;
  const height = 310;
  const pad = { left: 44, right: 24, top: 20, bottom: 44 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  let cumulative = 0;
  const points = [[pad.left, pad.top + chartHeight]];
  sorted.forEach((video, index) => {
    cumulative += video.views || 0;
    points.push([
      pad.left + ((index + 1) / sorted.length) * chartWidth,
      pad.top + chartHeight - (cumulative / total) * chartHeight
    ]);
  });
  const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const xTicks = percentTicks(pad, chartWidth, chartHeight, "x");
  const yTicks = percentTicks(pad, chartWidth, chartHeight, "y");
  target.innerHTML = chartSvg(width, height, `
    ${axisLines(pad, width, height)}
    ${xTicks}
    ${yTicks}
    <path d="M${pad.left} ${pad.top + chartHeight} L${pad.left + chartWidth} ${pad.top}" stroke="#b9c4cf" stroke-width="2" stroke-dasharray="5 5" fill="none"></path>
    <path d="${path}" stroke="#2f6df6" stroke-width="3" fill="none"></path>
    <text x="${pad.left + chartWidth / 2}" y="${height - 10}" text-anchor="middle" class="chart-label">按播放量从高到低排序后的视频累计占比</text>
    <text x="15" y="${pad.top + chartHeight / 2}" transform="rotate(-90 15 ${pad.top + chartHeight / 2})" text-anchor="middle" class="chart-label">累计播放占比</text>
    <text x="${pad.left + 8}" y="${pad.top + 16}" class="chart-note">曲线越贴近左上，说明越少的视频拿走越多播放</text>
  `);
}

function renderDurationScatter(target, videos) {
  renderScatter(target, {
    points: videos.map((video) => ({
      x: (video.durationSec || 0) / 60,
      y: video.views || 0,
      label: video.title,
      color: categoryColor(video.category)
    })),
    xLabel: "时长（分钟）",
    yLabel: "播放量（对数）",
    xScale: "linear",
    yScale: "log",
    maxX: Math.max(210, percentileValue(videos.map((video) => (video.durationSec || 0) / 60), 0.97))
  });
}

function renderChannelScatter(target, channels) {
  renderScatter(target, {
    points: channels
      .filter((channel) => channel.followers !== null && channel.followers > 0)
      .map((channel) => ({
        x: channel.followers,
        y: channel.avgViews,
        label: channel.name,
        color: categoryColor(channel.mainCategory)
      })),
    xLabel: "粉丝数（对数）",
    yLabel: "样本均播（对数）",
    xScale: "log",
    yScale: "log"
  });
}

function renderScatter(target, config) {
  const width = 720;
  const height = 340;
  const pad = { left: 54, right: 22, top: 20, bottom: 50 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const points = config.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const xValues = points.map((point) => (config.xScale === "log" ? log10(point.x) : point.x));
  const yValues = points.map((point) => (config.yScale === "log" ? log10(point.y) : point.y));
  const minX = config.xScale === "log" ? Math.min(...xValues, 0) : 0;
  const maxX = config.maxX ? (config.xScale === "log" ? log10(config.maxX) : config.maxX) : Math.max(...xValues, 1);
  const minY = config.yScale === "log" ? Math.min(...yValues, 0) : 0;
  const maxY = Math.max(...yValues, 1);
  const xTickSvg = numericTicks({
    axis: "x",
    pad,
    chartWidth,
    chartHeight,
    min: minX,
    max: maxX,
    values: config.xTicks || buildTicks(minX, maxX, 5),
    formatter: config.xFormatter || ((value) => (config.xScale === "log" ? formatNumber(10 ** value) : Math.round(value)))
  });
  const yTickSvg = numericTicks({
    axis: "y",
    pad,
    chartWidth,
    chartHeight,
    min: minY,
    max: maxY,
    values: config.yTicks || buildTicks(minY, maxY, 5),
    formatter: config.yFormatter || ((value) => (config.yScale === "log" ? formatNumber(10 ** value) : formatNumber(value)))
  });
  const dotSvg = points
    .map((point) => {
      const scaledX = config.xScale === "log" ? log10(point.x) : point.x;
      const scaledY = config.yScale === "log" ? log10(point.y) : point.y;
      const x = pad.left + ((scaledX - minX) / Math.max(0.001, maxX - minX)) * chartWidth;
      const y = pad.top + chartHeight - ((scaledY - minY) / Math.max(0.001, maxY - minY)) * chartHeight;
      const r = clamp(3 + log10(point.y) * 0.55, 3, 8);
      return `
        <circle cx="${clamp(x, pad.left, pad.left + chartWidth).toFixed(1)}" cy="${clamp(y, pad.top, pad.top + chartHeight).toFixed(1)}" r="${r.toFixed(1)}" fill="${point.color}" opacity="0.68">
          <title>${escapeSvgText(point.label)}：${formatNumber(point.y)}</title>
        </circle>
      `;
    })
    .join("");
  target.innerHTML = chartSvg(width, height, `
    ${axisLines(pad, width, height)}
    ${xTickSvg}
    ${yTickSvg}
    ${dotSvg}
    <text x="${pad.left + chartWidth / 2}" y="${height - 14}" text-anchor="middle" class="chart-label">${escapeSvgText(config.xLabel)}</text>
    <text x="16" y="${pad.top + chartHeight / 2}" transform="rotate(-90 16 ${pad.top + chartHeight / 2})" text-anchor="middle" class="chart-label">${escapeSvgText(config.yLabel)}</text>
  `);
}

function renderDurationLine(target, videos, hotThreshold) {
  const groups = groupBy(videos, "lengthBucket");
  const rows = lengthBucketOrder.map((label) => summarizeGroup(label, groups.get(label) || [], hotThreshold));
  renderMultiLineChart(target, rows, {
    xLabels: rows.map((row) => row.label),
    series: [
      ["均播", rows.map((row) => row.meanViews), "#148f6a"],
      ["中位", rows.map((row) => row.medianViews), "#2f6df6"],
      ["P90", rows.map((row) => row.p90Views), "#a86f12"]
    ],
    yLabel: "播放量（次）"
  });
}

function renderMonthLine(target, videos) {
  const monthKey = (video) => {
    const date = new Date((video.pubdate || 0) * 1000);
    if (Number.isNaN(date.getTime())) return "未知";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const groups = [...groupBy(videos, monthKey).entries()]
    .filter(([label]) => label !== "未知")
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-10);
  const rows = groups.map(([label, items]) => ({
    label,
    count: items.length,
    meanViews: Math.round(mean(items.map((item) => item.views || 0)))
  }));
  renderMultiLineChart(target, rows, {
    xLabels: rows.map((row) => row.label.slice(5)),
    series: [
      ["数量", rows.map((row) => row.count), "#7457c7"],
      ["均播", rows.map((row) => row.meanViews), "#148f6a"]
    ],
    yLabel: "指数（各序列最大值=100）",
    normalizeSeries: true
  });
}

function renderMultiLineChart(target, rows, config) {
  const width = 720;
  const height = 310;
  const pad = { left: 48, right: 24, top: 22, bottom: 54 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const series = config.series.map(([label, values, color]) => {
    const max = Math.max(...values, 1);
    return {
      label,
      color,
      values: config.normalizeSeries ? values.map((value) => (value / max) * 100) : values
    };
  });
  const maxY = Math.max(...series.flatMap((item) => item.values), 1);
  const tickSvg = numericTicks({
    axis: "y",
    pad,
    chartWidth,
    chartHeight,
    min: 0,
    max: maxY,
    values: buildTicks(0, maxY, 5),
    formatter: (value) => (config.normalizeSeries ? `${Math.round(value)}` : formatNumber(value))
  });
  const step = rows.length > 1 ? chartWidth / (rows.length - 1) : chartWidth;
  const paths = series
    .map((item) => {
      const points = item.values.map((value, index) => [
        pad.left + index * step,
        pad.top + chartHeight - (value / maxY) * chartHeight
      ]);
      const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
      const circles = points
        .map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="4" fill="${item.color}"><title>${escapeSvgText(item.label)} ${escapeSvgText(rows[index].label)}：${formatNumber(config.series.find(([label]) => label === item.label)[1][index])}</title></circle>`)
        .join("");
      return `<path d="${path}" stroke="${item.color}" stroke-width="3" fill="none"></path>${circles}`;
    })
    .join("");
  const labels = config.xLabels
    .map((label, index) => `<text x="${pad.left + index * step}" y="${height - 24}" text-anchor="middle" class="chart-label">${escapeSvgText(label)}</text>`)
    .join("");
  const legend = series
    .map((item, index) => `<g transform="translate(${pad.left + index * 92}, ${pad.top})"><rect width="12" height="12" rx="3" fill="${item.color}"></rect><text x="18" y="11" class="chart-label">${escapeSvgText(item.label)}</text></g>`)
    .join("");
  target.innerHTML = chartSvg(width, height, `
    ${axisLines(pad, width, height)}
    ${tickSvg}
    ${paths}
    ${labels}
    ${legend}
    <text x="16" y="${pad.top + chartHeight / 2}" transform="rotate(-90 16 ${pad.top + chartHeight / 2})" text-anchor="middle" class="chart-label">${escapeSvgText(config.yLabel)}</text>
  `);
}

function renderCategoryEfficiency(videos, hotThreshold) {
  const rows = [...groupBy(videos, "category").entries()]
    .map(([label, items]) => summarizeGroup(label, items, hotThreshold))
    .sort((a, b) => b.meanViews - a.meanViews);
  document.querySelector("#category-efficiency-table").innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.label)}</td>
          <td>${row.count}</td>
          <td>${formatNumber(row.meanViews)}</td>
          <td>${formatNumber(row.medianViews)}</td>
          <td>${formatNumber(row.p90Views)}</td>
          <td>${Math.round(row.hotRate * 100)}%</td>
          <td>${(row.engagementRate * 100).toFixed(1)}%</td>
        </tr>
      `
    )
    .join("");
  return rows;
}

function renderAdvancedInsights(videos, categoryRows) {
  const views = videos.map((video) => video.views || 0);
  const topCategory = categoryRows[0];
  const bestEngagement = [...categoryRows].sort((a, b) => b.engagementRate - a.engagementRate)[0];
  const durationRows = [...groupBy(videos, "lengthBucket").entries()].map(([label, items]) => summarizeGroup(label, items, percentileValue(views, 0.9)));
  const bestDuration = durationRows.sort((a, b) => b.medianViews - a.medianViews)[0];
  const cv = standardDeviation(views) / Math.max(1, mean(views));
  const p90 = percentileValue(views, 0.9);
  const p50 = percentileValue(views, 0.5);
  const top10Share = [...views].sort((a, b) => b - a).slice(0, 10).reduce((sum, value) => sum + value, 0) / Math.max(1, views.reduce((sum, value) => sum + value, 0));

  document.querySelector("#advanced-insights").innerHTML = `
    <p>样本播放的变异系数为 ${cv.toFixed(2)}，P90/P50 为 ${(p90 / Math.max(1, p50)).toFixed(1)} 倍，说明 B 站长视频播客是典型的高离散市场：选题和嘉宾击中后会明显越过中位线。</p>
    <p>按均播看，${escapeHtml(topCategory.label)} 当前效率最高；按互动率看，${escapeHtml(bestEngagement.label)} 更容易形成收藏、点赞和讨论，适合做长期栏目资产。</p>
    <p>按中位播放看，${escapeHtml(bestDuration.label)} 的稳定性最好。你的 30 分钟切片适合扩大分发面，但建议保留 90 分钟以上的深度合集来承接高粘性用户。</p>
    <p>Top10 视频贡献约 ${Math.round(top10Share * 100)}% 播放，说明爆款判断不能只看平均数，应该同时看中位数、P90 和互动率。</p>
  `;
}

function renderAdvancedAnalysis(data) {
  const videos = data.sampleVideos || data.topVideos;
  renderStatsGrid(data, videos);
  renderHistogram(document.querySelector("#views-histogram"), videos);
  renderLorenz(document.querySelector("#lorenz-chart"), videos);
  renderDurationScatter(document.querySelector("#duration-scatter"), videos);
  renderChannelScatter(document.querySelector("#channel-scatter"), data.topChannels || []);
  renderDurationLine(document.querySelector("#duration-line-chart"), videos, data.metrics.hotThreshold);
  renderMonthLine(document.querySelector("#month-line-chart"), videos);
  const categoryRows = renderCategoryEfficiency(videos, data.metrics.hotThreshold);
  renderAdvancedInsights(videos, categoryRows);
}

function categoryColor(category = "") {
  const colors = {
    "媒体 / 内容": "#2f6df6",
    "科技 / AI": "#148f6a",
    "商业 / 创业": "#a86f12",
    "社会 / 人文": "#7457c7",
    "影视 / 文娱": "#cc4b37",
    "财经 / 职场": "#0f766e",
    "教育 / 语言": "#557089",
    "体育 / 赛事": "#b65f21",
    "生活 / 情感": "#b94b74"
  };
  return colors[category] || "#657186";
}

function chartSvg(width, height, content) {
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="分析图表" xmlns="http://www.w3.org/2000/svg">
      <style>
        .chart-label { fill: #657186; font-size: 12px; font-family: Arial, sans-serif; }
        .chart-value { fill: #18212f; font-size: 12px; font-weight: 700; font-family: Arial, sans-serif; }
        .chart-note { fill: #657186; font-size: 12px; font-family: Arial, sans-serif; }
      </style>
      ${content}
    </svg>
  `;
}

function axisLines(pad, width, height) {
  return `
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="#dbe2ea"></line>
    <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="#dbe2ea"></line>
  `;
}

function buildTicks(min, max, count) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min || 0, max || 1];
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function numericTicks({ axis, pad, chartWidth, chartHeight, min, max, values, formatter }) {
  return values
    .map((value) => {
      if (axis === "x") {
        const x = pad.left + ((value - min) / Math.max(0.001, max - min)) * chartWidth;
        const y = pad.top + chartHeight;
        return `
          <line x1="${x}" y1="${y}" x2="${x}" y2="${y + 5}" stroke="#b9c4cf"></line>
          <text x="${x}" y="${y + 19}" text-anchor="middle" class="chart-label">${escapeSvgText(formatter(value))}</text>
        `;
      }
      const x = pad.left;
      const y = pad.top + chartHeight - ((value - min) / Math.max(0.001, max - min)) * chartHeight;
      return `
        <line x1="${x - 5}" y1="${y}" x2="${x}" y2="${y}" stroke="#b9c4cf"></line>
        <text x="${x - 8}" y="${y + 4}" text-anchor="end" class="chart-label">${escapeSvgText(formatter(value))}</text>
      `;
    })
    .join("");
}

function percentTicks(pad, chartWidth, chartHeight, axis) {
  const values = [0, 25, 50, 75, 100];
  return values
    .map((value) => {
      if (axis === "x") {
        const x = pad.left + (value / 100) * chartWidth;
        const y = pad.top + chartHeight;
        return `
          <line x1="${x}" y1="${y}" x2="${x}" y2="${y + 5}" stroke="#b9c4cf"></line>
          <text x="${x}" y="${y + 19}" text-anchor="middle" class="chart-label">${value}%</text>
        `;
      }
      const x = pad.left;
      const y = pad.top + chartHeight - (value / 100) * chartHeight;
      return `
        <line x1="${x - 5}" y1="${y}" x2="${x}" y2="${y}" stroke="#b9c4cf"></line>
        <text x="${x - 8}" y="${y + 4}" text-anchor="end" class="chart-label">${value}%</text>
      `;
    })
    .join("");
}

function metric(label, value, helper) {
  return metricWithDelta(label, value, helper, null);
}

function metricWithDelta(label, value, helper, delta) {
  const deltaClass = delta === null || delta === undefined || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const deltaArrow = delta === null || delta === undefined || delta === 0 ? "→" : delta > 0 ? "↑" : "↓";
  const deltaText = delta === null || delta === undefined ? "基线快照" : `${deltaArrow} ${delta > 0 ? "+" : ""}${formatNumber(delta)}`;
  return `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(helper)}</small>
      <em class="metric-delta ${deltaClass}">${escapeHtml(deltaText)}</em>
    </article>
  `;
}

function renderBars(target, rows, total, mode = "views") {
  const max = Math.max(...rows.map((row) => (mode === "views" ? row.views : row.count)), 1);
  target.innerHTML = rows
    .map((row) => {
      const value = mode === "views" ? row.views : row.count;
      const label = mode === "views" ? `${formatNumber(row.views)}播放 / ${row.count}条` : `${row.count}条 / ${percent(row.count, total)}`;
      return `
        <div class="bar-row">
          <div class="bar-label">
            <span>${escapeHtml(row.label)}</span>
            <b>${escapeHtml(label)}</b>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${Math.max(3, (value / max) * 100)}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function fillSelect(select, label, values) {
  select.innerHTML = [`<option value="">${label}</option>`]
    .concat([...values].sort().map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`))
    .join("");
}

function renderHotVideos(videos) {
  document.querySelector("#hot-videos").innerHTML = videos
    .slice(0, 9)
    .map(
      (video) => `
        <a class="hot-item" href="${escapeHtml(video.url)}" target="_blank" rel="noreferrer">
          <img
            src="${escapeHtml(proxiedCoverUrl(video.cover) || fallbackCover(video.title, video.category))}"
            data-original-cover="${escapeHtml(video.cover || "")}"
            data-fallback-cover="${escapeHtml(fallbackCover(video.title, video.category))}"
            alt="${escapeHtml(video.title)}"
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <div>
            <span>${escapeHtml(video.category)} · ${escapeHtml(video.durationLabel)}</span>
            <h3>${escapeHtml(video.title)}</h3>
            <p>${escapeHtml(video.author)} · ${formatNumber(video.views)}播放</p>
            <ul>
              ${(video.hotReasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
            </ul>
          </div>
        </a>
      `
    )
    .join("");
  attachCoverFallbacks();
}

function attachCoverFallbacks() {
  document.querySelectorAll(".hot-item img").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.dataset.triedOriginal !== "1" && image.dataset.originalCover) {
        image.dataset.triedOriginal = "1";
        image.src = image.dataset.originalCover;
        return;
      }
      if (image.src !== image.dataset.fallbackCover) {
        image.src = image.dataset.fallbackCover;
      }
    });
  });
}

function renderChannels(channels) {
  document.querySelector("#channel-table").innerHTML = channels
    .slice(0, 24)
    .map(
      (channel) => `
        <tr>
          <td>
            <a href="https://space.bilibili.com/${channel.mid}" target="_blank" rel="noreferrer">${escapeHtml(channel.name)}</a>
          </td>
          <td>${escapeHtml(channel.mainCategory)}</td>
          <td>${channel.videos}</td>
          <td>${channel.followers === null ? "未取到" : formatNumber(channel.followers)}</td>
          <td>${formatNumber(channel.totalViews)}</td>
          <td>${formatNumber(channel.avgViews)}</td>
          <td>${escapeHtml(growthText(channel.followerGrowth))}</td>
        </tr>
      `
    )
    .join("");
}

function renderVideos(videos) {
  document.querySelector("#video-table").innerHTML = videos
    .slice(0, 50)
    .map(
      (video) => `
        <tr>
          <td class="video-title">
            <a href="${escapeHtml(video.url)}" target="_blank" rel="noreferrer">${escapeHtml(video.title)}</a>
            <span>${escapeHtml(video.originality)}</span>
          </td>
          <td>${escapeHtml(video.author)}</td>
          <td>${escapeHtml(video.category)}</td>
          <td>${escapeHtml(video.guestIndustry)}</td>
          <td>${escapeHtml(video.durationLabel)}</td>
          <td>${formatNumber(video.views)}</td>
          <td>${escapeHtml(growthText(video.viewGrowth))}</td>
        </tr>
      `
    )
    .join("");
}

function renderGrowth(data) {
  const target = document.querySelector("#growth-view");
  if (!data.growth.hasHistory) {
    target.innerHTML = `
      <div class="empty-state">
        <strong>需要至少两次快照</strong>
        <p>首次运行会建立基线。明天自动更新后，这里会显示播放增长最快的视频和粉丝增长最快的频道。</p>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <h3>播放增长</h3>
    ${data.growth.videos
      .slice(0, 6)
      .map((video) => `<p><b>${growthText(video.viewGrowth)}</b><span>${escapeHtml(video.title)}</span></p>`)
      .join("")}
    <h3>粉丝增长</h3>
    ${data.growth.channels
      .slice(0, 6)
      .map((channel) => `<p><b>${growthText(channel.followerGrowth)}</b><span>${escapeHtml(channel.name)}</span></p>`)
      .join("")}
  `;
}

function renderInsights(insights) {
  document.querySelector("#insights").innerHTML = `
    <p>${escapeHtml(insights.market)}</p>
    <p>${escapeHtml(insights.originality)}</p>
    <p>${escapeHtml(insights.yourPosition)}</p>
  `;
}

function renderOwnBenchmark(benchmark) {
  document.querySelector("#own-benchmark").innerHTML = `
    <div class="own-copy">
      <p><b>定位：</b>${escapeHtml(benchmark.positioning)}</p>
      <p><b>分发：</b>${escapeHtml(benchmark.episodePlan)}</p>
      <ul>
        ${benchmark.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
    <div class="score-grid">
      ${Object.entries(benchmark.score)
        .map(
          ([key, value]) => `
            <div class="score">
              <span>${escapeHtml(scoreLabel(key))}</span>
              <strong>${value}</strong>
              <div class="score-track"><i style="width:${value}%"></i></div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function scoreLabel(key) {
  return {
    topicFit: "选题匹配",
    lengthFit: "时长策略",
    differentiation: "差异化",
    initialDistributionRisk: "冷启动风险"
  }[key];
}

function setupFilters(data) {
  const category = document.querySelector("#category-filter");
  const originality = document.querySelector("#originality-filter");
  const length = document.querySelector("#length-filter");
  fillSelect(category, "全部分类", new Set(data.topVideos.map((video) => video.category)));
  fillSelect(originality, "全部原创性", new Set(data.topVideos.map((video) => video.originality)));
  fillSelect(length, "全部时长", new Set(data.topVideos.map((video) => video.lengthBucket)));

  const apply = () => {
    const filtered = data.topVideos.filter(
      (video) =>
        (!category.value || video.category === category.value) &&
        (!originality.value || video.originality === originality.value) &&
        (!length.value || video.lengthBucket === length.value)
    );
    renderVideos(filtered);
  };
  [category, originality, length].forEach((select) => select.addEventListener("change", apply));
  apply();
}

async function init() {
  const data = await loadSiteData();

  document.querySelector("#data-date").textContent = `数据日期 ${data.date}`;
  document.querySelector("#data-note").textContent = data.growth.hasHistory ? "含增长快照" : "首次快照";
  document.querySelector("#source-note").textContent = `${data.source.platform}；${data.source.note}`;

  document.querySelector("#metrics").innerHTML = [
    metricWithDelta("视频样本", formatNumber(data.metrics.videos), "10分钟及以上", data.metricDeltas?.videos),
    metricWithDelta("频道数", formatNumber(data.metrics.channels), "去重 UP 主", data.metricDeltas?.channels),
    metricWithDelta("样本总播放", formatNumber(data.metrics.totalViews), "搜索样本合计", data.metricDeltas?.totalViews),
    metricWithDelta("中位播放", formatNumber(data.metrics.medianViews), "判断腰部机会", data.metricDeltas?.medianViews),
    metricWithDelta("爆款阈值", formatNumber(data.metrics.hotThreshold), "头部区间基准", data.metricDeltas?.hotThreshold),
    metricWithDelta("频道粉丝合计", formatNumber(data.metrics.totalFollowers), "已取到频道合计", data.metricDeltas?.totalFollowers)
  ].join("");

  renderBars(document.querySelector("#category-chart"), data.summaries.categories.slice(0, 9), data.metrics.videos, "views");
  renderBars(document.querySelector("#length-chart"), data.summaries.lengthBuckets, data.metrics.videos, "count");
  renderBars(document.querySelector("#guest-chart"), data.summaries.guestIndustries.slice(0, 8), data.metrics.videos, "views");
  renderBars(document.querySelector("#originality-chart"), data.summaries.originality, data.metrics.videos, "count");
  renderAdvancedAnalysis(data);
  renderHotVideos(data.hotVideos);
  renderChannels(data.topChannels);
  setupFilters(data);
  renderGrowth(data);
  renderInsights(data.insights);
  renderOwnBenchmark(data.yourPodcastBenchmark);
}

async function loadSiteData() {
  if (window.__BILI_SITE_DATA__) return window.__BILI_SITE_DATA__;

  if (window.location.protocol === "file:") {
    throw new Error("直接打开 HTML 时需要 public/data/site-data.js。请运行 npm run update-data 重新生成数据文件。");
  }

  const response = await fetch(dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("site-data.json not found. Run npm run update-data first.");
  return response.json();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="error"><h1>数据未生成</h1><p>${escapeHtml(error.message)}</p><p>请先运行 <code>npm run update-data</code>。</p></main>`;
});
