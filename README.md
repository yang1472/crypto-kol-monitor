<div align="center">

# 🚀 Crypto KOL Monitor v2.1

**中文** | [English](#english)

多平台数据聚合 + AI智能分析 的币圈信号监控系统

Multi-Platform Data Aggregation + AI-Powered Crypto Signal Monitoring System

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Railway](https://img.shields.io/badge/Deploy%20on-Railway-purple.svg)](https://railway.app)

</div>

---

## 📋 目录 Table of Contents

- [功能特性 Features](#-功能特性-features)
- [系统架构 Architecture](#-系统架构-architecture)
- [快速开始 Quick Start](#-快速开始-quick-start)
- [配置说明 Configuration](#-配置说明-configuration)
- [部署指南 Deployment](#-部署指南-deployment)
- [API额度说明 API Quotas](#-api额度说明-api-quotas)
- [常见问题 FAQ](#-常见问题-faq)
- [免责声明 Disclaimer](#-免责声明-disclaimer)

---

## ✨ 功能特性 Features

### 🇨🇳 中文

- 🔗 **多平台聚合** - 整合 DexScreener、Birdeye、Helius 等多个数据源
- 🤖 **AI智能分析** - 支持 DeepSeek / MiniMax / 规则AI，自动故障转移
- 📊 **智能去重** - 多平台相同信号自动合并，避免重复推送
- 🎯 **动态评分** - 基于交易量、流动性、持有者等多维度评分
- 💡 **完整策略** - 自动建议仓位大小、止损止盈、时间周期
- 📱 **Discord通知** - 实时推送高置信度交易机会
- 🔄 **24/7监控** - 全天候自动扫描市场

### 🇺🇸 English

- 🔗 **Multi-Platform Aggregation** - Integrates DexScreener, Birdeye, Helius data sources
- 🤖 **AI-Powered Analysis** - Supports DeepSeek / MiniMax / Rule-based AI with auto-failover
- 📊 **Smart Deduplication** - Merges duplicate signals across platforms
- 🎯 **Dynamic Scoring** - Multi-dimensional scoring based on volume, liquidity, holders
- 💡 **Complete Strategy** - Auto-suggests position size, stop-loss, take-profit, time horizon
- 📱 **Discord Notifications** - Real-time push of high-confidence opportunities
- 🔄 **24/7 Monitoring** - Round-the-clock market scanning

---

## 🏗️ 系统架构 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      数据层 Data Layer                        │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ DexScreener  │   Birdeye    │    Helius    │   Solscan      │
│  (Free API)  │ (100req/day) │(1M req/month)│   (Optional)   │
└──────┬───────┴──────┬───────┴──────┬───────┴───────┬────────┘
       │              │              │               │
       └──────────────┴──────┬───────┴───────────────┘
                             ▼
                  ┌─────────────────────┐
                  │   信号聚合器         │
                  │  Signal Aggregator  │
                  │  • 去重合并          │
                  │  • 风险评分          │
                  │  • 置信度计算        │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │    AI 路由器        │
                  │    AI Router        │
                  │  • DeepSeek (Primary)│
                  │  • MiniMax (Backup) │
                  │  • Rule-based AI    │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │   Discord通知       │
                  │ Discord Notifications│
                  └─────────────────────┘
```

---

## 🚀 快速开始 Quick Start

### 🇨🇳 中文指南

#### 1. 克隆项目
```bash
git clone https://github.com/yang1472/crypto-kol-monitor.git
cd crypto-kol-monitor
```

#### 2. 安装依赖
```bash
npm install
```

#### 3. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的API密钥
```

**必需配置 Required Configuration：**
```env
# Discord配置 Discord Config
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_discord_channel_id

# AI提供商（至少配置一个 At least one）
DEEPSEEK_API_KEY=your_deepseek_key
MINIMAX_API_KEY=your_minimax_key
```

#### 4. 本地运行
```bash
npm run build
npm start
```

### 🇺🇸 English Guide

#### 1. Clone Repository
```bash
git clone https://github.com/yourusername/crypto-kol-monitor.git
cd crypto-kol-monitor
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Configure Environment Variables
```bash
cp .env.example .env
# Edit .env file with your API keys
```

#### 4. Run Locally
```bash
npm run build
npm start
```

---

## ⚙️ 配置说明 Configuration

### 环境变量 Environment Variables

| 变量名 Variable | 说明 Description | 默认值 Default | 必需 Required |
|----------------|-----------------|---------------|--------------|
| `DISCORD_BOT_TOKEN` | Discord Bot令牌 | - | ✅ Yes |
| `DISCORD_CHANNEL_ID` | Discord频道ID | - | ✅ Yes |
| `DEEPSEEK_API_KEY` | DeepSeek API密钥 | - | ⚠️ 至少一个 |
| `MINIMAX_API_KEY` | MiniMax API密钥 | - | ⚠️ 至少一个 |
| `AI_PROVIDER` | AI提供商选择 | `auto` | ❌ No |
| `MONITOR_INTERVAL_MINUTES` | 扫描间隔(分钟) | `5` | ❌ No |
| `MIN_CONFIDENCE_SCORE` | 最小信号分数 | `60` | ❌ No |
| `MIN_AI_CONFIDENCE` | AI最小置信度 | `65` | ❌ No |

### AI_PROVIDER 选项 Options

| 值 Value | 说明 Description |
|---------|-----------------|
| `auto` | 自动选择已配置的AI Auto-select |
| `deepseek` | 强制使用DeepSeek |
| `minimax` | 强制使用MiniMax |
| `rule-based` | 使用规则AI（零成本）Rule-based (zero cost) |

---

## 🚂 部署指南 Deployment

### 方案1：Railway部署（推荐）Option 1: Railway (Recommended)

#### 步骤1：准备代码 Step 1: Prepare Code
```bash
git add .
git commit -m "Prepare for deployment"
git push origin master
```

#### 步骤2：在Railway部署 Step 2: Deploy on Railway

1. 访问 https://railway.app 并登录
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 选择你的 `crypto-kol-monitor` 仓库
4. 等待自动部署完成

#### 步骤3：设置环境变量 Step 3: Set Environment Variables

在Railway Dashboard中：
- 点击 **Variables** 标签
- 添加所有必需的环境变量

#### 步骤4：查看日志 Step 4: Check Logs
```
Dashboard → Deployments → View Logs
```

### 方案2：本地服务器 Option 2: Local Server

使用PM2进程管理器：
```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name crypto-monitor
pm2 save
pm2 startup
```

---

## 📊 API额度说明 API Quotas

### 🇨🇳 免费额度总结

| 平台 | 免费额度 | 实际消耗 | 评估 |
|------|---------|---------|------|
| **DeepSeek** | 500万 tokens/月 | ~1000 tokens/分析 | ✅ 可分析5000次 |
| **MiniMax** | 100万 tokens/月 | ~1000 tokens/分析 | ✅ 可分析1000次 |
| **DexScreener** | 无限制 | ~20次/小时 | ✅ 完全免费 |
| **Birdeye** | 100次/天 | 每次扫描3-5次 | ⚠️ 已默认禁用 |

### 🇺🇸 Free Tier Summary

| Platform | Free Quota | Consumption | Status |
|----------|-----------|-------------|--------|
| **DeepSeek** | 5M tokens/month | ~1000 tokens/analysis | ✅ 5000 analyses |
| **MiniMax** | 1M tokens/month | ~1000 tokens/analysis | ✅ 1000 analyses |
| **DexScreener** | Unlimited | ~20 req/hour | ✅ Completely free |
| **Birdeye** | 100 req/day | 3-5 req/scan | ⚠️ Disabled by default |

### 💡 使用建议 Recommendations

**节省额度 Tips：**
1. 调整扫描间隔为15-30分钟 `MONITOR_INTERVAL_MINUTES=30`
2. 使用 `AI_PROVIDER=rule-based` 作为fallback
3. 仅在市场活跃时段启用DeepSeek分析

---

## ❓ 常见问题 FAQ

### Q: 为什么Discord收不到消息？
**A:** 检查以下几点：
1. Bot是否已加入Discord服务器
2. 频道ID是否正确
3. Bot是否有发送消息的权限
4. 信号置信度是否达到阈值

### Q: 如何降低API使用成本？
**A:** 
1. 增加扫描间隔 `MONITOR_INTERVAL_MINUTES=30`
2. 降低置信度阈值 `MIN_AI_CONFIDENCE=50`
3. 使用规则AI `AI_PROVIDER=rule-based`

### Q: 支持哪些区块链？
**A:** 当前主要支持 **Solana**，可扩展支持Ethereum、Base、BSC等。

### Q: 为什么按钮点击显示"交互失败"？
**A:** 已修复！请更新到最新版本。按钮现在可以：
- 🔔 追踪此币：添加关注并返回确认消息
- 📊 查看图表：跳转到DexScreener查看详情

---

## 🛡️ 免责声明 Disclaimer

### 🇨🇳 中文
⚠️ **重要提示：**
1. 本项目仅供学习和研究使用，**不构成任何投资建议**
2. 加密货币交易存在极高风险，可能导致本金全部损失
3. AI分析结果仅供参考，不保证盈利
4. 请遵守当地法律法规，自行承担投资风险

### 🇺🇸 English
⚠️ **Important Notice:**
1. This project is for **educational and research purposes only**, not investment advice
2. Cryptocurrency trading carries extreme risk of total capital loss
3. AI analysis results are for reference only, no profit guarantee
4. Please comply with local laws and regulations, invest at your own risk

---

## 🤝 贡献 Contributing

欢迎提交Issue和Pull Request！

Welcome to submit Issues and Pull Requests!

---

## 📄 许可证 License

[MIT](LICENSE)

---

<div align="center">

**Made with ❤️ by Crypto Traders, for Crypto Traders**

**为交易者而生，由交易者打造**

</div>

---

# English Version

<h2 id="english"></h2>

## ✨ Features

- 🔗 **Multi-Platform Data Aggregation** - DexScreener + Birdeye + Helius
- 🤖 **Real AI Analysis** - DeepSeek / MiniMax / Rule-based AI with failover
- 📊 **Smart Signal Merging** - Deduplication across platforms
- 🎯 **Risk Assessment** - Comprehensive risk analysis for each token
- 💡 **Trading Strategy** - Auto position sizing, stop-loss, take-profit
- 📱 **Discord Integration** - Rich embed notifications with actionable buttons

## 🚀 Quick Start

```bash
# Clone & Install
git clone https://github.com/yang1472/crypto-kol-monitor.git
cd crypto-kol-monitor
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Build & Run
npm run build
npm start
```

## 🚂 Deploy on Railway

1. Fork this repository
2. Connect to Railway: https://railway.app
3. Add environment variables in Railway Dashboard
4. Deploy!

See full deployment guide above ↑

---

<div align="center">

**[Back to Top ⬆️](#-crypto-kol-monitor-v21)**

</div>
