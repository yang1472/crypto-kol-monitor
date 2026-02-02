/**
 * KOL管理工具
 * 用于添加、删除、查看KOL信息
 * 
 * 使用方法:
 * npx ts-node src/manageKols.ts [命令] [参数]
 * 
 * 命令:
 *   add <名称> <类型>        - 添加KOL
 *   list                     - 列出所有KOL
 *   show <id>                - 显示KOL详情
 *   delete <id>              - 删除KOL
 *   add-wallet <kolId> <address> <chain> [label]  - 添加钱包
 *   add-social <kolId> <platform> <username>      - 添加社交账号
 * 
 * 示例:
 *   npx ts-node src/manageKols.ts add "Vitalik" smart_money
 *   npx ts-node src/manageKols.ts add-wallet kol_xxx 0x123... solana "主钱包"
 */
import { addKol, getAllKols, getKolById, deleteKol, addWallet, addSocialAccount, getStats } from './services/dataStore';
import { Kol, KolType } from './types';

function generateId(): string {
  return `kol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function printKol(kol: Kol) {
  console.log('\n========================================');
  console.log(`👤 ${kol.name} (${kol.type})`);
  console.log(`ID: ${kol.id}`);
  console.log(`描述: ${kol.description || '无'}`);
  console.log(`标签: ${kol.tags.join(', ') || '无'}`);
  
  console.log('\n💰 钱包地址:');
  if (kol.wallets.length === 0) {
    console.log('  (无)');
  } else {
    for (const w of kol.wallets) {
      const status = w.isActive ? '✅' : '❌';
      console.log(`  ${status} [${w.chain}] ${w.address.substring(0, 20)}... ${w.label || ''}`);
    }
  }
  
  console.log('\n📱 社交账号:');
  if (kol.socials.length === 0) {
    console.log('  (无)');
  } else {
    for (const s of kol.socials) {
      const status = s.isActive ? '✅' : '❌';
      console.log(`  ${status} [${s.platform}] @${s.username}`);
    }
  }
  
  console.log('\n⚙️ 监控配置:');
  console.log(`  监控钱包: ${kol.monitorConfig.monitorWallets ? '是' : '否'}`);
  console.log(`  监控社交: ${kol.monitorConfig.monitorSocials ? '是' : '否'}`);
  if (kol.monitorConfig.minValueUsd) {
    console.log(`  最小金额: $${kol.monitorConfig.minValueUsd}`);
  }
}

function printHelp() {
  console.log(`
Crypto KOL Monitor - KOL管理工具

使用方法: npx ts-node src/manageKols.ts [命令] [参数]

命令:
  add <名称> <类型> [描述]        添加KOL
  list                            列出所有KOL
  stats                           显示统计信息
  show <id>                       显示KOL详情
  delete <id>                     删除KOL
  add-wallet <kolId> <address> <chain> [label]   添加钱包
  add-social <kolId> <platform> <username> [url] 添加社交账号

类型选项: kol, smart_money, whale, insider
链选项: solana, ethereum, bsc, base, arbitrum
平台选项: twitter, telegram, discord, youtube

示例:
  npx ts-node src/manageKols.ts add "Vitalik" smart_money "以太坊创始人"
  npx ts-node src/manageKols.ts add-wallet kol_xxx EPjFW... solana "主钱包"
  npx ts-node src/manageKols.ts add-social kol_xxx twitter vitalikbuterin
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '-h' || command === '--help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'add': {
      const [name, type, ...descParts] = args.slice(1);
      if (!name || !type) {
        console.error('错误: 请提供名称和类型');
        console.log('用法: add <名称> <类型> [描述]');
        return;
      }
      
      const validTypes: KolType[] = ['kol', 'smart_money', 'whale', 'insider'];
      if (!validTypes.includes(type as KolType)) {
        console.error(`错误: 无效的类型。有效类型: ${validTypes.join(', ')}`);
        return;
      }
      
      const kol: Kol = {
        id: generateId(),
        name,
        type: type as KolType,
        description: descParts.join(' '),
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wallets: [],
        socials: [],
        monitorConfig: {
          monitorWallets: true,
          monitorSocials: true,
          minValueUsd: 100
        }
      };
      
      addKol(kol);
      console.log(`✅ 已添加KOL: ${name}`);
      console.log(`ID: ${kol.id}`);
      break;
    }
    
    case 'list': {
      const kols = getAllKols();
      if (kols.length === 0) {
        console.log('暂无KOL数据');
        return;
      }
      
      console.log('\n📋 KOL列表:');
      console.log('='.repeat(80));
      console.log('ID                          名称                类型          钱包  社交');
      console.log('-'.repeat(80));
      
      for (const kol of kols) {
        const name = kol.name.padEnd(18);
        const type = kol.type.padEnd(12);
        const id = kol.id.substring(0, 25).padEnd(27);
        console.log(`${id} ${name} ${type} ${kol.wallets.length.toString().padStart(3)}  ${kol.socials.length.toString().padStart(3)}`);
      }
      console.log('='.repeat(80));
      console.log(`总计: ${kols.length} 位KOL`);
      break;
    }
    
    case 'stats': {
      const stats = getStats();
      console.log('\n📊 统计信息:');
      console.log('='.repeat(40));
      console.log(`监控KOL数量:     ${stats.totalKols.toString().padStart(6)}`);
      console.log(`钱包地址数量:    ${stats.totalWallets.toString().padStart(6)}`);
      console.log(`社交账号数量:    ${stats.totalSocials.toString().padStart(6)}`);
      console.log(`交易记录数量:    ${stats.totalTransactions.toString().padStart(6)}`);
      console.log(`待处理建议:      ${stats.pendingRecommendations.toString().padStart(6)}`);
      console.log('='.repeat(40));
      break;
    }
    
    case 'show': {
      const [id] = args.slice(1);
      if (!id) {
        console.error('错误: 请提供KOL ID');
        return;
      }
      
      const kol = getKolById(id);
      if (!kol) {
        console.error('错误: 未找到该KOL');
        return;
      }
      
      printKol(kol);
      break;
    }
    
    case 'delete': {
      const [id] = args.slice(1);
      if (!id) {
        console.error('错误: 请提供KOL ID');
        return;
      }
      
      const success = deleteKol(id);
      if (success) {
        console.log('✅ 已删除KOL');
      } else {
        console.error('错误: 未找到该KOL');
      }
      break;
    }
    
    case 'add-wallet': {
      const [kolId, address, chain, ...labelParts] = args.slice(1);
      if (!kolId || !address || !chain) {
        console.error('错误: 参数不完整');
        console.log('用法: add-wallet <kolId> <address> <chain> [label]');
        return;
      }
      
      const validChains = ['solana', 'ethereum', 'bsc', 'base', 'arbitrum'];
      if (!validChains.includes(chain)) {
        console.error(`错误: 无效的链。有效选项: ${validChains.join(', ')}`);
        return;
      }
      
      const success = addWallet(kolId, {
        address,
        chain,
        label: labelParts.join(' ')
      });
      
      if (success) {
        console.log('✅ 已添加钱包地址');
      } else {
        console.error('错误: 未找到该KOL');
      }
      break;
    }
    
    case 'add-social': {
      const [kolId, platform, username, ...urlParts] = args.slice(1);
      if (!kolId || !platform || !username) {
        console.error('错误: 参数不完整');
        console.log('用法: add-social <kolId> <platform> <username> [url]');
        return;
      }
      
      const validPlatforms = ['twitter', 'telegram', 'discord', 'youtube'];
      if (!validPlatforms.includes(platform)) {
        console.error(`错误: 无效的平台。有效选项: ${validPlatforms.join(', ')}`);
        return;
      }
      
      const success = addSocialAccount(kolId, {
        platform: platform as any,
        username,
        url: urlParts.join(' ')
      });
      
      if (success) {
        console.log('✅ 已添加社交账号');
      } else {
        console.error('错误: 未找到该KOL');
      }
      break;
    }
    
    default:
      console.error(`错误: 未知命令 "${command}"`);
      printHelp();
  }
}

main().catch(console.error);
