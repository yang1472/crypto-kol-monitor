/**
 * AI 分析服务
 * 
 * 本服务实现基于规则的智能分析，模拟AI分析效果。
 * 如需接入真正的LLM（如OpenAI/Claude），可在此扩展。
 */
import { AggregatedSignal, AIAnalysisResult } from '../types/platform';
import logger from '../utils/logger';

export class AIAnalyzer {
  private readonly model = 'RuleBased-v1.0';
  
  /**
   * 分析聚合信号并生成交易建议
   */
  async analyze(signal: AggregatedSignal): Promise<AIAnalysisResult> {
    logger.info(`AI分析代币 ${signal.token.symbol}...`);
    
    const startTime = Date.now();
    
    // 执行多维分析
    const marketAnalysis = this.analyzeMarketMetrics(signal);
    const riskAnalysis = this.analyzeRisk(signal);
    const entryStrategy = this.calculateEntryStrategy(signal, riskAnalysis);
    const reasoning = this.generateReasoning(signal, marketAnalysis, riskAnalysis);
    const recommendation = this.determineRecommendation(signal, riskAnalysis);
    
    // 计算整体置信度
    const confidence = this.calculateConfidence(signal, marketAnalysis, riskAnalysis);
    
    const result: AIAnalysisResult = {
      signalId: signal.id,
      recommendation,
      confidence,
      reasoning,
      entryStrategy,
      riskAnalysis,
      keyObservations: this.generateObservations(signal),
      analyzedAt: new Date().toISOString(),
      aiModel: this.model
    };
    
    const duration = Date.now() - startTime;
    logger.info(`AI分析完成: ${signal.token.symbol} -> ${recommendation} (${confidence}%)，耗时${duration}ms`);
    
    return result;
  }
  
  /**
   * 批量分析多个信号
   */
  async analyzeBatch(signals: AggregatedSignal[]): Promise<AIAnalysisResult[]> {
    const results: AIAnalysisResult[] = [];
    
    for (const signal of signals) {
      try {
        const result = await this.analyze(signal);
        results.push(result);
        
        // 添加小延迟避免过载
        await this.delay(100);
      } catch (error) {
        logger.error(`分析信号 ${signal.id} 失败:`, error);
      }
    }
    
    return results;
  }
  
  /**
   * 市场指标分析
   */
  private analyzeMarketMetrics(signal: AggregatedSignal) {
    const { token, metrics } = signal;
    
    return {
      volumeHealth: this.calculateVolumeHealth(token.volume24h, token.liquidityUsd),
      priceMomentum: token.priceChange24h,
      liquidityAdequacy: token.liquidityUsd > token.marketCap * 0.1,
      holderDistribution: token.holderCount > 500,
      multiPlatformConfirmed: metrics.platformCount >= 2
    };
  }
  
  /**
   * 风险分析
   */
  private analyzeRisk(signal: AggregatedSignal) {
    const { token, isNewToken, ageHours } = signal;
    
    // Rug Pull风险评估
    let rugRisk = 0;
    
    // 新币Rug风险
    if (ageHours < 1) rugRisk += 40;
    else if (ageHours < 6) rugRisk += 25;
    else if (ageHours < 24) rugRisk += 15;
    
    // 流动性风险
    if (token.liquidityUsd < 10000) rugRisk += 30;
    else if (token.liquidityUsd < 50000) rugRisk += 15;
    
    // 市值风险
    if (token.marketCap < 100000) rugRisk += 20;
    
    // 持有者集中度风险
    if (token.holderCount < 100) rugRisk += 20;
    else if (token.holderCount < 500) rugRisk += 10;
    
    // 波动性评估
    let volatilityRisk = 30; // 基础风险
    if (Math.abs(token.priceChange24h) > 100) volatilityRisk += 30;
    else if (Math.abs(token.priceChange24h) > 50) volatilityRisk += 15;
    
    // 流动性风险评估
    let liquidityRisk = 20;
    if (token.liquidityUsd < token.volume24h * 0.5) {
      liquidityRisk += 30; // 交易量相对于流动性过高
    }
    
    // 综合风险等级
    const overallRiskScore = (rugRisk + volatilityRisk + liquidityRisk) / 3;
    let overallRisk: 'low' | 'medium' | 'high' | 'extreme' = 'low';
    if (overallRiskScore >= 60) overallRisk = 'extreme';
    else if (overallRiskScore >= 40) overallRisk = 'high';
    else if (overallRiskScore >= 25) overallRisk = 'medium';
    
    return {
      rugRisk: Math.min(rugRisk, 100),
      volatilityRisk: Math.min(volatilityRisk, 100),
      liquidityRisk: Math.min(liquidityRisk, 100),
      overallRisk,
      warnings: signal.riskFactors
    };
  }
  
  /**
   * 计算入场策略
   */
  private calculateEntryStrategy(
    signal: AggregatedSignal,
    riskAnalysis: any
  ): AIAnalysisResult['entryStrategy'] {
    const { token, isNewToken } = signal;
    const currentPrice = token.priceUsd;
    
    // 根据风险确定仓位大小
    let positionSize: 'small' | 'medium' | 'large' = 'small';
    let maxPositionUsd = 200;
    
    if (riskAnalysis.overallRisk === 'low' && signal.score >= 80) {
      positionSize = 'large';
      maxPositionUsd = 1000;
    } else if (riskAnalysis.overallRisk === 'medium' && signal.score >= 70) {
      positionSize = 'medium';
      maxPositionUsd = 500;
    }
    
    // 如果是新币，降低仓位
    if (isNewToken) {
      positionSize = 'small';
      maxPositionUsd = Math.min(maxPositionUsd, 300);
    }
    
    // 计算止损（基于波动性）
    const volatility = Math.abs(token.priceChange24h);
    const stopLossPercent = Math.min(Math.max(volatility * 0.5, 10), 30);
    const suggestedStopLoss = currentPrice * (1 - stopLossPercent / 100);
    
    // 计算止盈
    const takeProfitPercent = stopLossPercent * 2; // 2:1 盈亏比
    const suggestedTakeProfit = currentPrice * (1 + takeProfitPercent / 100);
    
    // 建议入场价（滑点考虑）
    const suggestedEntryPrice = currentPrice * 1.02; // 假设2%滑点
    
    // 时间周期
    let timeHorizon: 'scalp' | 'short' | 'medium' | 'long' = 'short';
    if (isNewToken) timeHorizon = 'scalp';
    else if (signal.score >= 85) timeHorizon = 'medium';
    
    return {
      suggestedEntryPrice,
      suggestedStopLoss,
      suggestedTakeProfit,
      positionSize,
      maxPositionUsd,
      timeHorizon
    };
  }
  
  /**
   * 生成分析理由
   */
  private generateReasoning(
    signal: AggregatedSignal,
    marketAnalysis: any,
    riskAnalysis: any
  ): string[] {
    const reasons: string[] = [];
    const { token, metrics, isNewToken } = signal;
    
    // 积极信号
    if (metrics.platformCount >= 2) {
      reasons.push(`✅ 多平台验证(${metrics.platformCount}个平台同时出现)`);
    }
    
    if (token.volume24h > 100000) {
      reasons.push(`✅ 高交易量：24h $${this.formatUsd(token.volume24h)}`);
    }
    
    if (token.priceChange24h > 50) {
      reasons.push(`🚀 强劲涨幅：24h +${token.priceChange24h.toFixed(1)}%`);
    }
    
    if (isNewToken) {
      reasons.push(`🆕 新币机会：上线仅${signal.ageHours.toFixed(1)}小时`);
    }
    
    if (token.liquidityUsd > 100000) {
      reasons.push(`💧 充足流动性：$${this.formatUsd(token.liquidityUsd)}`);
    }
    
    if (token.holderCount > 1000) {
      reasons.push(`👥 持有者分散：${token.holderCount}个地址`);
    }
    
    // 风险信号
    if (riskAnalysis.rugRisk > 50) {
      reasons.push(`⚠️ Rug风险较高(${riskAnalysis.rugRisk}%)，建议小仓位`);
    }
    
    if (token.liquidityUsd < 50000) {
      reasons.push(`⚠️ 流动性较低，注意滑点`);
    }
    
    if (token.priceChange24h > 200) {
      reasons.push(`⚠️ 涨幅过大(${token.priceChange24h.toFixed(0)}%)，可能回调`);
    }
    
    return reasons;
  }
  
  /**
   * 生成关键观察
   */
  private generateObservations(signal: AggregatedSignal): string[] {
    const observations: string[] = [];
    const { token, isNewToken } = signal;
    
    // 市值分析
    if (token.marketCap < 1000000) {
      observations.push('微市值代币，有爆发潜力但风险极高');
    } else if (token.marketCap < 10000000) {
      observations.push('小市值代币，仍有较大上涨空间');
    }
    
    // 量价分析
    const volumeToMcapRatio = token.volume24h / token.marketCap;
    if (volumeToMcapRatio > 1) {
      observations.push('交易量超过市值，热度极高，注意波动');
    } else if (volumeToMcapRatio > 0.5) {
      observations.push('交易活跃，市场关注度高');
    }
    
    // 新币特殊观察
    if (isNewToken) {
      observations.push('新币尚未经过充分验证，建议快进快出');
      
      if (token.holderCount < 200) {
        observations.push('早期筹码高度集中，关注大户动向');
      }
    }
    
    // 平台来源
    const platforms = signal.metrics.confirmingPlatforms.join(', ');
    observations.push(`数据来源：${platforms}`);
    
    return observations;
  }
  
  /**
   * 确定最终建议
   */
  private determineRecommendation(
    signal: AggregatedSignal,
    riskAnalysis: any
  ): AIAnalysisResult['recommendation'] {
    const { score, urgency, isNewToken } = signal;
    
    // 极高风险直接避免
    if (riskAnalysis.overallRisk === 'extreme') {
      return 'avoid';
    }
    
    // 高分+低风险 = 强力买入
    if (score >= 85 && riskAnalysis.overallRisk === 'low') {
      return 'strong_buy';
    }
    
    // 高分+中等风险 = 买入
    if (score >= 75 && riskAnalysis.overallRisk !== 'high') {
      return 'buy';
    }
    
    // 中等分数 = 观望
    if (score >= 60) {
      return 'watch';
    }
    
    // 低分或高风险 = 避免
    return 'avoid';
  }
  
  /**
   * 计算整体置信度
   */
  private calculateConfidence(
    signal: AggregatedSignal,
    marketAnalysis: any,
    riskAnalysis: any
  ): number {
    let confidence = signal.score;
    
    // 多平台确认加分
    if (marketAnalysis.multiPlatformConfirmed) {
      confidence += 5;
    }
    
    // 低风险加分
    if (riskAnalysis.overallRisk === 'low') {
      confidence += 5;
    }
    
    // 高风险减分
    if (riskAnalysis.overallRisk === 'high') {
      confidence -= 15;
    } else if (riskAnalysis.overallRisk === 'extreme') {
      confidence -= 30;
    }
    
    return Math.max(0, Math.min(100, confidence));
  }
  
  /**
   * 计算交易量健康度
   */
  private calculateVolumeHealth(volume24h: number, liquidity: number): number {
    if (liquidity === 0) return 0;
    
    const ratio = volume24h / liquidity;
    if (ratio > 2) return 100; // 非常健康
    if (ratio > 1) return 80;
    if (ratio > 0.5) return 60;
    if (ratio > 0.1) return 40;
    return 20;
  }
  
  /**
   * 格式化美元金额
   */
  private formatUsd(amount: number): string {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(2)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(0)}`;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
