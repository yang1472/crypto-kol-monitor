/**
 * AI 路由器
 * 统一管理多个AI提供商，支持故障转移和负载均衡
 */
import { AggregatedSignal, AIAnalysisResult } from '../../types/platform';
import { DeepSeekService } from './deepseekService';
import { MiniMaxService } from './minimaxService';
import { AIAnalyzer } from '../aiAnalyzer'; // 原来的规则AI作为fallback
import logger from '../../utils/logger';

export type AIProvider = 'deepseek' | 'minimax' | 'rule-based' | 'auto';

export interface AIRouterConfig {
  primaryProvider: AIProvider;
  fallbackProvider: AIProvider;
  enableFallback: boolean;
  deepseekApiKey?: string;
  minimaxApiKey?: string;
}

export class AIRouter {
  private deepseek: DeepSeekService | null = null;
  private minimax: MiniMaxService | null = null;
  private ruleBased: AIAnalyzer;
  private config: AIRouterConfig;
  
  // 统计
  private stats: Record<string, { success: number; fail: number }> = {
    deepseek: { success: 0, fail: 0 },
    minimax: { success: 0, fail: 0 },
    'rule-based': { success: 0, fail: 0 },
    ruleBased: { success: 0, fail: 0 }
  };
  
  constructor(config: Partial<AIRouterConfig> = {}) {
    this.config = {
      primaryProvider: 'auto',
      fallbackProvider: 'rule-based',
      enableFallback: true,
      ...config
    };
    
    // 初始化服务
    if (this.config.deepseekApiKey) {
      this.deepseek = new DeepSeekService(this.config.deepseekApiKey);
    }
    if (this.config.minimaxApiKey) {
      this.minimax = new MiniMaxService(this.config.minimaxApiKey);
    }
    
    this.ruleBased = new AIAnalyzer();
    
    this.logStatus();
  }
  
  /**
   * 分析单个信号
   */
  async analyze(signal: AggregatedSignal): Promise<AIAnalysisResult> {
    const provider = this.selectProvider();
    
    try {
      const result = await this.analyzeWithProvider(signal, provider);
      this.stats[provider].success++;
      return result;
    } catch (error) {
      this.stats[provider].fail++;
      logger.warn(`${provider} 分析失败，尝试fallback...`);
      
      if (this.config.enableFallback && this.config.fallbackProvider !== provider) {
        return this.analyzeWithProvider(signal, this.config.fallbackProvider);
      }
      
      throw error;
    }
  }
  
  /**
   * 批量分析
   */
  async analyzeBatch(signals: AggregatedSignal[]): Promise<AIAnalysisResult[]> {
    const results: AIAnalysisResult[] = [];
    
    for (const signal of signals) {
      try {
        const result = await this.analyze(signal);
        results.push(result);
        await this.delay(300);
      } catch (error) {
        logger.error(`分析信号 ${signal.token.symbol} 最终失败:`, error);
        // 返回一个默认结果而不是失败
        results.push(this.createFallbackResult(signal));
      }
    }
    
    return results;
  }
  
  /**
   * 选择AI提供商
   */
  private selectProvider(): Exclude<AIProvider, 'auto'> {
    if (this.config.primaryProvider !== 'auto') {
      return this.config.primaryProvider as Exclude<AIProvider, 'auto'>;
    }
    
    // auto模式：优先使用有API Key的真实AI
    if (this.deepseek) return 'deepseek';
    if (this.minimax) return 'minimax';
    return 'rule-based';
  }
  
  /**
   * 使用指定提供商分析
   */
  private async analyzeWithProvider(
    signal: AggregatedSignal, 
    provider: AIProvider
  ): Promise<AIAnalysisResult> {
    switch (provider) {
      case 'deepseek':
        if (!this.deepseek) throw new Error('DeepSeek未配置');
        return this.deepseek.analyzeSignal(signal);
        
      case 'minimax':
        if (!this.minimax) throw new Error('MiniMax未配置');
        return this.minimax.analyzeSignal(signal);
        
      case 'rule-based':
      default:
        return this.ruleBased.analyze(signal);
    }
  }
  
  /**
   * 创建fallback结果（当所有AI都失败时）
   */
  private createFallbackResult(signal: AggregatedSignal): AIAnalysisResult {
    return {
      signalId: signal.id,
      recommendation: 'watch',
      confidence: 50,
      reasoning: ['AI分析服务暂时不可用，请谨慎决策'],
      entryStrategy: {
        suggestedEntryPrice: signal.token.priceUsd,
        suggestedStopLoss: signal.token.priceUsd * 0.8,
        suggestedTakeProfit: signal.token.priceUsd * 1.3,
        positionSize: 'small',
        maxPositionUsd: 100,
        timeHorizon: 'short'
      },
      riskAnalysis: {
        rugRisk: 50,
        volatilityRisk: 50,
        liquidityRisk: 50,
        overallRisk: 'high',
        warnings: ['AI分析失败，请自行研究']
      },
      keyObservations: ['信号聚合成功，但AI分析失败'],
      analyzedAt: new Date().toISOString(),
      aiModel: 'fallback'
    };
  }
  
  /**
   * 获取状态
   */
  getStatus() {
    return {
      providers: {
        deepseek: !!this.deepseek,
        minimax: !!this.minimax,
        ruleBased: true
      },
      config: this.config,
      stats: this.stats
    };
  }
  
  /**
   * 获取统计
   */
  getStats() {
    return this.stats;
  }
  
  private logStatus() {
    logger.info('========================================');
    logger.info('  AI 路由器初始化完成');
    logger.info('========================================');
    logger.info(`  DeepSeek: ${this.deepseek ? '✅ 已配置' : '❌ 未配置'}`);
    logger.info(`  MiniMax: ${this.minimax ? '✅ 已配置' : '❌ 未配置'}`);
    logger.info(`  规则AI: ✅ 始终可用`);
    logger.info(`  主提供商: ${this.config.primaryProvider}`);
    logger.info(`  Fallback: ${this.config.fallbackProvider}`);
    logger.info('========================================');
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
