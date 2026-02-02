/**
 * 信号聚合服务
 * 整合多个平台的数据，去重并合并相同代币的信号
 */
import { DexScreenerService } from './platforms/dexscreenerService';
import { BirdeyeService } from './platforms/birdeyeService';
import { AggregatedSignal, SignalSource, PlatformType, AggregationConfig } from '../types/platform';
import logger from '../utils/logger';

export class SignalAggregator {
  private dexscreener: DexScreenerService;
  private birdeye: BirdeyeService;
  private config: AggregationConfig;
  
  // 已处理的代币记录（用于去重）
  private processedTokens: Map<string, number> = new Map();
  
  constructor(config?: Partial<AggregationConfig>) {
    this.config = {
      minConfidenceScore: 60,
      signalAggregationWindowMinutes: 30,
      duplicateTokenThreshold: 60, // 60分钟内不重复推送
      platforms: {
        dexscreener: { enabled: true, rateLimitPerMinute: 30, priority: 1 },
        birdeye: { enabled: false, rateLimitPerMinute: 10, priority: 2 }, // 禁用Birdeye，免费额度太少
        helius: { enabled: false, rateLimitPerMinute: 60, priority: 1 },   // 暂时禁用，需要时开启
        solscan: { enabled: false, rateLimitPerMinute: 20, priority: 3 },
        defined: { enabled: false, rateLimitPerMinute: 30, priority: 2 }
      },
      ...config
    };
    
    this.dexscreener = new DexScreenerService();
    this.birdeye = new BirdeyeService();
  }
  
  /**
   * 聚合所有平台的新上市信号
   */
  async aggregateNewListings(chain: string = 'solana'): Promise<AggregatedSignal[]> {
    logger.info('开始聚合新上市信号...');
    
    const allSignals: AggregatedSignal[] = [];
    
    // 从DexScreener获取
    if (this.config.platforms.dexscreener.enabled) {
      try {
        const dexSignals = await this.dexscreener.getNewListings(chain);
        allSignals.push(...dexSignals);
        logger.info(`DexScreener 返回 ${dexSignals.length} 个新币信号`);
      } catch (error) {
        logger.error('DexScreener 获取失败:', error);
      }
    }
    
    // 从Birdeye获取
    if (this.config.platforms.birdeye.enabled) {
      try {
        const birdSignals = await this.birdeye.getNewListings(chain);
        allSignals.push(...birdSignals);
        logger.info(`Birdeye 返回 ${birdSignals.length} 个新币信号`);
      } catch (error) {
        logger.error('Birdeye 获取失败:', error);
      }
    }
    
    // 合并相同代币的信号
    const merged = this.mergeSignals(allSignals);
    
    // 过滤低质量和重复的信号
    const filtered = this.filterSignals(merged);
    
    logger.info(`聚合完成: ${allSignals.length} 个原始信号 -> ${filtered.length} 个有效信号`);
    
    return filtered.sort((a, b) => b.score - a.score);
  }
  
  /**
   * 聚合所有平台的交易量/价格暴涨信号
   */
  async aggregateTrendingSignals(chain: string = 'solana'): Promise<AggregatedSignal[]> {
    logger.info('开始聚合趋势信号...');
    
    const allSignals: AggregatedSignal[] = [];
    
    // 交易量暴涨
    if (this.config.platforms.dexscreener.enabled) {
      try {
        const volumeSignals = await this.dexscreener.getVolumeSpikes(chain);
        allSignals.push(...volumeSignals);
      } catch (error) {
        logger.error('DexScreener volume spike 获取失败:', error);
      }
    }
    
    // 价格暴涨
    if (this.config.platforms.birdeye.enabled) {
      try {
        const priceSignals = await this.birdeye.getPriceMovers(chain, '24h');
        allSignals.push(...priceSignals);
      } catch (error) {
        logger.error('Birdeye price movers 获取失败:', error);
      }
    }
    
    const merged = this.mergeSignals(allSignals);
    const filtered = this.filterSignals(merged);
    
    return filtered.sort((a, b) => b.score - a.score);
  }
  
  /**
   * 合并相同代币的信号
   */
  private mergeSignals(signals: AggregatedSignal[]): AggregatedSignal[] {
    const tokenMap = new Map<string, AggregatedSignal[]>();
    
    // 按代币地址分组
    for (const signal of signals) {
      const key = `${signal.chain}-${signal.tokenAddress}`;
      const existing = tokenMap.get(key);
      if (existing) {
        existing.push(signal);
      } else {
        tokenMap.set(key, [signal]);
      }
    }
    
    // 合并每组信号
    const merged: AggregatedSignal[] = [];
    
    for (const [key, group] of tokenMap) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }
      
      // 多个平台的相同代币，合并数据
      const base = group[0];
      const allSources: SignalSource[] = [];
      let totalScore = 0;
      let maxUrgency: AggregatedSignal['urgency'] = 'low';
      const confirmingPlatforms: PlatformType[] = [];
      
      for (const signal of group) {
        allSources.push(...signal.sources);
        totalScore += signal.score;
        confirmingPlatforms.push(...signal.metrics.confirmingPlatforms);
        
        // 取最高紧急程度
        const urgencyPriority = { critical: 4, high: 3, medium: 2, low: 1 };
        if (urgencyPriority[signal.urgency] > urgencyPriority[maxUrgency]) {
          maxUrgency = signal.urgency;
        }
      }
      
      // 多平台确认加分
      const platformBonus = Math.min((confirmingPlatforms.length - 1) * 10, 20);
      const avgScore = totalScore / group.length;
      const finalScore = Math.min(avgScore + platformBonus, 100);
      
      // 合并风险因素
      const allRiskFactors = [...new Set(group.flatMap(s => s.riskFactors))];
      const highestRisk = group.reduce((max, s) => {
        const riskPriority = { extreme: 4, high: 3, medium: 2, low: 1 };
        return riskPriority[s.riskLevel] > riskPriority[max] ? s.riskLevel : max;
      }, 'low' as AggregatedSignal['riskLevel']);
      
      merged.push({
        ...base,
        id: `merged_${Date.now()}_${key.replace(/[^a-zA-Z0-9]/g, '')}`,
        score: finalScore,
        urgency: maxUrgency,
        sources: allSources,
        metrics: {
          platformCount: confirmingPlatforms.length,
          confirmingPlatforms: [...new Set(confirmingPlatforms)],
          volumeScore: Math.max(...group.map(s => s.metrics.volumeScore)),
          priceScore: Math.max(...group.map(s => s.metrics.priceScore)),
          socialScore: Math.max(...group.map(s => s.metrics.socialScore)),
          whaleScore: Math.max(...group.map(s => s.metrics.whaleScore))
        },
        riskLevel: highestRisk,
        riskFactors: allRiskFactors
      });
    }
    
    return merged;
  }
  
  /**
   * 过滤低质量和重复信号
   */
  private filterSignals(signals: AggregatedSignal[]): AggregatedSignal[] {
    const filtered: AggregatedSignal[] = [];
    const now = Date.now();
    
    for (const signal of signals) {
      // 1. 过滤低置信度
      if (signal.score < this.config.minConfidenceScore) {
        continue;
      }
      
      // 2. 检查是否重复（最近已经推送过）
      const tokenKey = `${signal.chain}-${signal.tokenAddress}`;
      const lastProcessed = this.processedTokens.get(tokenKey);
      
      if (lastProcessed) {
        const minutesSinceLast = (now - lastProcessed) / (1000 * 60);
        if (minutesSinceLast < this.config.duplicateTokenThreshold) {
          logger.debug(`跳过重复代币 ${signal.token.symbol}，${minutesSinceLast.toFixed(1)}分钟前已推送`);
          continue;
        }
      }
      
      // 3. 过滤极高风险（除非分数很高）
      if (signal.riskLevel === 'extreme' && signal.score < 80) {
        logger.debug(`过滤极高风险代币 ${signal.token.symbol}`);
        continue;
      }
      
      // 4. 过滤死币（流动性太低且没交易量）
      if (signal.token.liquidityUsd < 5000 && signal.token.volume24h < 1000) {
        continue;
      }
      
      filtered.push(signal);
      
      // 标记为已处理
      this.processedTokens.set(tokenKey, now);
    }
    
    // 清理旧的已处理记录（保留24小时）
    this.cleanupProcessedTokens(now);
    
    return filtered;
  }
  
  /**
   * 清理旧的已处理记录
   */
  private cleanupProcessedTokens(now: number) {
    const cutoff = now - 24 * 60 * 60 * 1000; // 24小时
    for (const [key, timestamp] of this.processedTokens) {
      if (timestamp < cutoff) {
        this.processedTokens.delete(key);
      }
    }
  }
  
  /**
   * 获取平台状态
   */
  getPlatformStatus(): Array<{
    platform: PlatformType;
    enabled: boolean;
    remainingRequests?: number;
  }> {
    return [
      {
        platform: 'dexscreener',
        enabled: this.config.platforms.dexscreener.enabled,
        remainingRequests: 1000 // DexScreener 无明确限制
      },
      {
        platform: 'birdeye',
        enabled: this.config.platforms.birdeye.enabled,
        remainingRequests: this.birdeye.getRemainingRequests()
      }
    ];
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<AggregationConfig>) {
    this.config = { ...this.config, ...config };
  }
}
