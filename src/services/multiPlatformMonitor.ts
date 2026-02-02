/**
 * 多平台聚合监控服务
 * 
 * 数据流：
 * 平台API (DexScreener/Birdeye/Helius) → 
 * 信号聚合器 (SignalAggregator) → 
 * AI分析器 (AIAnalyzer) → 
 * Discord通知
 */
import * as cron from 'node-cron';
import { SignalAggregator } from './signalAggregator';
import { AIRouter, AIProvider } from './ai/aiRouter';
import { DiscordBotService } from './discordBot';
import { AggregatedSignal, AIAnalysisResult } from '../types/platform';
import { getConfig } from './dataStore';
import logger from '../utils/logger';

interface MonitorConfig {
  scanIntervalMinutes: number;
  minConfidenceScore: number;
  minAiConfidence: number;
  maxSignalsPerBatch: number;
  chains: string[];
  aiProvider: AIProvider;
  deepseekApiKey?: string;
  minimaxApiKey?: string;
}

export class MultiPlatformMonitor {
  private aggregator: SignalAggregator;
  private aiRouter: AIRouter;
  private discordBot: DiscordBotService | null = null;
  private config: MonitorConfig;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  
  // 统计
  private stats = {
    totalSignals: 0,
    totalAnalyzed: 0,
    totalSent: 0,
    lastRun: null as Date | null
  };
  
  constructor(config?: Partial<MonitorConfig>) {
    this.config = {
      scanIntervalMinutes: 5,
      minConfidenceScore: 60,
      minAiConfidence: 65,
      maxSignalsPerBatch: 10,
      chains: ['solana'],
      aiProvider: 'auto',
      ...config
    };
    
    this.aggregator = new SignalAggregator({
      minConfidenceScore: this.config.minConfidenceScore
    });
    
    this.aiRouter = new AIRouter({
      primaryProvider: this.config.aiProvider,
      fallbackProvider: 'rule-based',
      enableFallback: true,
      deepseekApiKey: this.config.deepseekApiKey,
      minimaxApiKey: this.config.minimaxApiKey
    });
  }
  
  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    logger.info('========================================');
    logger.info('  多平台聚合监控服务初始化...');
    logger.info('========================================');
    
    const config = getConfig();
    
    // 初始化Discord机器人
    if (config.discordBotToken && config.discordChannelId) {
      this.discordBot = new DiscordBotService(
        config.discordBotToken,
        config.discordChannelId
      );
      await this.discordBot.start();
      logger.info('✅ Discord 机器人已启动');
    } else {
      logger.warn('⚠️ Discord 未配置，将只输出到日志');
    }
    
    // 显示平台状态
    const platformStatus = this.aggregator.getPlatformStatus();
    logger.info('\n📊 数据源状态:');
    for (const status of platformStatus) {
      const icon = status.enabled ? '✅' : '❌';
      logger.info(`  ${icon} ${status.platform} (剩余: ${status.remainingRequests})`);
    }
    
    // 显示AI状态
    const aiStatus = this.aiRouter.getStatus();
    logger.info('\n🤖 AI提供商状态:');
    logger.info(`  DeepSeek: ${aiStatus.providers.deepseek ? '✅' : '❌'}`);
    logger.info(`  MiniMax: ${aiStatus.providers.minimax ? '✅' : '❌'}`);
    logger.info(`  规则AI: ✅`);
    logger.info(`  主提供商: ${aiStatus.config.primaryProvider}`);
    
    logger.info('\n⚙️ 配置:');
    logger.info(`  扫描间隔: ${this.config.scanIntervalMinutes} 分钟`);
    logger.info(`  最小信号分数: ${this.config.minConfidenceScore}`);
    logger.info(`  AI最小置信度: ${this.config.minAiConfidence}`);
    logger.info('========================================');
  }
  
  /**
   * 开始监控
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('监控服务已在运行');
      return;
    }
    
    logger.info(`🚀 启动多平台监控，每 ${this.config.scanIntervalMinutes} 分钟扫描一次`);
    
    // 立即执行一次
    this.runScan();
    
    // 设置定时任务
    this.cronJob = cron.schedule(`*/${this.config.scanIntervalMinutes} * * * *`, () => {
      this.runScan();
    });
    
    this.isRunning = true;
  }
  
  /**
   * 停止监控
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    logger.info('🛑 监控服务已停止');
  }
  
  /**
   * 执行一次扫描周期
   */
  private async runScan(): Promise<void> {
    const startTime = Date.now();
    logger.info('\n🔍 ========== 开始扫描周期 ==========');
    this.stats.lastRun = new Date();
    
    try {
      // 1. 聚合新上市信号
      const newListings = await this.aggregator.aggregateNewListings('solana');
      logger.info(`发现 ${newListings.length} 个新币信号`);
      
      // 2. 聚合趋势信号
      const trendingSignals = await this.aggregator.aggregateTrendingSignals('solana');
      logger.info(`发现 ${trendingSignals.length} 个趋势信号`);
      
      // 3. 合并所有信号
      const allSignals = [...newListings, ...trendingSignals];
      
      // 4. 去重（按代币地址）
      const uniqueSignals = this.deduplicateByToken(allSignals);
      
      // 5. 限制批次大小
      const batch = uniqueSignals.slice(0, this.config.maxSignalsPerBatch);
      
      this.stats.totalSignals += batch.length;
      
      if (batch.length === 0) {
        logger.info('本次扫描无有效信号');
        return;
      }
      
      // 6. AI分析
      logger.info(`\n🤖 开始AI分析 ${batch.length} 个信号...`);
      const analyses = await this.aiRouter.analyzeBatch(batch);
      this.stats.totalAnalyzed += analyses.length;
      
      // 7. 发送通知
      let sentCount = 0;
      for (let i = 0; i < batch.length; i++) {
        const signal = batch[i];
        const analysis = analyses[i];
        
        if (this.shouldNotify(signal, analysis)) {
          await this.sendNotification(signal, analysis);
          sentCount++;
          
          // 添加延迟避免Discord限流
          await this.delay(500);
        }
      }
      
      this.stats.totalSent += sentCount;
      
      // 8. 输出统计
      const duration = Date.now() - startTime;
      logger.info('\n📈 ========== 扫描完成 ==========');
      logger.info(`  扫描信号: ${batch.length} 个`);
      logger.info(`  AI分析: ${analyses.length} 个`);
      logger.info(`  发送通知: ${sentCount} 个`);
      logger.info(`  耗时: ${duration}ms`);
      logger.info('================================\n');
      
    } catch (error) {
      logger.error('扫描周期出错:', error);
    }
  }
  
  /**
   * 判断是否发送通知
   */
  private shouldNotify(signal: AggregatedSignal, analysis: AIAnalysisResult): boolean {
    // 只发送 buy 和 strong_buy 的建议
    if (!['buy', 'strong_buy'].includes(analysis.recommendation)) {
      return false;
    }
    
    // AI置信度检查
    if (analysis.confidence < this.config.minAiConfidence) {
      return false;
    }
    
    // 极高风险且非strong_buy，不发
    if (analysis.riskAnalysis.overallRisk === 'extreme' && analysis.recommendation !== 'strong_buy') {
      return false;
    }
    
    return true;
  }
  
  /**
   * 发送Discord通知
   */
  private async sendNotification(
    signal: AggregatedSignal,
    analysis: AIAnalysisResult
  ): Promise<void> {
    if (!this.discordBot) {
      logger.info(`[Discord未配置] ${signal.token.symbol}: ${analysis.recommendation}`);
      return;
    }
    
    try {
      await this.discordBot.sendAiRecommendation(signal, analysis);
      logger.info(`✅ 已发送: ${signal.token.symbol} (${analysis.recommendation})`);
    } catch (error) {
      logger.error(`发送通知失败 ${signal.token.symbol}:`, error);
    }
  }
  
  /**
   * 按代币地址去重
   */
  private deduplicateByToken(signals: AggregatedSignal[]): AggregatedSignal[] {
    const seen = new Set<string>();
    return signals.filter(s => {
      const key = `${s.chain}-${s.tokenAddress}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  /**
   * 手动扫描（用于测试）
   */
  async manualScan(): Promise<{ signals: AggregatedSignal[]; analyses: AIAnalysisResult[] }> {
    logger.info('执行手动扫描...');
    
    const newListings = await this.aggregator.aggregateNewListings('solana');
    const trending = await this.aggregator.aggregateTrendingSignals('solana');
    const all = this.deduplicateByToken([...newListings, ...trending]);
    
    logger.info(`扫描到 ${all.length} 个信号`);
    
    const analyses = await this.aiRouter.analyzeBatch(all);
    
    return { signals: all, analyses };
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      platforms: this.aggregator.getPlatformStatus()
    };
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 单例
let monitorInstance: MultiPlatformMonitor | null = null;

export function getMultiPlatformMonitor(config?: Partial<MonitorConfig>): MultiPlatformMonitor {
  if (!monitorInstance) {
    monitorInstance = new MultiPlatformMonitor(config);
  }
  return monitorInstance;
}
