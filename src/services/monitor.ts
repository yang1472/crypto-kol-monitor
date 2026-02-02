/**
 * 主监控服务
 * 定期扫描钱包和社交账号，生成建议
 */
import * as cron from 'node-cron';
import { HeliusService } from './heliusService';
import { DiscordBotService } from './discordBot';
import { AnalyzerService } from './analyzer';
import { 
  getActiveWallets, 
  getConfig, 
  saveTransaction, 
  saveRecommendation,
  getRecentTransactions 
} from './dataStore';
import logger from '../utils/logger';

export class MonitorService {
  private heliusService: HeliusService | null = null;
  private discordBot: DiscordBotService | null = null;
  private analyzer: AnalyzerService;
  private isRunning: boolean = false;
  private cronJob: cron.ScheduledTask | null = null;
  
  constructor() {
    this.analyzer = new AnalyzerService();
  }
  
  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    const config = getConfig();
    
    // 初始化Helius服务
    if (config.heliusApiKey) {
      this.heliusService = new HeliusService(config.heliusApiKey);
      logger.info('Helius 服务已初始化');
    } else {
      logger.warn('未配置 Helius API Key，无法监控Solana钱包');
    }
    
    // 初始化Discord机器人
    if (config.discordBotToken && config.discordChannelId) {
      this.discordBot = new DiscordBotService(
        config.discordBotToken, 
        config.discordChannelId
      );
      await this.discordBot.start();
      logger.info('Discord 机器人已启动');
    } else {
      logger.warn('未配置 Discord 机器人，将无法发送通知');
    }
  }
  
  /**
   * 开始监控循环
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('监控服务已在运行');
      return;
    }
    
    const config = getConfig();
    const intervalMinutes = config.monitorIntervalMinutes || 5;
    
    logger.info(`启动监控服务，间隔: ${intervalMinutes} 分钟`);
    
    // 立即执行一次
    this.runMonitoringCycle();
    
    // 设置定时任务
    this.cronJob = cron.schedule(`*/${intervalMinutes} * * * *`, () => {
      this.runMonitoringCycle();
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
    logger.info('监控服务已停止');
  }
  
  /**
   * 运行一次监控周期
   */
  private async runMonitoringCycle(): Promise<void> {
    logger.info('开始监控周期...');
    const startTime = Date.now();
    
    try {
      // 1. 监控钱包
      const newTransactions = await this.monitorWallets();
      
      // 2. 分析并生成建议
      if (newTransactions.length > 0) {
        logger.info(`发现 ${newTransactions.length} 笔新交易，开始分析...`);
        const recommendations = await this.analyzer.analyzeTransactions(newTransactions);
        
        // 3. 发送通知
        for (const rec of recommendations) {
          saveRecommendation(rec);
          
          // 过滤低置信度
          const config = getConfig();
          if (rec.confidence >= config.minConfidenceThreshold) {
            if (this.discordBot) {
              await this.discordBot.sendRecommendation(rec);
              logger.info(`已发送建议: ${rec.token.symbol} (${rec.confidence}%)`);
            }
          }
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`监控周期完成，耗时: ${duration}ms`);
      
    } catch (error) {
      logger.error('监控周期出错:', error);
    }
  }
  
  /**
   * 监控所有激活的钱包
   */
  private async monitorWallets(): Promise<any[]> {
    if (!this.heliusService) {
      logger.warn('Helius 服务未初始化');
      return [];
    }
    
    const wallets = getActiveWallets();
    const newTransactions: any[] = [];
    
    logger.info(`监控 ${wallets.length} 个钱包...`);
    
    // 获取已知的最近交易哈希，用于去重
    const recentTxs = getRecentTransactions(24);
    const knownHashes = new Set(recentTxs.map(t => t.txHash));
    
    for (const { kolId, kolName, wallet } of wallets) {
      try {
        // 只监控Solana钱包
        if (wallet.chain !== 'solana') {
          logger.debug(`跳过非Solana钱包: ${wallet.chain}`);
          continue;
        }
        
        logger.debug(`检查钱包: ${kolName} - ${wallet.address}`);
        
        const txs = await this.heliusService.getWalletTransactions(
          wallet.address, 
          10  // 最近10笔
        );
        
        for (const tx of txs) {
          // 跳过已记录的交易
          if (knownHashes.has(tx.signature)) {
            continue;
          }
          
          // 只处理最近1小时内的交易
          const txTime = new Date(tx.timestamp * 1000);
          if (Date.now() - txTime.getTime() > 60 * 60 * 1000) {
            continue;
          }
          
          // 转换并保存
          const transaction = this.heliusService.convertToTransaction(
            tx, 
            kolId, 
            wallet.id
          );
          
          if (transaction) {
            saveTransaction(transaction);
            newTransactions.push(transaction);
            logger.info(`新交易: ${transaction.type} ${transaction.tokenOut?.symbol}`);
          }
        }
        
        // 添加延迟避免API限制
        await this.delay(500);
        
      } catch (error) {
        logger.error(`监控钱包 ${wallet.address} 失败:`, error);
      }
    }
    
    return newTransactions;
  }
  
  /**
   * 手动扫描特定钱包
   */
  async scanWallet(address: string, chain: string = 'solana'): Promise<any[]> {
    if (!this.heliusService || chain !== 'solana') {
      throw new Error('不支持的钱包类型或API未配置');
    }
    
    const txs = await this.heliusService.getWalletTransactions(address, 50);
    const transactions: any[] = [];
    
    // 找到对应的KOL和钱包ID
    const wallets = getActiveWallets();
    const walletInfo = wallets.find(w => w.wallet.address === address);
    
    if (!walletInfo) {
      throw new Error('未找到钱包信息');
    }
    
    for (const tx of txs) {
      const transaction = this.heliusService.convertToTransaction(
        tx,
        walletInfo.kolId,
        walletInfo.wallet.id
      );
      
      if (transaction) {
        saveTransaction(transaction);
        transactions.push(transaction);
      }
    }
    
    return transactions;
  }
  
  /**
   * 获取监控状态
   */
  getStatus(): {
    isRunning: boolean;
    heliusConnected: boolean;
    discordConnected: boolean;
  } {
    return {
      isRunning: this.isRunning,
      heliusConnected: this.heliusService !== null,
      discordConnected: this.discordBot !== null && this.discordBot['isReady'] === true
    };
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 单例实例
let monitorInstance: MonitorService | null = null;

export function getMonitor(): MonitorService {
  if (!monitorInstance) {
    monitorInstance = new MonitorService();
  }
  return monitorInstance;
}
