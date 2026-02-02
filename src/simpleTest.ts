/**
 * 简单发送测试
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits, EmbedBuilder, TextChannel } from 'discord.js';

async function simpleTest() {
  console.log('开始Discord测试...');
  
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  
  console.log('Token:', token ? token.slice(0, 20) + '...' : '未设置');
  console.log('Channel ID:', channelId);
  
  if (!token || !channelId) {
    console.error('❌ 配置缺失');
    return;
  }
  
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });
  
  client.once('ready', async () => {
    console.log(`✅ Bot已登录: ${client.user?.tag}`);
    
    try {
      const channel = await client.channels.fetch(channelId) as TextChannel;
      
      if (!channel) {
        console.error('❌ 找不到频道');
        return;
      }
      
      console.log(`✅ 找到频道: ${channel.name}`);
      
      // 发送简单消息
      await channel.send('🧪 **测试消息**\n机器人运行正常！');
      console.log('✅ 简单消息已发送');
      
      // 发送Embed
      const embed = new EmbedBuilder()
        .setTitle('🟢🔥 AI推荐: TEST')
        .setDescription('✅ 多平台验证\n✅ 测试通过')
        .setColor(0x00FF00)
        .addFields(
          { name: '价格', value: '$0.001', inline: true },
          { name: '市值', value: '$1M', inline: true }
        );
      
      await channel.send({ embeds: [embed] });
      console.log('✅ Embed消息已发送');
      
      console.log('\n✅ 所有测试通过！检查你的Discord频道。');
      
    } catch (error) {
      console.error('❌ 发送失败:', error);
    } finally {
      setTimeout(() => {
        client.destroy();
        process.exit(0);
      }, 3000);
    }
  });
  
  try {
    await client.login(token);
  } catch (error) {
    console.error('❌ 登录失败:', error);
  }
}

simpleTest();
