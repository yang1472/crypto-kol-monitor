/**
 * Crypto KOL Monitor - 主入口 (v2.0 多平台聚合版)
 * 
 * 新架构：
 * 多平台API (DexScreener/Birdeye) → 信号聚合 → AI分析 → Discord通知
 * 
 * 环境变量说明:
 * - HELIUS_API_KEY: Solana监控API密钥 (可选，现在主要用DexScreener/Birdeye)
 * - DISCORD_BOT_TOKEN: Discord机器人Token (必需)
 * - DISCORD_CHANNEL_ID: Discord频道ID (必需)
 * - BIRDEYE_API_KEY: Birdeye API密钥 (可选，提高限额)
 * - MONITOR_INTERVAL_MINUTES: 监控间隔(分钟),默认5
 * - MIN_CONFIDENCE_SCORE: 最小信号分数,默认60
 * - MIN_AI_CONFIDENCE: AI最小置信度,默认65
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { getMultiPlatformMonitor } from './services/multiPlatformMonitor';
import { getConfig, saveConfig } from './services/dataStore';
import logger from './utils/logger';

async function main() {
  logger.info('========================================');
  logger.info('  Crypto KOL Monitor v2.0');
  logger.info('  多平台聚合 + AI分析');
  logger.info('========================================');
  
  // 检查必需的Discord配置
  const requiredVars = ['DISCORD_BOT_TOKEN', 'DISCORD_CHANNEL_ID'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    logger.error(`缺少必需的环境变量: ${missing.join(', ')}`);
    logger.error('请复制 .env.example 为 .env 并填写配置');
    process.exit(1);
  }
  
  // 保存配置
  const config = getConfig();
  if (process.env.DISCORD_BOT_TOKEN) config.discordBotToken = process.env.DISCORD_BOT_TOKEN;
  if (process.env.DISCORD_CHANNEL_ID) config.discordChannelId = process.env.DISCORD_CHANNEL_ID;
  if (process.env.BIRDEYE_API_KEY) config.birdeyeApiKey = process.env.BIRDEYE_API_KEY;
  saveConfig(config);
  
  // 获取监控配置
  const scanInterval = parseInt(process.env.MONITOR_INTERVAL_MINUTES || '5');
  const minConfidence = parseInt(process.env.MIN_CONFIDENCE_SCORE || '60');
  const minAiConfidence = parseInt(process.env.MIN_AI_CONFIDENCE || '65');
  const aiProvider = (process.env.AI_PROVIDER || 'auto') as any;
  
  // 启动多平台监控
  const monitor = getMultiPlatformMonitor({
    scanIntervalMinutes: scanInterval,
    minConfidenceScore: minConfidence,
    minAiConfidence: minAiConfidence,
    maxSignalsPerBatch: 10,
    chains: ['solana'],
    aiProvider: aiProvider,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    minimaxApiKey: process.env.MINIMAX_API_KEY
  });
  
  try {
    await monitor.initialize();
    monitor.start();
    
    logger.info('========================================');
    logger.info('  🚀 多平台监控服务已启动!');
    logger.info('  支持的信号源:');
    logger.info('    - DexScreener (免费)');
    logger.info('    - Birdeye (免费100次/天)');
    logger.info('========================================');
    
  } catch (error) {
    logger.error('启动失败:', error);
    process.exit(1);
  }
}

// 处理退出信号
process.on('SIGINT', () => {
  logger.info('收到退出信号，正在关闭...');
  const monitor = getMultiPlatformMonitor();
  monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('收到终止信号，正在关闭...');
  const monitor = getMultiPlatformMonitor();
  monitor.stop();
  process.exit(0);
});

// 处理未捕获的错误
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的Promise拒绝:', reason);
});

// 启动
main();
