/**
 * Discord测试脚本
 * 发送测试消息验证配置
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { getMultiPlatformMonitor } from './services/multiPlatformMonitor';
import { DiscordBotService } from './services/discordBot';
import { SignalAggregator } from './services/signalAggregator';
import { AIAnalyzer } from './services/aiAnalyzer';
import { AIRouter } from './services/ai/aiRouter';
import logger from './utils/logger';

async function testDiscord() {
  logger.info('========================================');
  logger.info('  Discord 连接测试');
  logger.info('========================================');
  
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  
  if (!token || !channelId) {
    logger.error('❌ 缺少Discord配置');
    return;
  }
  
  logger.info(`Bot Token: ${token.slice(0, 20)}...`);
  logger.info(`Channel ID: ${channelId}`);
  
  const bot = new DiscordBotService(token, channelId);
  
  try {
    await bot.start();
    logger.info('✅ Discord Bot 已启动');
    
    // 发送测试消息
    await bot.sendAlert('🧪 **测试消息**\n机器人连接成功！正在监控市场...');
    logger.info('✅ 测试消息已发送');
    
    // 等待5秒后关闭
    await new Promise(resolve => setTimeout(resolve, 5000));
    await bot.stop();
    logger.info('✅ 测试完成');
    
  } catch (error) {
    logger.error('❌ Discord测试失败:', error);
  }
}

async function testFullPipeline() {
  logger.info('========================================');
  logger.info('  完整流程测试');
  logger.info('========================================');
  
  // 初始化监控器（使用规则AI，更快）
  const monitor = getMultiPlatformMonitor({
    scanIntervalMinutes: 5,
    minConfidenceScore: 40, // 降低阈值方便测试
    minAiConfidence: 50,    // 降低AI置信度
    maxSignalsPerBatch: 5,
    chains: ['solana'],
    aiProvider: 'rule-based' // 使用规则AI，不消耗API额度
  });
  
  await monitor.initialize();
  
  logger.info('开始手动扫描...');
  const { signals, analyses } = await monitor.manualScan();
  
  logger.info(`\n📊 扫描结果:`);
  logger.info(`  信号数量: ${signals.length}`);
  logger.info(`  分析数量: ${analyses.length}`);
  
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    const analysis = analyses[i];
    
    logger.info(`\n${i + 1}. ${signal.token.symbol}`);
    logger.info(`   信号分数: ${signal.score}`);
    logger.info(`   AI建议: ${analysis.recommendation}`);
    logger.info(`   AI置信度: ${analysis.confidence}%`);
    logger.info(`   风险等级: ${analysis.riskAnalysis.overallRisk}`);
    logger.info(`   是否发送: ${['buy', 'strong_buy'].includes(analysis.recommendation) && analysis.confidence >= 50 ? '✅ 是' : '❌ 否'}`);
  }
  
  // 等待一段时间后停止
  await new Promise(resolve => setTimeout(resolve, 10000));
  monitor.stop();
}

// 主函数
async function main() {
  const command = process.argv[2];
  
  if (command === 'discord') {
    await testDiscord();
  } else if (command === 'full') {
    await testFullPipeline();
  } else {
    logger.info('用法: npx ts-node src/testDiscord.ts [discord|full]');
    logger.info('  discord - 仅测试Discord连接');
    logger.info('  full    - 测试完整流程');
  }
}

main().catch(console.error);
