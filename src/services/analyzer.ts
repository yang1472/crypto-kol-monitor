/**
 * 分析引擎
 * 综合分析钱包交易和社交动态，生成购买建议
 */
import { 
  Transaction, 
  SocialPost, 
  BuyRecommendation, 
  TokenInfo, 
  Kol 
} from '../types';
import { getAllKols } from './dataStore';

export class AnalyzerService {
  
  /**
   * 分析交易并生成购买建议
   */
  async analyzeTransactions(transactions: Transaction[]): Promise<BuyRecommendation[]> {
    const recommendations: BuyRecommendation[] = [];
    const kols = getAllKols();
    
    // 按代币分组交易
    const tokenGroups = this.groupByToken(transactions);
    
    for (const [tokenAddress, txs] of tokenGroups) {
      // 获取代币信息（使用第一个交易的代币信息）
      const sampleTx = txs.find(t => t.tokenOut);
      if (!sampleTx) continue;
      
      const token = sampleTx.tokenOut;
      
      // 统计信号
      const buySignals = txs.filter(t => t.type === 'buy');
      const strongSignals = txs.filter(t => t.signal === 'strong_buy');
      const totalValue = txs.reduce((sum, t) => sum + (t.valueUsd || 0), 0);
      
      // 计算综合置信度
      const baseConfidence = Math.min(50 + buySignals.length * 10 + strongSignals.length * 15, 95);
      
      // 分析多个维度
      const reasons: string[] = [];
      let action: 'buy' | 'watch' | 'avoid' = 'watch';
      let urgency: 'high' | 'medium' | 'low' = 'low';
      
      // 1. 多钱包买入
      const uniqueKols = new Set(txs.map(t => t.kolId)).size;
      if (uniqueKols >= 3) {
        reasons.push(`🔥 **多钱包共振**: ${uniqueKols} 个KOL的钱包同时买入`);
        urgency = 'high';
        action = 'buy';
      } else if (uniqueKols >= 2) {
        reasons.push(`⚡ **多钱包关注**: ${uniqueKols} 个KOL的钱包买入`);
        urgency = 'medium';
        action = 'buy';
      }
      
      // 2. 大额买入
      const largeBuys = buySignals.filter(t => (t.valueUsd || 0) > 5000);
      if (largeBuys.length > 0) {
        const totalLarge = largeBuys.reduce((sum, t) => sum + (t.valueUsd || 0), 0);
        reasons.push(`💰 **大额买入**: ${largeBuys.length} 笔大额交易，总计 $${totalLarge.toFixed(0)}`);
        urgency = 'high';
        action = 'buy';
      }
      
      // 3. 新币买入
      const newTokenBuys = txs.filter(t => t.isNewToken);
      if (newTokenBuys.length > 0) {
        reasons.push(`🆕 **新币机会**: ${newTokenBuys.length} 笔新币买入，可能是早期机会`);
        if (action === 'watch') action = 'buy';
        if (urgency === 'low') urgency = 'medium';
      }
      
      // 4. 强买入信号
      if (strongSignals.length > 0) {
        reasons.push(`📈 **强信号**: ${strongSignals.length} 个强买入信号`);
      }
      
      // 5. 异常行为检测（卖出多于买入可能是rug信号）
      const sellSignals = txs.filter(t => t.type === 'sell');
      if (sellSignals.length > buySignals.length * 2) {
        reasons.push(`⚠️ **异常卖出**: 卖出信号远多于买入，可能是Rug Pull风险`);
        action = 'avoid';
        urgency = 'high';
      }
      
      // 如果没有足够理由，跳过
      if (reasons.length === 0) continue;
      
      // 确定主要的KOL
      const kolMap = new Map<string, { kol: Kol; count: number }>();
      for (const tx of txs) {
        const kol = kols.find(k => k.id === tx.kolId);
        if (kol) {
          const current = kolMap.get(kol.id);
          if (current) {
            current.count++;
          } else {
            kolMap.set(kol.id, { kol, count: 1 });
          }
        }
      }
      
      const mainKolEntry = Array.from(kolMap.entries())
        .sort((a, b) => b[1].count - a[1].count)[0];
      
      if (!mainKolEntry) continue;
      
      const [mainKolId, mainKolData] = mainKolEntry;
      
      // 计算建议参数
      const params = this.calculateParams(token, totalValue, action);
      
      const recommendation: BuyRecommendation = {
        id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        kolId: mainKolId,
        kolName: mainKolData.kol.name,
        source: 'wallet',
        token,
        action,
        urgency,
        confidence: baseConfidence,
        reasons,
        transactions: txs,
        ...params,
        status: 'pending'
      };
      
      recommendations.push(recommendation);
    }
    
    // 按置信度和紧急程度排序
    return recommendations.sort((a, b) => {
      if (a.urgency !== b.urgency) {
        return a.urgency === 'high' ? -1 : b.urgency === 'high' ? 1 : 0;
      }
      return b.confidence - a.confidence;
    });
  }
  
  /**
   * 结合社交动态和交易生成综合建议
   */
  async analyzeCombined(
    transactions: Transaction[],
    socialPosts: SocialPost[]
  ): Promise<BuyRecommendation[]> {
    // 首先分析交易
    const txRecommendations = await this.analyzeTransactions(transactions);
    
    // 分析社交动态
    const socialRecs = await this.analyzeSocialPosts(socialPosts);
    
    // 合并并去重（按代币地址）
    const allRecs = [...txRecommendations, ...socialRecs];
    const tokenMap = new Map<string, BuyRecommendation>();
    
    for (const rec of allRecs) {
      const existing = tokenMap.get(rec.token.address);
      if (!existing) {
        tokenMap.set(rec.token.address, rec);
      } else {
        // 合并信号
        if (rec.source !== existing.source) {
          existing.source = 'both';
          existing.confidence = Math.min(existing.confidence + 15, 95);
          existing.reasons.push(...rec.reasons.map(r => `[社交] ${r}`));
        }
      }
    }
    
    return Array.from(tokenMap.values());
  }
  
  /**
   * 分析社交动态
   */
  private async analyzeSocialPosts(posts: SocialPost[]): Promise<BuyRecommendation[]> {
    // TODO: 实现社交动态分析
    // 需要Twitter API来抓取推文
    return [];
  }
  
  /**
   * 按代币地址分组交易
   */
  private groupByToken(transactions: Transaction[]): Map<string, Transaction[]> {
    const groups = new Map<string, Transaction[]>();
    
    for (const tx of transactions) {
      const tokenAddress = tx.tokenOut?.address;
      if (!tokenAddress) continue;
      
      const existing = groups.get(tokenAddress);
      if (existing) {
        existing.push(tx);
      } else {
        groups.set(tokenAddress, [tx]);
      }
    }
    
    return groups;
  }
  
  /**
   * 计算建议参数
   */
  private calculateParams(
    token: TokenInfo,
    totalValue: number,
    action: string
  ): Partial<BuyRecommendation> {
    if (action === 'avoid') {
      return {};
    }
    
    // 根据总交易额调整建议仓位
    let maxPositionUsd = 500;
    if (totalValue > 10000) {
      maxPositionUsd = 2000;
    } else if (totalValue > 5000) {
      maxPositionUsd = 1000;
    }
    
    // 如果是新币，建议小仓位
    const isNewToken = token.name.toLowerCase().includes('new') || 
                       token.symbol === 'UNKNOWN';
    if (isNewToken) {
      maxPositionUsd = Math.min(maxPositionUsd, 300);
    }
    
    return {
      maxPositionUsd,
      suggestedStopLoss: undefined,  // 需要获取价格后计算
      suggestedTakeProfit: undefined
    };
  }
  
  /**
   * 风险评估
   */
  assessRisk(token: TokenInfo, transactions: Transaction[]): {
    riskLevel: 'low' | 'medium' | 'high' | 'extreme';
    warnings: string[];
  } {
    const warnings: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
    
    // 检查新币风险
    if (token.symbol === 'UNKNOWN') {
      warnings.push('代币元数据不完整，可能是新发行代币');
      riskLevel = 'high';
    }
    
    // 检查卖出模式
    const sells = transactions.filter(t => t.type === 'sell');
    const buys = transactions.filter(t => t.type === 'buy');
    
    if (sells.length > buys.length) {
      warnings.push('卖出活动多于买入，可能存在抛压');
      riskLevel = 'high';
    }
    
    // 检查集中度
    const kolSet = new Set(transactions.map(t => t.kolId));
    if (kolSet.size === 1 && transactions.length > 5) {
      warnings.push('交易高度集中在单个钱包，可能存在操纵风险');
      riskLevel = 'high';
    }
    
    return { riskLevel, warnings };
  }
}
