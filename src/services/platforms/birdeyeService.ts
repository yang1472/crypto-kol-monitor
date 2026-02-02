/**
 * Birdeye API 服务
 * 提供Solana生态代币数据和聪明钱追踪
 * 免费额度：100次/天（公共API）
 * 文档: https://docs.birdeye.so/
 */
import axios, { AxiosInstance } from 'axios';
import { AggregatedSignal, SignalSource, BirdeyeToken } from '../../types/platform';
import logger from '../../utils/logger';

export class BirdeyeService {
  private client: AxiosInstance;
  private apiKey?: string;
  private requestCount: number = 0;
  private readonly dailyLimit = 100;
  private lastReset: Date = new Date();
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['X-API-KEY'] = apiKey;
    }
    
    this.client = axios.create({
      baseURL: 'https://public-api.birdeye.so',
      timeout: 15000,
      headers
    });
  }
  
  private checkRateLimit(): boolean {
    const now = new Date();
    // 每天重置计数
    if (now.getDate() !== this.lastReset.getDate()) {
      this.requestCount = 0;
      this.lastReset = now;
    }
    
    if (this.requestCount >= this.dailyLimit) {
      logger.warn(`Birdeye API 日限额(${this.dailyLimit})已用完`);
      return false;
    }
    
    this.requestCount++;
    return true;
  }
  
  /**
   * 获取热门代币（按交易量排序）
   */
  async getTrendingTokens(
    chain: string = 'solana',
    limit: number = 20,
    offset: number = 0
  ): Promise<BirdeyeToken[]> {
    if (!this.checkRateLimit()) return [];
    
    try {
      const response = await this.client.get('/defi/v3/token/markets', {
        params: {
          sort_by: 'v24hUSD',  // 按24h交易量排序
          sort_type: 'desc',
          offset,
          limit,
          chain
        }
      });
      
      const tokens = response.data?.data || [];
      return tokens.map(this.normalizeToken);
    } catch (error) {
      logger.error('Birdeye 获取热门代币失败:', error);
      return [];
    }
  }
  
  /**
   * 获取新上市代币
   */
  async getNewListings(chain: string = 'solana'): Promise<AggregatedSignal[]> {
    if (!this.checkRateLimit()) return [];
    
    logger.info('Birdeye 获取新上市代币...');
    
    try {
      // 获取最近创建的代币（按创建时间排序）
      const response = await this.client.get('/defi/v2/tokens/new_listing', {
        params: {
          limit: 20,
          chain
        }
      });
      
      const tokens = response.data?.data || [];
      const signals: AggregatedSignal[] = [];
      
      for (const token of tokens) {
        const signal = await this.convertToSignal(token, 'new_listing');
        if (signal) signals.push(signal);
      }
      
      return signals.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error('Birdeye 获取新上市代币失败:', error);
      return [];
    }
  }
  
  /**
   * 获取价格暴涨的代币
   */
  async getPriceMovers(
    chain: string = 'solana',
    timeframe: '1h' | '24h' = '24h'
  ): Promise<AggregatedSignal[]> {
    if (!this.checkRateLimit()) return [];
    
    try {
      const response = await this.client.get('/defi/v3/token/markets', {
        params: {
          sort_by: timeframe === '1h' ? 'priceChange1hPercent' : 'priceChange24hPercent',
          sort_type: 'desc',
          offset: 0,
          limit: 30,
          chain,
          min_liquidity: 10000  // 最小流动性$10k
        }
      });
      
      const tokens = response.data?.data || [];
      const signals: AggregatedSignal[] = [];
      
      for (const token of tokens) {
        // 只筛选涨幅大的
        const priceChange = timeframe === '1h' 
          ? token.priceChange1hPercent 
          : token.priceChange24hPercent;
        
        if (priceChange > 20) { // 涨幅超过20%
          const signal = await this.convertToSignal(token, 'price_spike');
          if (signal) signals.push(signal);
        }
      }
      
      return signals;
    } catch (error) {
      logger.error('Birdeye 获取价格暴涨代币失败:', error);
      return [];
    }
  }
  
  /**
   * 获取特定代币的详细信息
   */
  async getTokenInfo(address: string, chain: string = 'solana'): Promise<BirdeyeToken | null> {
    if (!this.checkRateLimit()) return null;
    
    try {
      const response = await this.client.get('/defi/v3/token/meta-data/single', {
        params: { address, chain }
      });
      
      const data = response.data?.data;
      if (!data) return null;
      
      return this.normalizeToken(data);
    } catch (error) {
      logger.error(`Birdeye 获取代币 ${address} 信息失败:`, error);
      return null;
    }
  }
  
  /**
   * 获取钱包的交易历史（聪明钱追踪）
   */
  async getWalletTransactions(
    walletAddress: string,
    chain: string = 'solana',
    limit: number = 50
  ): Promise<any[]> {
    if (!this.checkRateLimit()) return [];
    
    try {
      const response = await this.client.get('/v1/wallet/tx_list', {
        params: {
          wallet: walletAddress,
          limit,
          chain
        }
      });
      
      return response.data?.data || [];
    } catch (error) {
      logger.error(`Birdeye 获取钱包 ${walletAddress} 交易失败:`, error);
      return [];
    }
  }
  
  /**
   * 搜索代币
   */
  async searchTokens(query: string, chain: string = 'solana'): Promise<BirdeyeToken[]> {
    if (!this.checkRateLimit()) return [];
    
    try {
      const response = await this.client.get('/defi/v1/search', {
        params: {
          keyword: query,
          chain,
          limit: 10
        }
      });
      
      const items = response.data?.data?.items || [];
      return items.map(this.normalizeToken);
    } catch (error) {
      logger.error('Birdeye 搜索失败:', error);
      return [];
    }
  }
  
  /**
   * 转换为统一信号格式
   */
  private async convertToSignal(
    token: any,
    type: 'new_listing' | 'volume_spike' | 'price_spike' | 'whale_buy'
  ): Promise<AggregatedSignal | null> {
    try {
      const normalized = this.normalizeToken(token);
      const now = Date.now();
      const createdAt = new Date(normalized.createdAt).getTime();
      const ageHours = (now - createdAt) / (1000 * 60 * 60);
      const isNew = ageHours <= 24;
      
      // 计算分数
      let score = 50;
      
      // 交易量评分
      if (normalized.volume24h > 100000) score += 15;
      if (normalized.volume24h > 500000) score += 10;
      
      // 流动性评分
      if (normalized.liquidity > 50000) score += 10;
      
      // 价格变化评分
      if (normalized.priceChange24h > 50) score += 15;
      if (normalized.priceChange24h > 100) score += 10;
      
      // 新币加分
      if (isNew) score += 10;
      
      // 持有者数量
      if (normalized.holderCount > 1000) score += 5;
      
      score = Math.min(score, 100);
      
      // 确定紧急程度
      let urgency: AggregatedSignal['urgency'] = 'low';
      if (score >= 90 || (isNew && normalized.volume24h > 100000)) urgency = 'critical';
      else if (score >= 75) urgency = 'high';
      else if (score >= 60) urgency = 'medium';
      
      // 风险评估
      const risks = this.assessRisk(normalized, ageHours);
      
      const source: SignalSource = {
        platform: 'birdeye',
        rawData: token,
        timestamp: new Date().toISOString(),
        confidence: score
      };
      
      return {
        id: `bird_${Date.now()}_${normalized.address.slice(-6)}`,
        tokenAddress: normalized.address,
        chain: 'solana',
        timestamp: new Date().toISOString(),
        token: {
          address: normalized.address,
          symbol: normalized.symbol,
          name: normalized.name,
          priceUsd: normalized.priceUsd,
          marketCap: normalized.marketCap,
          liquidityUsd: normalized.liquidity,
          volume24h: normalized.volume24h,
          priceChange24h: normalized.priceChange24h,
          holderCount: normalized.holderCount,
          createdAt: normalized.createdAt
        },
        type,
        score,
        urgency,
        sources: [source],
        metrics: {
          platformCount: 1,
          confirmingPlatforms: ['birdeye'],
          volumeScore: Math.min(normalized.volume24h / 10000, 100),
          priceScore: normalized.priceChange24h > 0 ? Math.min(normalized.priceChange24h, 100) : 0,
          socialScore: 0,
          whaleScore: 0
        },
        riskLevel: risks.level,
        riskFactors: risks.factors,
        isNewToken: isNew,
        ageHours
      };
    } catch (error) {
      logger.error('Birdeye 转换信号失败:', error);
      return null;
    }
  }
  
  private normalizeToken(raw: any): BirdeyeToken {
    return {
      address: raw.address || raw.tokenAddress,
      symbol: raw.symbol || 'UNKNOWN',
      name: raw.name || 'Unknown Token',
      decimals: raw.decimals || 9,
      priceUsd: raw.priceUsd || raw.price || 0,
      priceChange24h: raw.priceChange24hPercent || raw.priceChange24h || 0,
      volume24h: raw.v24hUSD || raw.volume24h || 0,
      marketCap: raw.marketcap || raw.marketCap || 0,
      liquidity: raw.liquidity || raw.liquidityUsd || 0,
      holderCount: raw.holderCount || raw.uniqueWallet24h || 0,
      isVerified: raw.verified || false,
      createdAt: raw.createdAt || new Date().toISOString()
    };
  }
  
  private assessRisk(token: BirdeyeToken, ageHours: number): { 
    level: 'low' | 'medium' | 'high' | 'extreme'; 
    factors: string[] 
  } {
    const factors: string[] = [];
    let riskScore = 0;
    
    // 新币风险
    if (ageHours < 1) {
      riskScore += 30;
      factors.push('刚上线不到1小时，极高Rug风险');
    } else if (ageHours < 6) {
      riskScore += 20;
      factors.push('上线不到6小时，新币风险高');
    } else if (ageHours < 24) {
      riskScore += 10;
      factors.push('上线不到24小时');
    }
    
    // 流动性风险
    if (token.liquidity < 10000) {
      riskScore += 25;
      factors.push('流动性过低(<$10k)');
    } else if (token.liquidity < 50000) {
      riskScore += 15;
      factors.push('流动性较低(<$50k)');
    }
    
    // 市值风险
    if (token.marketCap < 100000) {
      riskScore += 20;
      factors.push('市值太小(<$100k)');
    }
    
    // 持有者风险
    if (token.holderCount < 100) {
      riskScore += 15;
      factors.push('持有者过少(<100)，筹码集中');
    }
    
    // 未验证风险
    if (!token.isVerified) {
      riskScore += 10;
      factors.push('代币未验证');
    }
    
    let level: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    if (riskScore >= 70) level = 'extreme';
    else if (riskScore >= 45) level = 'high';
    else if (riskScore >= 25) level = 'medium';
    
    return { level, factors };
  }
  
  getRemainingRequests(): number {
    return this.dailyLimit - this.requestCount;
  }
}
