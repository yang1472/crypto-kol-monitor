/**
 * 第三方平台数据类型定义
 */

/** 平台类型 */
export type PlatformType = 'dexscreener' | 'birdeye' | 'helius' | 'solscan' | 'defined';

/** 平台配置 */
export interface PlatformConfig {
  enabled: boolean;
  apiKey?: string;
  rateLimitPerMinute: number;
  priority: number;  // 优先级，数字越小优先级越高
}

/** 聚合配置 */
export interface AggregationConfig {
  platforms: Record<PlatformType, PlatformConfig>;
  minConfidenceScore: number;
  signalAggregationWindowMinutes: number;
  duplicateTokenThreshold: number; // 重复代币的阈值（多少分钟内不算新信号）
}

// ============ DexScreener 类型 ============

export interface DexScreenerToken {
  address: string;
  name: string;
  symbol: string;
  chainId: string;
  priceUsd: number;
  marketCap: number;
  liquidityUsd: number;
  volume24h: number;
  priceChange24h: number;
  createdAt: string;
  holderCount?: number;
  topHolders?: Array<{
    address: string;
    percentage: number;
  }>;
}

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: DexScreenerToken;
  quoteToken: DexScreenerToken;
  priceUsd: number;
  marketCap: number;
  liquidityUsd: number;
  volume24h: number;
  txns24h: {
    buys: number;
    sells: number;
  };
}

// ============ Birdeye 类型 ============

export interface BirdeyeToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  holderCount: number;
  isVerified: boolean;
  createdAt: string;
}

export interface BirdeyeWalletTrade {
  txHash: string;
  timestamp: number;
  owner: string;
  from: {
    address: string;
    symbol: string;
    amount: number;
    priceUsd: number;
  };
  to: {
    address: string;
    symbol: string;
    amount: number;
    priceUsd: number;
  };
  valueUsd: number;
  type: 'buy' | 'sell';
}

// ============ 聚合信号类型 ============

/** 信号来源 */
export interface SignalSource {
  platform: PlatformType;
  rawData: any;
  timestamp: string;
  confidence: number;
}

/** 聚合的市场信号 */
export interface AggregatedSignal {
  id: string;
  tokenAddress: string;
  chain: string;
  timestamp: string;
  
  // 基础信息（多平台聚合）
  token: {
    address: string;
    symbol: string;
    name: string;
    priceUsd: number;
    marketCap: number;
    liquidityUsd: number;
    volume24h: number;
    priceChange24h: number;
    holderCount: number;
    createdAt: string;
  };
  
  // 信号类型
  type: 'new_listing' | 'volume_spike' | 'price_spike' | 'whale_buy' | 'trending' | 'smart_money';
  
  // 综合评分
  score: number;           // 0-100
  urgency: 'critical' | 'high' | 'medium' | 'low';
  
  // 来源
  sources: SignalSource[];
  
  // 关键指标
  metrics: {
    platformCount: number;
    confirmingPlatforms: PlatformType[];
    volumeScore: number;
    priceScore: number;
    socialScore: number;
    whaleScore: number;
  };
  
  // 风险提示
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  riskFactors: string[];
  
  // 是否新币
  isNewToken: boolean;
  ageHours: number;
}

// ============ AI分析结果 ============

export interface AIAnalysisResult {
  signalId: string;
  recommendation: 'strong_buy' | 'buy' | 'watch' | 'avoid';
  confidence: number;
  reasoning: string[];
  
  // 入场建议
  entryStrategy: {
    suggestedEntryPrice: number;
    suggestedStopLoss: number;
    suggestedTakeProfit: number;
    positionSize: 'small' | 'medium' | 'large';
    maxPositionUsd: number;
    timeHorizon: 'scalp' | 'short' | 'medium' | 'long';
  };
  
  // 风险分析
  riskAnalysis: {
    rugRisk: number;       // 0-100
    volatilityRisk: number;
    liquidityRisk: number;
    overallRisk: 'low' | 'medium' | 'high' | 'extreme';
    warnings: string[];
  };
  
  // 对比分析
  similarTokens?: Array<{
    address: string;
    symbol: string;
    similarity: number;
    outcome: 'success' | 'failure' | 'unknown';
  }>;
  
  // 关键观察
  keyObservations: string[];
  
  // 时间戳
  analyzedAt: string;
  aiModel: string;
}

// ============ 趋势数据 ============

export interface MarketTrend {
  timestamp: string;
  category: 'meme' | 'ai' | 'defi' | 'gaming' | 'other';
  topGainers: Array<{
    address: string;
    symbol: string;
    gain24h: number;
    volumeUsd: number;
  }>;
  topVolume: Array<{
    address: string;
    symbol: string;
    volume24h: number;
    volumeChange: number;
  }>;
  trendingKeywords: string[];
}
