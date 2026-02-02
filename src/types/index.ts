// ============ 数据类型定义 ============

/** KOL/聪明钱的类型 */
export type KolType = 'kol' | 'smart_money' | 'whale' | 'insider';

/** 区块链类型 */
export type ChainType = 'solana' | 'ethereum' | 'bsc' | 'base' | 'arbitrum';

/** KOL信息 */
export interface Kol {
  id: string;                    // 唯一ID
  name: string;                  // 名称/昵称
  type: KolType;                 // 类型
  description?: string;          // 描述
  tags: string[];                // 标签
  createdAt: string;             // 创建时间
  updatedAt: string;             // 更新时间
  
  // 钱包地址列表
  wallets: Wallet[];
  
  // 社交账号
  socials: SocialAccount[];
  
  // 监控配置
  monitorConfig: MonitorConfig;
}

/** 钱包地址 */
export interface Wallet {
  id: string;
  address: string;               // 钱包地址
  chain: ChainType;              // 所属链
  label?: string;                // 标签（如：主钱包、小钱包）
  isActive: boolean;             // 是否激活监控
  addedAt: string;
}

/** 社交账号 */
export interface SocialAccount {
  id: string;
  platform: 'twitter' | 'telegram' | 'discord' | 'youtube';
  username: string;              // 用户名
  url?: string;                  // 主页链接
  isActive: boolean;
  addedAt: string;
}

/** 监控配置 */
export interface MonitorConfig {
  monitorWallets: boolean;       // 是否监控钱包
  monitorSocials: boolean;       // 是否监控社交账号
  minValueUsd?: number;          // 最小交易金额（USD）
  keywords?: string[];           // 监控关键词（推荐相关）
}

/** 代币信息 */
export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd?: number;
  chain: ChainType;
}

/** 交易记录 */
export interface Transaction {
  id: string;
  txHash: string;
  chain: ChainType;
  timestamp: string;
  
  // 关联的KOL
  kolId: string;
  walletId: string;
  
  // 交易详情
  type: 'buy' | 'sell' | 'transfer';
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: string;
  amountOut: string;
  valueUsd?: number;
  
  // 分析结果
  isNewToken: boolean;           // 是否是新币
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  confidence: number;            // 置信度 0-100
  analysis: string;              // 分析说明
}

/** 社交动态 */
export interface SocialPost {
  id: string;
  platform: string;
  kolId: string;
  
  // 帖子内容
  content: string;
  url?: string;
  postedAt: string;
  
  // 提取的代币信息
  mentionedTokens?: string[];    // 提到的代币地址
  extractedSymbols?: string[];   // 提取的代币符号
  
  // 分析结果
  sentiment: 'bullish' | 'bearish' | 'neutral';
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  confidence: number;
  analysis: string;
}

/** 购买建议 */
export interface BuyRecommendation {
  id: string;
  createdAt: string;
  
  // 来源
  kolId: string;
  kolName: string;
  source: 'wallet' | 'social' | 'both';
  
  // 代币信息
  token: TokenInfo;
  
  // 建议详情
  action: 'buy' | 'watch' | 'avoid';
  urgency: 'high' | 'medium' | 'low';
  confidence: number;
  
  // 分析依据
  reasons: string[];
  transactions?: Transaction[];
  socialPosts?: SocialPost[];
  
  // 建议参数
  suggestedEntry?: number;
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
  maxPositionUsd?: number;
  
  // 状态
  status: 'pending' | 'sent' | 'executed' | 'expired';
}

/** 用户配置 */
export interface UserConfig {
  discordWebhookUrl?: string;
  discordBotToken?: string;
  discordChannelId?: string;
  
  // API配置
  heliusApiKey?: string;
  birdeyeApiKey?: string;
  twitterBearerToken?: string;
  
  // 监控配置
  monitorIntervalMinutes: number;
  minConfidenceThreshold: number;
}
