/**
 * DexScreener API 服务
 * 免费API，无需API Key
 * 文档: https://docs.dexscreener.com/
 */
import axios, { AxiosInstance } from 'axios';
import { DexScreenerPair, DexScreenerToken, AggregatedSignal, SignalSource } from '../../types/platform';
import logger from '../../utils/logger';

export class DexScreenerService {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private readonly minRequestInterval = 300; // ms, 避免触发限制
  
  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.dexscreener.com/latest',
      timeout: 10000,
      headers: {
        'Accept': 'application/json'
      }
    });
  }
  
  private async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }
  
  /**
   * 获取代币的最新交易对
   */
  async getTokenPairs(chain: string, tokenAddress: string): Promise<DexScreenerPair[]> {
    await this.rateLimit();
    
    try {
      const response = await this.client.get(`/dex/tokens/${tokenAddress}`);
      const pairs = response.data.pairs || [];
      
      // 过滤指定链的数据
      return pairs.filter((p: any) => p.chainId === chain).map(this.normalizePair);
    } catch (error) {
      logger.error(`DexScreener 获取代币 ${tokenAddress} 失败:`, error);
      return [];
    }
  }
  
  /**
   * 搜索代币
   */
  async searchTokens(query: string): Promise<DexScreenerPair[]> {
    await this.rateLimit();
    
    try {
      const response = await this.client.get(`/dex/search?q=${encodeURIComponent(query)}`);
      return (response.data.pairs || []).slice(0, 10).map(this.normalizePair);
    } catch (error) {
      logger.error(`DexScreener 搜索失败:`, error);
      return [];
    }
  }
  
  /**
   * 获取热门代币（通过筛选高交易量/高增长）
   */
  async getTrendingTokens(chain: string = 'solana'): Promise<DexScreenerPair[]> {
    await this.rateLimit();
    
    try {
      // 获取指定链的热门代币（通过获取多个热门代币的数据来模拟）
      const hotTokens = [
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'So11111111111111111111111111111111111111112',   // SOL
      ];
      
      const allPairs: DexScreenerPair[] = [];
      for (const token of hotTokens.slice(0, 2)) { // 限制请求数量
        const pairs = await this.getTokenPairs(chain, token);
        allPairs.push(...pairs);
        await this.delay(300);
      }
      
      // 按交易量排序并去重
      const uniquePairs = this.deduplicatePairs(allPairs);
      return uniquePairs
        .filter(p => p.volume24h > 10000) // 过滤低交易量
        .sort((a, b) => b.volume24h - a.volume24h)
        .slice(0, 50);
    } catch (error) {
      logger.error('DexScreener 获取热门代币失败:', error);
      return [];
    }
  }
  
  /**
   * 获取新上市代币（24小时内创建）
   */
  async getNewListings(chain: string = 'solana'): Promise<AggregatedSignal[]> {
    logger.info('DexScreener 获取新上市代币...');
    
    try {
      // 获取热门交易对，然后筛选出新币
      const trending = await this.getTrendingTokens(chain);
      const now = Date.now();
      const signals: AggregatedSignal[] = [];
      
      for (const pair of trending) {
        const createdAt = new Date(pair.baseToken.createdAt || Date.now()).getTime();
        const ageHours = (now - createdAt) / (1000 * 60 * 60);
        
        // 筛选24小时内的新币
        if (ageHours <= 24 && pair.volume24h > 5000) {
          const signal = this.convertToSignal(pair, ageHours);
          if (signal) signals.push(signal);
        }
      }
      
      return signals.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('DexScreener 获取新上市代币失败:', error);
      return [];
    }
  }
  
  /**
   * 获取交易量暴涨的代币
   */
  async getVolumeSpikes(chain: string = 'solana', minVolumeUsd: number = 50000): Promise<AggregatedSignal[]> {
    logger.info('DexScreener 获取交易量暴涨代币...');
    
    try {
      const trending = await this.getTrendingTokens(chain);
      const signals: AggregatedSignal[] = [];
      
      for (const pair of trending) {
        // 筛选交易量大于阈值且有足够流动性的
        if (pair.volume24h >= minVolumeUsd && pair.liquidityUsd > 10000) {
          const createdAt = new Date(pair.baseToken.createdAt || Date.now()).getTime();
          const ageHours = (Date.now() - createdAt) / (1000 * 60 * 60);
          
          const signal = this.convertToSignal(pair, ageHours, 'volume_spike');
          if (signal) signals.push(signal);
        }
      }
      
      return signals.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('DexScreener 获取交易量暴涨失败:', error);
      return [];
    }
  }
  
  /**
   * 转换为统一信号格式
   */
  private convertToSignal(
    pair: DexScreenerPair, 
    ageHours: number,
    type: 'new_listing' | 'volume_spike' | 'price_spike' = 'new_listing'
  ): AggregatedSignal | null {
    try {
      const token = pair.baseToken;
      const isNew = ageHours <= 24;
      
      // 计算综合分数
      const priceChange24h = token.priceChange24h || 0;
      
      let score = 50;
      if (pair.volume24h > 100000) score += 20;
      if (pair.volume24h > 500000) score += 15;
      if (pair.liquidityUsd > 50000) score += 10;
      if (isNew) score += 10;
      if (priceChange24h > 50) score += 15;
      
      // 确定紧急程度
      let urgency: AggregatedSignal['urgency'] = 'low';
      if (score >= 90) urgency = 'critical';
      else if (score >= 75) urgency = 'high';
      else if (score >= 60) urgency = 'medium';
      
      // 风险评估
      const risks = this.assessRisk(pair);
      
      const source: SignalSource = {
        platform: 'dexscreener',
        rawData: pair,
        timestamp: new Date().toISOString(),
        confidence: Math.min(score, 100)
      };
      
      return {
        id: `dex_${Date.now()}_${token.address.slice(-6)}`,
        tokenAddress: token.address,
        chain: pair.chainId,
        timestamp: new Date().toISOString(),
        token: {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          priceUsd: pair.priceUsd || 0,
          marketCap: pair.marketCap || 0,
          liquidityUsd: pair.liquidityUsd || 0,
          volume24h: pair.volume24h || 0,
          priceChange24h: token.priceChange24h || 0,
          holderCount: token.holderCount || 0,
          createdAt: token.createdAt
        },
        type,
        score: Math.min(score, 100),
        urgency,
        sources: [source],
        metrics: {
          platformCount: 1,
          confirmingPlatforms: ['dexscreener'],
          volumeScore: Math.min(pair.volume24h / 10000, 100),
          priceScore: priceChange24h > 0 ? Math.min(priceChange24h, 100) : 0,
          socialScore: 0,
          whaleScore: 0
        },
        riskLevel: risks.level,
        riskFactors: risks.factors,
        isNewToken: isNew,
        ageHours
      };
    } catch (error) {
      logger.error('转换DexScreener信号失败:', error);
      return null;
    }
  }
  
  private normalizePair(raw: any): DexScreenerPair {
    return {
      chainId: raw.chainId,
      dexId: raw.dexId,
      url: raw.url,
      pairAddress: raw.pairAddress,
      baseToken: {
        address: raw.baseToken?.address,
        name: raw.baseToken?.name,
        symbol: raw.baseToken?.symbol,
        chainId: raw.chainId,
        priceUsd: parseFloat(raw.priceUsd) || 0,
        marketCap: raw.marketCap || 0,
        liquidityUsd: raw.liquidity?.usd || 0,
        volume24h: raw.volume?.h24 || 0,
        priceChange24h: raw.priceChange?.h24 || 0,
        createdAt: raw.pairCreatedAt || new Date().toISOString(),
        holderCount: raw.holders || 0
      },
      quoteToken: {
        address: raw.quoteToken?.address,
        name: raw.quoteToken?.name,
        symbol: raw.quoteToken?.symbol,
        chainId: raw.chainId,
        priceUsd: 0,
        marketCap: 0,
        liquidityUsd: 0,
        volume24h: 0,
        priceChange24h: 0,
        createdAt: new Date().toISOString()
      },
      priceUsd: parseFloat(raw.priceUsd) || 0,
      marketCap: raw.marketCap || 0,
      liquidityUsd: raw.liquidity?.usd || 0,
      volume24h: raw.volume?.h24 || 0,
      txns24h: {
        buys: raw.txns?.h24?.buys || 0,
        sells: raw.txns?.h24?.sells || 0
      }
    };
  }
  
  private deduplicatePairs(pairs: DexScreenerPair[]): DexScreenerPair[] {
    const seen = new Set<string>();
    return pairs.filter(p => {
      const key = `${p.chainId}-${p.baseToken.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  private assessRisk(pair: DexScreenerPair): { level: 'low' | 'medium' | 'high' | 'extreme'; factors: string[] } {
    const factors: string[] = [];
    let riskScore = 0;
    
    // 低流动性风险
    if (pair.liquidityUsd < 10000) {
      riskScore += 30;
      factors.push('流动性过低(<$10k)，滑点大');
    } else if (pair.liquidityUsd < 50000) {
      riskScore += 15;
      factors.push('流动性较低');
    }
    
    // 买盘卖盘比例
    if (pair.txns24h.sells > pair.txns24h.buys * 2) {
      riskScore += 25;
      factors.push('卖盘远多于买盘，抛压大');
    }
    
    // 市值太小
    if (pair.marketCap < 100000) {
      riskScore += 20;
      factors.push('市值太小(<$100k)，波动极大');
    }
    
    // 新币风险
    const createdAt = new Date(pair.baseToken.createdAt).getTime();
    const ageHours = (Date.now() - createdAt) / (1000 * 60 * 60);
    if (ageHours < 1) {
      riskScore += 20;
      factors.push('刚上线不到1小时，Rug风险高');
    }
    
    let level: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    if (riskScore >= 60) level = 'extreme';
    else if (riskScore >= 40) level = 'high';
    else if (riskScore >= 20) level = 'medium';
    
    return { level, factors };
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
