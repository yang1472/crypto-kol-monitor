/**
 * Discord 机器人服务
 * 用于发送购买建议和接收命令
 */
import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  TextChannel, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  Events
} from 'discord.js';
import { BuyRecommendation, Transaction, Kol } from '../types';
import { getPendingRecommendations, updateRecommendationStatus, getStats, getAllKols } from './dataStore';

export class DiscordBotService {
  private client: Client;
  private token: string;
  private channelId: string;
  private isReady: boolean = false;
  
  constructor(token: string, channelId: string) {
    this.token = token;
    this.channelId = channelId;
    
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
    
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    this.client.once(Events.ClientReady, () => {
      console.log(`Discord 机器人已登录: ${this.client.user?.tag}`);
      this.isReady = true;
    });
    
    this.client.on(Events.MessageCreate, async (message) => {
      // 忽略机器人自己的消息
      if (message.author.bot) return;
      
      // 处理命令
      if (message.content.startsWith('!')) {
        await this.handleCommand(message);
      }
    });
    
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton()) return;
      
      try {
        const customId = interaction.customId;
        
        // 处理追踪代币按钮
        if (customId.startsWith('track_')) {
          const tokenAddress = customId.replace('track_', '');
          await interaction.reply({ 
            content: `✅ 已添加追踪: \`${tokenAddress}\`

📊 你可以在 DexScreener 查看详情: https://dexscreener.com/solana/${tokenAddress}`, 
            ephemeral: true 
          });
          return;
        }
        
        // 处理标记执行按钮
        const [action, recId] = customId.split(':');
        
        if (action === 'mark_executed') {
          updateRecommendationStatus(recId, 'executed');
          await interaction.reply({ content: '✅ 已标记为已执行', ephemeral: true });
        } else if (action === 'mark_ignored') {
          updateRecommendationStatus(recId, 'expired');
          await interaction.reply({ content: '❌ 已忽略此建议', ephemeral: true });
        }
      } catch (error) {
        console.error('按钮交互处理失败:', error);
        // 如果已经回复过，就不要再回复
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ 处理失败，请重试', ephemeral: true });
        }
      }
    });
  }
  
  private async handleCommand(message: any) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    
    switch (command) {
      case 'help':
      case '帮助':
        await message.reply(this.getHelpMessage());
        break;
        
      case 'stats':
      case '统计':
        const stats = getStats();
        await message.reply(
          `📊 **监控统计**\n` +
          `• 监控KOL: ${stats.totalKols} 位\n` +
          `• 钱包地址: ${stats.totalWallets} 个\n` +
          `• 社交账号: ${stats.totalSocials} 个\n` +
          `• 交易记录: ${stats.totalTransactions} 条\n` +
          `• 待处理建议: ${stats.pendingRecommendations} 条`
        );
        break;
        
      case 'kols':
      case '列表':
        const kols = getAllKols();
        let reply = '👥 **监控列表**\n\n';
        for (const kol of kols) {
          reply += `**${kol.name}** (${kol.type})\n`;
          reply += `💰 钱包: ${kol.wallets.length} 个 | 📱 社交: ${kol.socials.length} 个\n\n`;
        }
        await message.reply(reply || '暂无监控的KOL');
        break;
        
      case 'pending':
      case '待处理':
        const pending = getPendingRecommendations();
        if (pending.length === 0) {
          await message.reply('暂无待处理的建议');
        } else {
          for (const rec of pending.slice(0, 5)) {
            await this.sendRecommendation(rec);
          }
        }
        break;
    }
  }
  
  private getHelpMessage(): string {
    return `
🤖 **Crypto KOL Monitor 机器人命令**

\`!help\` / \`!帮助\` - 显示帮助信息
\`!stats\` / \`!统计\` - 显示监控统计
\`!kols\` / \`!列表\` - 显示监控的KOL列表
\`!pending\` / \`!待处理\` - 显示待处理建议

系统会自动监控KOL钱包和社交动态，发现机会时会自动推送通知。
    `;
  }
  
  async start(): Promise<void> {
    try {
      await this.client.login(this.token);
    } catch (error) {
      console.error('Discord 登录失败:', error);
      throw error;
    }
  }
  
  async sendRecommendation(rec: BuyRecommendation): Promise<void> {
    if (!this.isReady) {
      console.log('Discord 机器人未就绪，跳过发送');
      return;
    }
    
    try {
      const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
      if (!channel) {
        console.error('找不到指定的Discord频道');
        return;
      }
      
      // 构建embed
      const embed = this.buildRecommendationEmbed(rec);
      
      // 添加操作按钮
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`mark_executed:${rec.id}`)
            .setLabel('✅ 已买入')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`mark_ignored:${rec.id}`)
            .setLabel('❌ 忽略')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await channel.send({ embeds: [embed], components: [row] });
      updateRecommendationStatus(rec.id, 'sent');
      
    } catch (error) {
      console.error('发送Discord消息失败:', error);
    }
  }
  
  private buildRecommendationEmbed(rec: BuyRecommendation): EmbedBuilder {
    const actionEmojis = {
      'buy': '🟢',
      'watch': '👀',
      'avoid': '🔴'
    };
    
    const urgencyEmojis = {
      'high': '🔥🔥🔥',
      'medium': '⚡',
      'low': '💤'
    };
    
    const embed = new EmbedBuilder()
      .setTitle(`${actionEmojis[rec.action]} 新币种草: ${rec.token.symbol}`)
      .setDescription(rec.reasons.join('\n'))
      .setColor(this.getActionColor(rec.action))
      .setTimestamp(new Date())
      .addFields(
        { name: '📊 代币信息', value: 
          `名称: ${rec.token.name}\n` +
          `符号: ${rec.token.symbol}\n` +
          `地址: \`${this.shortenAddress(rec.token.address)}\``, 
          inline: true 
        },
        { name: '👤 信号来源', value: 
          `KOL: ${rec.kolName}\n` +
          `来源: ${rec.source === 'wallet' ? '💰 钱包' : rec.source === 'social' ? '📱 社交' : '💰📱 双信号'}\n` +
          `置信度: ${rec.confidence}%`, 
          inline: true 
        },
        { name: '⏰ 紧急程度', value: urgencyEmojis[rec.urgency], inline: true }
      );
    
    // 添加建议参数
    if (rec.suggestedEntry) {
      embed.addFields({
        name: '💡 建议参数',
        value: `建议入场: $${rec.suggestedEntry}\n` +
               (rec.suggestedStopLoss ? `止损: $${rec.suggestedStopLoss} ` : '') +
               (rec.suggestedTakeProfit ? `止盈: $${rec.suggestedTakeProfit}` : ''),
        inline: false
      });
    }
    
    if (rec.maxPositionUsd) {
      embed.addFields({
        name: '💰 仓位建议',
        value: `最大仓位: $${rec.maxPositionUsd}`,
        inline: true
      });
    }
    
    // 添加相关交易
    if (rec.transactions && rec.transactions.length > 0) {
      const txInfo = rec.transactions.map(tx => 
        `${tx.type === 'buy' ? '🟢 买入' : '🔴 卖出'} ${tx.tokenOut.symbol} ` +
        `${tx.valueUsd ? `($${tx.valueUsd.toFixed(0)})` : ''}`
      ).join('\n');
      
      embed.addFields({
        name: '📈 相关交易',
        value: txInfo,
        inline: false
      });
    }
    
    // 添加警告
    if (rec.action === 'avoid') {
      embed.addFields({
        name: '⚠️ 风险提示',
        value: '此信号建议避免，可能存在高风险或可疑行为',
        inline: false
      });
    }
    
    return embed;
  }
  
  private getActionColor(action: string): number {
    switch (action) {
      case 'buy': return 0x00FF00;
      case 'watch': return 0xFFA500;
      case 'avoid': return 0xFF0000;
      default: return 0x808080;
    }
  }
  
  private shortenAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  
  async sendAlert(message: string): Promise<void> {
    if (!this.isReady) return;
    
    try {
      const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
      await channel.send(`⚠️ **系统提醒**\n${message}`);
    } catch (error) {
      console.error('发送提醒失败:', error);
    }
  }
  
  /**
   * 发送AI分析后的推荐通知
   */
  async sendAiRecommendation(
    signal: any,
    analysis: any
  ): Promise<void> {
    if (!this.isReady) {
      console.log('Discord 机器人未就绪');
      return;
    }
    
    try {
      const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
      if (!channel) return;
      
      const embed = this.buildAiRecommendationEmbed(signal, analysis);
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`track_${signal.tokenAddress}`)
            .setLabel('🔔 追踪此币')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setLabel('📊 查看图表')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://dexscreener.com/solana/${signal.tokenAddress}`)
        );
      
      await channel.send({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error('发送AI推荐失败:', error);
    }
  }
  
  private buildAiRecommendationEmbed(signal: any, analysis: any): EmbedBuilder {
    const token = signal.token;
    const entry = analysis.entryStrategy;
    
    // 根据推荐类型设置颜色和表情
    const config: Record<string, { emoji: string; color: number }> = {
      'strong_buy': { emoji: '🟢🔥', color: 0x00FF00 },
      'buy': { emoji: '🟢', color: 0x90EE90 },
      'watch': { emoji: '👀', color: 0xFFA500 },
      'avoid': { emoji: '🔴', color: 0xFF0000 }
    };
    
    const { emoji, color } = config[analysis.recommendation] || config.watch;
    
    const embed = new EmbedBuilder()
      .setTitle(`${emoji} AI推荐: ${token.symbol}`)
      .setDescription(analysis.reasoning.slice(0, 3).join('\n'))
      .setColor(color)
      .setTimestamp()
      .addFields(
        { name: '📊 代币信息', value:
          `名称: ${token.name}\n` +
          `价格: $${token.priceUsd.toFixed(6)}\n` +
          `市值: ${this.formatUsd(token.marketCap)}\n` +
          `流动性: ${this.formatUsd(token.liquidityUsd)}`,
          inline: true
        },
        { name: '📈 24h数据', value:
          `涨幅: ${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(2)}%\n` +
          `交易量: ${this.formatUsd(token.volume24h)}\n` +
          `持有者: ${token.holderCount.toLocaleString()}`,
          inline: true
        },
        { name: '🤖 AI分析', value:
          `建议: ${this.translateRecommendation(analysis.recommendation)}\n` +
          `置信度: ${analysis.confidence}%\n` +
          `风险: ${this.translateRisk(analysis.riskAnalysis.overallRisk)}`,
          inline: true
        }
      );
    
    // 入场策略
    if (analysis.recommendation === 'buy' || analysis.recommendation === 'strong_buy') {
      embed.addFields({
        name: '💡 入场策略', value:
          `建议仓位: ${this.translatePositionSize(entry.positionSize)} ($${entry.maxPositionUsd})\n` +
          `目标: ${entry.timeHorizon === 'scalp' ? '超短线' : entry.timeHorizon === 'short' ? '短线' : '中线'}\n` +
          `止损: $${entry.suggestedStopLoss.toFixed(6)} (-${((1 - entry.suggestedStopLoss / entry.suggestedEntryPrice) * 100).toFixed(1)}%)\n` +
          `止盈: $${entry.suggestedTakeProfit.toFixed(6)} (+${((entry.suggestedTakeProfit / entry.suggestedEntryPrice - 1) * 100).toFixed(1)}%)`,
        inline: false
      });
    }
    
    // 关键观察
    if (analysis.keyObservations.length > 0) {
      embed.addFields({
        name: '👁️ 关键观察', value: analysis.keyObservations.join('\n'), inline: false
      });
    }
    
    // 风险提示
    if (analysis.riskAnalysis.warnings.length > 0) {
      embed.addFields({
        name: '⚠️ 风险提示', value: analysis.riskAnalysis.warnings.slice(0, 3).join('\n'), inline: false
      });
    }
    
    // 信号来源
    const platforms = signal.metrics.confirmingPlatforms.join(', ');
    embed.setFooter({ text: `数据来源: ${platforms} | ID: ${signal.id.slice(-8)}` });
    
    return embed;
  }
  
  private translateRecommendation(rec: string): string {
    const map: Record<string, string> = {
      'strong_buy': '强力买入 🔥',
      'buy': '买入 ✅',
      'watch': '观望 👀',
      'avoid': '避免 ❌'
    };
    return map[rec] || rec;
  }
  
  private translateRisk(risk: string): string {
    const map: Record<string, string> = {
      'low': '低 🟢',
      'medium': '中 🟡',
      'high': '高 🔴',
      'extreme': '极高 ⚫'
    };
    return map[risk] || risk;
  }
  
  private translatePositionSize(size: string): string {
    const map: Record<string, string> = {
      'small': '小仓位',
      'medium': '中等仓位',
      'large': '大仓位'
    };
    return map[size] || size;
  }
  
  private formatUsd(amount: number): string {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toFixed(0)}`;
  }
  
  async stop(): Promise<void> {
    this.client.destroy();
    this.isReady = false;
  }
}
