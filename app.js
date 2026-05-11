const dataUrl = "./public/data/site-data.json";

const formatNumber = (value) => {
  const number = Number(value || 0);
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(Math.round(number));
};

const percent = (count, total) => (total ? `${Math.round((count / total) * 100)}%` : "0%");
const growthText = (value) => (value === null || value === undefined ? "首次快照" : value >= 0 ? `+${formatNumber(value)}` : formatNumber(value));

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

function metric(label, value, helper) {
  return `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(helper)}</small>
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
    metric("视频样本", formatNumber(data.metrics.videos), "30分钟及以上"),
    metric("频道数", formatNumber(data.metrics.channels), "去重 UP 主"),
    metric("样本总播放", formatNumber(data.metrics.totalViews), "搜索样本合计"),
    metric("中位播放", formatNumber(data.metrics.medianViews), "判断腰部机会"),
    metric("爆款阈值", formatNumber(data.metrics.hotThreshold), "头部区间基准"),
    metric("频道粉丝合计", formatNumber(data.metrics.totalFollowers), "已取到频道合计")
  ].join("");

  renderBars(document.querySelector("#category-chart"), data.summaries.categories.slice(0, 9), data.metrics.videos, "views");
  renderBars(document.querySelector("#length-chart"), data.summaries.lengthBuckets, data.metrics.videos, "count");
  renderBars(document.querySelector("#guest-chart"), data.summaries.guestIndustries.slice(0, 8), data.metrics.videos, "views");
  renderBars(document.querySelector("#originality-chart"), data.summaries.originality, data.metrics.videos, "count");
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
