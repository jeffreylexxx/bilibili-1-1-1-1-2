import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HISTORY_DIR = path.join(ROOT, "data", "history");
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const SITE_DATA = path.join(PUBLIC_DATA_DIR, "site-data.json");
const SITE_DATA_JS = path.join(PUBLIC_DATA_DIR, "site-data.js");

const pagesPerQuery = Number(process.env.BILI_PAGES_PER_QUERY || 2);
const channelLimit = Number(process.env.BILI_CHANNEL_LIMIT || 140);
const requestDelayMs = Number(process.env.BILI_REQUEST_DELAY_MS || 650);
const minDurationSec = 10 * 60;
const lengthBucketOrder = ["10-30分钟", "30-60分钟", "1-1.5小时", "1.5-2小时", "2-3小时", "3小时以上"];

const queries = [
  "视频播客",
  "上B站看播客",
  "播客 对谈",
  "长视频 播客",
  "访谈 对话",
  "深度访谈",
  "商业 播客 对话",
  "AI 播客 对谈",
  "教授 访谈 对谈",
  "外国人 上海 访谈",
  "圆桌 对谈",
  "VODCAST"
];

const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  Referer: "https://search.bilibili.com/",
  Accept: "application/json,text/plain,*/*",
  ...(process.env.BILI_COOKIE ? { Cookie: process.env.BILI_COOKIE } : {})
};

const categoryRules = [
  ["科技 / AI", ["人工智能", "AI", "大模型", "Agent", "SGLang", "开源", "编程", "芯片", "机器人", "科技", "数字化", "制造"]],
  ["商业 / 创业", ["商业", "创业", "创始人", "CEO", "公司", "投资", "融资", "品牌", "管理", "消费", "高管"]],
  ["社会 / 人文", ["社会", "人文", "历史", "女性", "家庭", "城市", "心理", "教育", "文化研究", "学者"]],
  ["媒体 / 内容", ["媒体", "播客", "内容", "记者", "主持", "出版", "写作", "传播", "访谈"]],
  ["影视 / 文娱", ["电影", "演员", "导演", "编剧", "音乐", "明星", "综艺", "A24", "影评", "艺人"]],
  ["财经 / 职场", ["财经", "经济", "金融", "职场", "基金", "股票", "财富", "宏观", "行业"]],
  ["教育 / 语言", ["英语", "日语", "法语", "学习", "听力", "口语", "大学", "课程", "教授"]],
  ["体育 / 赛事", ["足球", "篮球", "世界杯", "英超", "NBA", "运动", "体育"]],
  ["生活 / 情感", ["生活", "情感", "亲密关系", "人生", "成长", "婚姻", "疗愈", "日常"]]
];

const guestRules = [
  ["大学教授 / 学者", ["教授", "学者", "研究员", "博士", "大学", "学院", "社科", "实验室"]],
  ["商业公司高管 / 创始人", ["CEO", "高管", "创始人", "联合创始人", "总裁", "投资人", "合伙人", "创业者"]],
  ["科技从业者 / 工程师", ["工程师", "程序员", "开发者", "AI", "大模型", "开源", "算法", "产品经理"]],
  ["在华外国人 / 海外背景", ["外国人", "老外", "海外", "硅谷", "留学", "北美", "上海", "跨文化"]],
  ["媒体人 / 作家", ["主持人", "记者", "媒体人", "作家", "出版人", "编辑", "评论员"]],
  ["影视娱乐嘉宾", ["演员", "导演", "编剧", "歌手", "艺人", "明星", "影后"]],
  ["体育人物", ["球员", "教练", "世界杯", "足球", "篮球"]]
];

const repostSignals = ["youtube", "YouTube", "熟肉", "双语", "搬运", "转载", "字幕", "翻译", "中字", "机翻", "AI生成", "RSS"];
const originalSignals = ["本期", "我们", "对话", "访谈", "正片", "EP", "出品", "录制", "嘉宾", "视频播客"];
const talkSignals = ["播客", "对谈", "访谈", "对话", "圆桌", "聊天", "VODCAST", "Podcast", "podcast", "慢谈"];
const negativeSignals = [
  "直播录屏",
  "唱歌",
  "ASMR",
  "助眠",
  "游戏实况",
  "纯音乐",
  "有声书",
  "手书",
  "电影版",
  "甜文",
  "小说"
];
const hardNegativeSignals = [
  "磨耳朵",
  "全100集",
  "100集",
  "合集",
  "Daily English",
  "雅思",
  "四六级",
  "英语学习",
  "英语听力",
  "英语口语",
  "日语听力"
];
const strongTalkSignals = ["视频播客", "上B站看播客", "上B站看视频播客", "对话", "对谈", "访谈", "采访", "圆桌", "VODCAST", "嘉宾"];
const languageLearningSignals = ["英语学习", "英语听力", "英语口语", "日语听力", "法语", "雅思", "磨耳朵", "口语"];

function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function timeInShanghaiForFile() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .format(new Date())
    .replaceAll(":", "");
}

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDuration(value) {
  if (typeof value === "number") return value;
  const parts = String(value || "")
    .split(":")
    .map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h) return `${h}小时${m}分`;
  return `${m}分钟`;
}

function lengthBucket(seconds) {
  if (seconds < 1800) return "10-30分钟";
  if (seconds < 3600) return "30-60分钟";
  if (seconds < 5400) return "1-1.5小时";
  if (seconds < 7200) return "1.5-2小时";
  if (seconds < 10800) return "2-3小时";
  return "3小时以上";
}

function firstMatchingBucket(text, rules, fallback = "其他") {
  for (const [label, terms] of rules) {
    if (terms.some((term) => text.includes(term))) return label;
  }
  return fallback;
}

function classifyOriginality(text) {
  const repostScore = repostSignals.filter((term) => text.includes(term)).length;
  const originalScore = originalSignals.filter((term) => text.includes(term)).length;
  if (repostScore >= 2 || (repostScore >= 1 && originalScore === 0)) return "搬运 / 翻译字幕";
  if (originalScore >= 1) return "原创 / 自制访谈";
  return "未明确";
}

function isLikelyTalkPodcast(video) {
  const titleDesc = `${video.title} ${video.description}`;
  const rawText = `${titleDesc} ${video.tag}`;
  const text = rawText.toLowerCase();
  const titleDescText = titleDesc.toLowerCase();
  const hasTalkSignal = talkSignals.some((term) => text.includes(term.toLowerCase()));
  const hasStrongTalkSignal = strongTalkSignals.some((term) => titleDescText.includes(term.toLowerCase()));
  const hasNegative = negativeSignals.some((term) => text.includes(term.toLowerCase()));
  const hasHardNegative = hardNegativeSignals.some((term) => text.includes(term.toLowerCase()));
  const isLanguageLearning = languageLearningSignals.some((term) => text.includes(term.toLowerCase()));
  const hasInterviewLanguage = ["对话", "对谈", "访谈", "采访", "conversation", "interview"].some((term) => text.includes(term));

  if (hasHardNegative) return false;
  if (hasNegative && !hasInterviewLanguage) return false;
  if (isLanguageLearning && !hasInterviewLanguage) return false;
  return hasTalkSignal && hasStrongTalkSignal;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const response = await fetch(url, { headers: browserHeaders });
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      const data = await response.json();
      if (data.code === 0) return data.data;
      throw new Error(`Bilibili API code ${data.code}: ${data.message}`);
    }
    if (attempt === tries) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 140)}`);
    }
    await sleep(600 * attempt);
  }
  return null;
}

async function searchVideos() {
  const videos = new Map();
  for (const keyword of queries) {
    for (const duration of [2, 3, 4]) {
      for (let page = 1; page <= pagesPerQuery; page += 1) {
        const url = new URL("https://api.bilibili.com/x/web-interface/search/type");
        url.searchParams.set("search_type", "video");
        url.searchParams.set("keyword", keyword);
        url.searchParams.set("duration", String(duration));
        url.searchParams.set("order", "totalrank");
        url.searchParams.set("page", String(page));

        try {
          const data = await fetchJson(url);
          const results = Array.isArray(data?.result) ? data.result : [];
          for (const item of results) {
            const durationSec = parseDuration(item.duration);
            const title = cleanText(item.title);
            const description = cleanText(item.description);
            const tag = cleanText(item.tag);
            const video = {
              bvid: item.bvid,
              aid: item.aid,
              title,
              description,
              tag,
              author: cleanText(item.author),
              mid: Number(item.mid),
              typeName: cleanText(item.typename),
              url: `https://www.bilibili.com/video/${item.bvid}`,
              cover: item.pic?.startsWith("//") ? `https:${item.pic}` : item.pic,
              pubdate: Number(item.pubdate || 0),
              durationSec,
              views: Number(item.play || 0),
              danmaku: Number(item.danmaku || item.video_review || 0),
              replies: Number(item.review || 0),
              favorites: Number(item.favorites || 0),
              likes: Number(item.like || 0),
              discoveredBy: keyword
            };
            if (video.bvid && durationSec >= minDurationSec && isLikelyTalkPodcast(video)) {
              const existing = videos.get(video.bvid);
              if (!existing || video.views > existing.views) videos.set(video.bvid, video);
            }
          }
        } catch (error) {
          console.warn(`[warn] search failed: ${keyword} duration=${duration} page=${page}: ${error.message}`);
        }
        await sleep(requestDelayMs);
      }
    }
  }
  return [...videos.values()];
}

async function enrichVideoStats(videos) {
  const sorted = [...videos].sort((a, b) => b.views - a.views);
  const candidates = sorted.slice(0, Number(process.env.BILI_VIDEO_DETAIL_LIMIT || 80));
  const byBvid = new Map(videos.map((video) => [video.bvid, video]));

  for (const video of candidates) {
    const url = new URL("https://api.bilibili.com/x/web-interface/view");
    url.searchParams.set("bvid", video.bvid);
    try {
      const data = await fetchJson(url, 2);
      const current = byBvid.get(video.bvid);
      current.durationSec = Number(data.duration || current.durationSec);
      current.description = cleanText(data.desc || current.description);
      current.views = Number(data.stat?.view || current.views);
      current.danmaku = Number(data.stat?.danmaku || current.danmaku);
      current.replies = Number(data.stat?.reply || current.replies);
      current.favorites = Number(data.stat?.favorite || data.stat?.fav || current.favorites);
      current.coins = Number(data.stat?.coin || 0);
      current.shares = Number(data.stat?.share || 0);
      current.likes = Number(data.stat?.like || current.likes);
      current.copyright = data.copyright === 1 ? "自制" : "转载";
    } catch (error) {
      console.warn(`[warn] video detail failed: ${video.bvid}: ${error.message}`);
    }
    await sleep(Math.max(360, Math.round(requestDelayMs * 0.65)));
  }
  return [...byBvid.values()];
}

async function fetchChannelStats(videos) {
  const channelMap = new Map();
  for (const video of videos) {
    if (!channelMap.has(video.mid)) {
      channelMap.set(video.mid, {
        mid: video.mid,
        name: video.author,
        followers: null,
        videos: 0,
        totalViews: 0,
        avgViews: 0,
        topVideoViews: 0,
        categories: new Map()
      });
    }
    const channel = channelMap.get(video.mid);
    channel.videos += 1;
    channel.totalViews += video.views;
    channel.topVideoViews = Math.max(channel.topVideoViews, video.views);
  }

  const channels = [...channelMap.values()].sort((a, b) => b.totalViews - a.totalViews);
  for (const channel of channels.slice(0, channelLimit)) {
    const url = new URL("https://api.bilibili.com/x/relation/stat");
    url.searchParams.set("vmid", String(channel.mid));
    try {
      const data = await fetchJson(url, 2);
      channel.followers = Number(data.follower || 0);
    } catch (error) {
      console.warn(`[warn] channel stat failed: ${channel.mid}: ${error.message}`);
    }
    await sleep(Math.max(360, Math.round(requestDelayMs * 0.65)));
  }

  for (const channel of channels) {
    channel.avgViews = Math.round(channel.totalViews / Math.max(1, channel.videos));
  }
  return channels;
}

function buildChannelsFromExistingStats(videos, existingChannels = []) {
  const followerMap = new Map(existingChannels.map((channel) => [String(channel.mid), channel.followers]));
  const channelMap = new Map();
  for (const video of videos) {
    if (!channelMap.has(video.mid)) {
      channelMap.set(video.mid, {
        mid: video.mid,
        name: video.author,
        followers: followerMap.has(String(video.mid)) ? followerMap.get(String(video.mid)) : null,
        videos: 0,
        totalViews: 0,
        avgViews: 0,
        topVideoViews: 0
      });
    }
    const channel = channelMap.get(video.mid);
    channel.videos += 1;
    channel.totalViews += video.views || 0;
    channel.topVideoViews = Math.max(channel.topVideoViews, video.views || 0);
  }
  return [...channelMap.values()]
    .map((channel) => ({
      ...channel,
      avgViews: Math.round(channel.totalViews / Math.max(1, channel.videos))
    }))
    .sort((a, b) => b.totalViews - a.totalViews);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index];
}

function engagementRate(video) {
  const engagement = (video.likes || 0) + (video.favorites || 0) + (video.coins || 0) + (video.shares || 0) + (video.replies || 0);
  return video.views > 0 ? engagement / video.views : 0;
}

function explainHotVideo(video, hotThreshold) {
  const text = `${video.title} ${video.description} ${video.tag}`;
  const reasons = [];
  if (video.views >= hotThreshold) reasons.push("播放量进入样本头部区间");
  if (engagementRate(video) >= 0.08) reasons.push("收藏、点赞、投币等互动密度较高");
  if (guestRules.slice(0, 6).some(([, terms]) => terms.some((term) => text.includes(term)))) {
    reasons.push("嘉宾身份具备明确标签或公共知名度");
  }
  if (["科技 / AI", "商业 / 创业", "社会 / 人文", "影视 / 文娱"].includes(video.category)) {
    reasons.push("选题处在 B 站长播客高需求内容带");
  }
  if (video.originality === "搬运 / 翻译字幕") reasons.push("海外内容或字幕搬运带来信息差");
  if (video.durationSec >= 5400 && video.durationSec <= 10800) reasons.push("时长足够深，但仍在可完整观看区间");
  return reasons.slice(0, 3);
}

async function readPreviousSnapshots(today) {
  if (!existsSync(HISTORY_DIR)) return [];
  const files = (await readdir(HISTORY_DIR))
    .filter((file) => file.endsWith(".json") && file !== `${today}.json`)
    .sort();
  const snapshots = [];
  for (const file of files.slice(-14)) {
    try {
      snapshots.push(JSON.parse(await readFile(path.join(HISTORY_DIR, file), "utf8")));
    } catch {
      console.warn(`[warn] could not read snapshot ${file}`);
    }
  }
  return snapshots;
}

async function archiveExistingTodaySnapshot(todayPath, today) {
  if (!existsSync(todayPath)) return;
  try {
    const existing = await readFile(todayPath, "utf8");
    const archivePath = path.join(HISTORY_DIR, `${today}-${timeInShanghaiForFile()}.json`);
    await writeFile(archivePath, existing);
  } catch {
    console.warn("[warn] could not archive existing snapshot before overwrite");
  }
}

function indexPrevious(snapshots) {
  const latestVideo = new Map();
  const latestChannel = new Map();
  let latestSnapshot = null;
  for (const snapshot of snapshots) {
    latestSnapshot = snapshot;
    for (const video of snapshot.videos || []) latestVideo.set(video.bvid, video);
    for (const channel of snapshot.channels || []) latestChannel.set(String(channel.mid), channel);
  }
  return { latestVideo, latestChannel, latestSnapshot };
}

function groupCount(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = typeof key === "function" ? key(item) : item[key];
    map.set(value, (map.get(value) || 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count }));
}

function groupViews(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = typeof key === "function" ? key(item) : item[key];
    const current = map.get(value) || { label: value, count: 0, views: 0 };
    current.count += 1;
    current.views += item.views || 0;
    map.set(value, current);
  }
  return [...map.values()].sort((a, b) => b.views - a.views);
}

function completeLengthBuckets(videos) {
  const byLabel = new Map(groupCount(videos, "lengthBucket").map((item) => [item.label, item]));
  return lengthBucketOrder.map((label) => byLabel.get(label) || { label, count: 0 });
}

function computeMetricDeltas(currentMetrics, previousSnapshot) {
  if (!previousSnapshot) {
    return {
      videos: null,
      channels: null,
      totalViews: null,
      medianViews: null,
      hotThreshold: null,
      totalFollowers: null
    };
  }
  const previousVideos = (previousSnapshot.videos || []).filter((video) => video.durationSec >= minDurationSec && isLikelyTalkPodcast(video));
  const previousChannels = buildChannelsFromExistingStats(previousVideos, previousSnapshot.channels || []);
  const previousViews = previousVideos.map((video) => video.views || 0);
  const previousMetrics = {
    videos: previousVideos.length,
    channels: previousChannels.length,
    totalViews: previousVideos.reduce((sum, video) => sum + (video.views || 0), 0),
    medianViews: percentile(previousViews, 0.5),
    hotThreshold: Math.max(100000, percentile(previousViews, 0.9)),
    totalFollowers: previousChannels.reduce((sum, channel) => sum + (channel.followers || 0), 0)
  };
  return Object.fromEntries(
    Object.entries(currentMetrics).map(([key, value]) => [key, value - (previousMetrics[key] || 0)])
  );
}

function buildInsightText(videos, channels, summaries) {
  const topCategory = summaries.categories[0]?.label || "科技 / AI";
  const topLength = summaries.lengthBuckets[0]?.label || "30-60分钟";
  const original = summaries.originality.find((item) => item.label === "原创 / 自制访谈")?.count || 0;
  const repost = summaries.originality.find((item) => item.label === "搬运 / 翻译字幕")?.count || 0;
  const originalShare = videos.length ? Math.round((original / videos.length) * 100) : 0;
  const repostShare = videos.length ? Math.round((repost / videos.length) * 100) : 0;
  const medianViews = percentile(videos.map((video) => video.views || 0), 0.5);
  const professorFit = videos.filter((video) => video.guestIndustry === "大学教授 / 学者").length;
  const executiveFit = videos.filter((video) => video.guestIndustry === "商业公司高管 / 创始人").length;
  const foreignerFit = videos.filter((video) => video.guestIndustry === "在华外国人 / 海外背景").length;

  return {
    market:
      `当前样本中，${topCategory} 是播放贡献最高的内容带，${topLength} 是出现频次最高的时长段。中位播放量约 ${formatNumber(
        medianViews
      )}，说明长视频播客并不是只靠超大频道成立，中腰部频道仍有通过强选题进入搜索流量的空间。`,
    originality:
      `原创/自制访谈约占 ${originalShare}%，搬运或翻译字幕类约占 ${repostShare}%。搬运类常靠海外信息差和字幕劳动获得收藏，原创类更依赖嘉宾识别度、主持人品牌和连续栏目化。`,
    yourPosition:
      `你的定位与样本中的三个可增长人群有交集：教授/学者样本 ${professorFit} 条，商业高管/创始人样本 ${executiveFit} 条，在华外国人或海外背景样本 ${foreignerFit} 条。把 3 小时对谈拆成 6 条半小时节目，能覆盖搜索友好的 30-60 分钟区间，同时保留后续剪长版或合集的余地。竞争力主要来自“上海现场 + 技术产业 + 学术/商业/跨文化”的组合，而不是和明星访谈正面拼嘉宾知名度。`
  };
}

function buildSiteData(snapshot, previous) {
  const { latestVideo, latestChannel, latestSnapshot } = previous;
  const videos = snapshot.videos.map((video) => {
    const text = `${video.title} ${video.description} ${video.tag}`;
    const category = firstMatchingBucket(text, categoryRules, "其他");
    const guestIndustry = firstMatchingBucket(text, guestRules, "未明确");
    const originality = video.copyright === "转载" ? "搬运 / 翻译字幕" : classifyOriginality(text);
    const prev = latestVideo.get(video.bvid);
    return {
      ...video,
      category,
      guestIndustry,
      originality,
      lengthBucket: lengthBucket(video.durationSec),
      durationLabel: formatDuration(video.durationSec),
      engagementRate: Number(engagementRate(video).toFixed(4)),
      viewGrowth: prev ? (video.views || 0) - (prev.views || 0) : null
    };
  });

  const channels = snapshot.channels.map((channel) => {
    const prev = latestChannel.get(String(channel.mid));
    const channelVideos = videos.filter((video) => video.mid === channel.mid);
    const categoryViews = groupViews(channelVideos, "category");
    return {
      ...channel,
      followerGrowth: prev && channel.followers !== null && prev.followers !== null ? channel.followers - prev.followers : null,
      totalViewGrowth: prev ? channel.totalViews - prev.totalViews : null,
      mainCategory: categoryViews[0]?.label || "未明确"
    };
  });

  const hotThreshold = Math.max(100000, percentile(videos.map((video) => video.views || 0), 0.9));
  const hotVideos = videos
    .filter((video) => video.views >= hotThreshold || engagementRate(video) >= 0.12)
    .sort((a, b) => b.views - a.views)
    .slice(0, 18)
    .map((video) => ({ ...video, hotReasons: explainHotVideo(video, hotThreshold) }));

  const summaries = {
    categories: groupViews(videos, "category"),
    guestIndustries: groupViews(videos, "guestIndustry"),
    lengthBuckets: completeLengthBuckets(videos),
    originality: groupCount(videos, "originality"),
    typeNames: groupViews(videos, "typeName").slice(0, 10)
  };

  const topGrowthVideos = videos
    .filter((video) => video.viewGrowth !== null)
    .sort((a, b) => b.viewGrowth - a.viewGrowth)
    .slice(0, 12);
  const topGrowthChannels = channels
    .filter((channel) => channel.followerGrowth !== null)
    .sort((a, b) => b.followerGrowth - a.followerGrowth)
    .slice(0, 12);

  const metrics = {
    videos: videos.length,
    channels: channels.length,
    totalViews: videos.reduce((sum, video) => sum + (video.views || 0), 0),
    medianViews: percentile(videos.map((video) => video.views || 0), 0.5),
    hotThreshold,
    totalFollowers: channels.reduce((sum, channel) => sum + (channel.followers || 0), 0)
  };

  return {
    generatedAt: new Date().toISOString(),
    date: snapshot.date,
    source: {
      platform: "Bilibili public web APIs",
      queryCount: queries.length,
      pagesPerQuery,
      minDurationMinutes: 10,
      note: "分类、原创/搬运、嘉宾行业为关键词启发式判断；增长数据来自历史快照。"
    },
    metrics,
    metricDeltas: computeMetricDeltas(metrics, latestSnapshot),
    summaries,
    insights: buildInsightText(videos, channels, summaries),
    hotVideos,
    sampleVideos: videos.map((video) => ({
      bvid: video.bvid,
      title: video.title,
      author: video.author,
      mid: video.mid,
      url: video.url,
      pubdate: video.pubdate,
      durationSec: video.durationSec,
      durationLabel: video.durationLabel,
      lengthBucket: video.lengthBucket,
      views: video.views || 0,
      likes: video.likes || 0,
      favorites: video.favorites || 0,
      coins: video.coins || 0,
      shares: video.shares || 0,
      replies: video.replies || 0,
      engagementRate: video.engagementRate,
      category: video.category,
      guestIndustry: video.guestIndustry,
      originality: video.originality,
      typeName: video.typeName
    })),
    topChannels: channels.sort((a, b) => b.totalViews - a.totalViews).slice(0, 30),
    topVideos: videos.sort((a, b) => b.views - a.views).slice(0, 160),
    growth: {
      videos: topGrowthVideos,
      channels: topGrowthChannels,
      hasHistory: topGrowthVideos.length > 0 || topGrowthChannels.length > 0
    },
    yourPodcastBenchmark: {
      positioning: "大学教授、商业公司高管、在上海工作的外国人；科技、人工智能、数字制造、社会研究、媒体。",
      episodePlan: "每次 3 小时对谈拆成 6 条约 30 分钟节目，并可追加完整长版或主题合集。",
      score: {
        topicFit: 86,
        lengthFit: 91,
        differentiation: 82,
        initialDistributionRisk: 64
      },
      recommendations: [
        "优先把标题写成“嘉宾身份 + 具体冲突/问题 + 行业关键词”，例如 AI 工程化、上海制造业转型、外国人在中国公司的管理经验。",
        "30 分钟分集适合搜索和完播，但建议保留一个 90-180 分钟合集，承接深度播客用户。",
        "教授和高管嘉宾需要减少抽象议题，尽量围绕真实案例、行业转折和个人判断做标题。",
        "在上海工作的外国人是差异化资产，适合绑定跨文化、产业现场、城市观察，而不是泛泛做生活访谈。"
      ]
    }
  };
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (number >= 100000000) return `${(number / 100000000).toFixed(1)}亿`;
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(Math.round(number));
}

async function main() {
  await mkdir(HISTORY_DIR, { recursive: true });
  await mkdir(PUBLIC_DATA_DIR, { recursive: true });

  const date = todayInShanghai();
  const todayPath = path.join(HISTORY_DIR, `${date}.json`);
  let snapshot;

  if (process.env.BILI_REBUILD_FROM_HISTORY === "1" && existsSync(todayPath)) {
    console.log(`[info] rebuilding site data from ${todayPath}`);
    snapshot = JSON.parse(await readFile(todayPath, "utf8"));
    snapshot.videos = (snapshot.videos || []).filter((video) => video.durationSec >= minDurationSec && isLikelyTalkPodcast(video));
    snapshot.channels = buildChannelsFromExistingStats(snapshot.videos, snapshot.channels || []);
  } else {
    console.log(`[info] collecting Bilibili long video podcast sample for ${date}`);
    let videos = await searchVideos();
    console.log(`[info] search yielded ${videos.length} unique long talk videos`);

    if (videos.length === 0 && existsSync(todayPath)) {
      console.warn("[warn] live search returned 0 videos; preserving and rebuilding from existing snapshot");
      snapshot = JSON.parse(await readFile(todayPath, "utf8"));
      snapshot.videos = (snapshot.videos || []).filter((video) => video.durationSec >= minDurationSec && isLikelyTalkPodcast(video));
      snapshot.channels = buildChannelsFromExistingStats(snapshot.videos, snapshot.channels || []);
    } else {
      videos = await enrichVideoStats(videos);
      videos = videos.filter((video) => video.durationSec >= minDurationSec && isLikelyTalkPodcast(video));
      const channels = await fetchChannelStats(videos);
      snapshot = {
        date,
        generatedAt: new Date().toISOString(),
        queries,
        minDurationSec,
        videos,
        channels
      };
    }
  }

  await archiveExistingTodaySnapshot(todayPath, date);
  const previous = indexPrevious(await readPreviousSnapshots(date));
  const siteData = buildSiteData(snapshot, previous);

  await writeFile(path.join(HISTORY_DIR, `${date}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeFile(SITE_DATA, `${JSON.stringify(siteData, null, 2)}\n`);
  await writeFile(SITE_DATA_JS, `window.__BILI_SITE_DATA__ = ${JSON.stringify(siteData).replace(/</g, "\\u003c")};\n`);
  console.log(`[info] wrote ${SITE_DATA}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
