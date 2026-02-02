# 🚀 Crypto KOL Monitor v2.1

**多平台数据聚合 + 真实AI分析** 的币圈信号监控系统。

## ✨ 核心特性

- 🔗 **多平台聚合** - DexScreener + Birdeye + Helius 多数据源
- 🤖 **真实AI分析** - 支持 DeepSeek / MiniMax / 规则AI
- 🧠 **智能路由** - AI故障自动切换，保证服务稳定
- 📊 **深度分析** - 风险评估、入场策略、仓位建议
- 🎯 **精准推送** - 只推送高置信度的交易机会

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      数据层 (Data Sources)                    │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ DexScreener  │   Birdeye    │    Helius    │   Solscan      │
│  (免费API)   │  (100次/天)  │(100万次/月)  │   (可选)       │
└──────┬───────┴──────┬───────┴──────┬───────┴───────┬────────┘
       │              │              │               │
       └──────────────┴──────┬───────┴───────────────┘
                             ▼
                  ┌─────────────────────┐
                  │     信号聚合器       │
                  │  • 多平台数据合并    │
                  │  • 智能去重         │
                  │  • 综合评分         │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │     AI 路由器        │
                  │  • DeepSeek (主)    │
                  │  • MiniMax (备)     │
                  │  • 规则AI (兜底)    │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │     Discord通知      │
                  │  • 富文本Embed      │
                  │  • 一键查看图表      │
                  │  • 实时推送         │
                  └─────────────────────┘
```

## 📦 快速开始

### 1. 安装依赖

```bash
cd crypto-kol-monitor
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入你的API密钥
```

**必需配置：**
```env
# Discord (必需)
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_discord_channel_id

# AI提供商 (至少一个)
DEEPSEEK_API_KEY=your_deepseek_key      # 推荐
MINIMAX_API_KEY=your_minimax_key        # 备用

# 可选数据源
HELIUS_API_KEY=your_helius_key          # Solana数据
BIRDEYE_API_KEY=your_birdeye_key        # 提高限额
```

### 3. 本地测试

```bash
npm run dev
```

## 🤖 AI 配置说明

### 支持的AI提供商

| 提供商 | 特点 | 免费额度 | 获取地址 |
|--------|------|---------|---------|
| **DeepSeek** | 国产大模型，性价比高 | 500万 tokens | https://platform.deepseek.com |
| **MiniMax** | 中文优化好 | 100万 tokens | https://www.minimaxi.com |
| **规则AI** | 本地计算，零成本 | 无限制 | 内置 |

### AI_PROVIDER 配置

```env
# 自动选择 (推荐)
AI_PROVIDER=auto

# 强制指定
AI_PROVIDER=deepseek    # 只用DeepSeek
AI_PROVIDER=minimax     # 只用MiniMax
AI_PROVIDER=rule-based  # 只用规则AI
```

### 故障转移机制

```
┌──────────────────────────────────────┐
│  AI_PROVIDER=auto 选择逻辑            │
├──────────────────────────────────────┤
│  1. 检查 DeepSeek API Key            │
│     ↓ 有 → 使用 DeepSeek             │
│     ↓ 无                               │
│  2. 检查 MiniMax API Key             │
│     ↓ 有 → 使用 MiniMax              │
│     ↓ 无                               │
│  3. 使用规则AI (本地计算)             │
└──────────────────────────────────────┘
```

**故障转移：**
- DeepSeek 失败 → 自动使用 MiniMax
- MiniMax 失败 → 自动使用规则AI
- 确保分析永不中断

## 📊 Discord通知示例

```
🟢🔥 AI推荐: GIGA (DeepSeek分析)
✅ 多平台验证(DexScreener+Birdeye)
✅ 高交易量：24h $2.5M
🚀 强劲涨幅：24h +150%

📊 代币信息
名称: GIGACHAD
价格: $0.000052
市值: $52M
流动性: $2.1M

📈 24h数据
涨幅: +150%
交易量: $2.5M
持有者: 15,420

🤖 AI分析 (置信度: 87%)
建议: 强力买入 🔥
风险等级: 中 🟡

💡 入场策略
建议仓位: 中等仓位 ($500)
目标周期: 短线 (1-3天)
止损: $0.000042 (-20%)
止盈: $0.000078 (+50%)

👁️ 关键观察
• 上线12小时，早期机会
• 多平台数据验证
• 交易活跃度极高

⚠️ 风险提示
• 新币风险，注意Rug Pull
• 建议小仓位试探

[🔔 追踪此币] [📊 查看图表]
```

## ⚙️ 配置参数

| 变量 | 默认 | 说明 |
|------|------|------|
| `AI_PROVIDER` | auto | AI提供商选择 |
| `MONITOR_INTERVAL_MINUTES` | 5 | 扫描间隔（分钟）|
| `MIN_CONFIDENCE_SCORE` | 60 | 最小信号分数 |
| `MIN_AI_CONFIDENCE` | 65 | AI最小置信度 |
| `MAX_SIGNALS_PER_BATCH` | 10 | 每批最大分析数 |

## 🚂 Railway部署

### 1. 安装CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. 部署

```bash
cd crypto-kol-monitor
railway init

# 设置环境变量
railway variables set DISCORD_BOT_TOKEN=xxx
railway variables set DISCORD_CHANNEL_ID=xxx
railway variables set DEEPSEEK_API_KEY=xxx
railway variables set MINIMAX_API_KEY=xxx

# 部署
railway up
```

### 3. 持续部署

连接GitHub仓库后，每次push自动部署。

## 🛡️ 安全提醒

⚠️ **重要：你的API密钥已配置，请勿泄露！**

- `.env` 文件已添加到 `.gitignore`，不会提交到Git
- 不要在Discord/聊天中分享包含密钥的截图
- Railway的环境变量是加密存储的

## 📈 使用建议

### 1. 小额测试
- 先用小资金测试AI策略的有效性
- 观察1-2周后再加大仓位

### 2. 多平台验证
- 系统已自动聚合多平台数据
- 优先关注多平台同时出现的信号

### 3. 风险控制
- 严格遵守AI建议的止损
- 新币(<24h)建议只用极小仓位

## 🔧 故障排查

### AI不工作
```bash
# 检查AI状态
curl https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY"
```

### Discord不推送
1. 检查Bot是否已加入服务器
2. 检查频道ID是否正确
3. 检查Bot权限（发送消息、嵌入链接）

### 没有信号
- 降低 `MIN_CONFIDENCE_SCORE` 到 50
- 缩短 `MONITOR_INTERVAL_MINUTES` 到 3
- 检查平台API是否正常工作

## 📄 License

MIT

---

**⚠️ 免责声明：** 本项目仅供学习和研究使用，不构成投资建议。加密货币交易存在高风险，请自行承担投资风险。
