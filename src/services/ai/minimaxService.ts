/**
 * MiniMax AI 服务
 * 文档: https://www.minimaxi.com/document
 */
import axios, { AxiosInstance } from 'axios';
import { AggregatedSignal, AIAnalysisResult } from '../../types/platform';
import logger from '../../utils/logger';

export class MiniMaxService {
  private client: AxiosInstance;
  private apiKey: string;
  private readonly model = 'abab6.5s-chat'; // MiniMax最新模型
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.minimaxi.com/v1',
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }
  
  async analyzeSignal(signal: AggregatedSignal): Promise<AIAnalysisResult> {
    logger.info(`使用 MiniMax 分析 ${signal.token.symbol}...`);
    
    const prompt = this.buildAnalysisPrompt(signal);
    
    try {
      const response = await this.client.post('/text/chatcompletion_v2', {
        model: this.model,
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });
      
      const content = response.data.choices?.[0]?.message?.content;
      if (!content) throw new Error('MiniMax 返回空内容');
      
      // 提取JSON（MiniMax可能在markdown代码块中返回）
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                       content.match(/```\n([\s\S]*?)\n```/) ||
                       [null, content];
      
      const parsed = JSON.parse(jsonMatch[1] || content);
      return this.normalizeResult(parsed, signal);
      
    } catch (error) {
      logger.error(`MiniMax 分析失败 ${signal.token.symbol}:`, error);
      throw error;
    }
  }
  
  async analyzeBatch(signals: AggregatedSignal[]): Promise<AIAnalysisResult[]> {
    const results: AIAnalysisResult[] = [];
    for (const signal of signals) {
      try {
        const result = await this.analyzeSignal(signal);
        results.push(result);
        await this.delay(500);
      } catch (error) {
        logger.error(`MiniMax 批量分析失败 ${signal.token.symbol}:`, error);
      }
    }
    return results;
  }
  
  private getSystemPrompt(): string {
    return `你是专业加密货币分析师，专门分析Solana生态的Meme币和新币，给出交易建议。

必须返回JSON格式：
{
  "recommendation": "strong_buy|buy|watch|avoid",
  "confidence": 0-100,
  "reasoning": ["理由1","理由2"],
  "entryStrategy": {
    "suggestedEntryPrice": number,
    "suggestedStopLoss": number,
    "suggestedTakeProfit": number,
    "positionSize": "small|medium|large",
    "maxPositionUsd": number,
    "timeHorizon": "scalp|short|medium|long"
  },
  "riskAnalysis": {
    "rugRisk": 0-100,
    "volatilityRisk": 0-100,
    "liquidityRisk": 0-100,
    "overallRisk": "low|medium|high|extreme",
    "warnings": ["风险1"]
  },
  "keyObservations": ["观察1"]
}

分析原则：
1. 新币（<24小时）极度危险，rugRisk应>50
2. 流动性<$10k是极高风险信号
3. 多平台确认是积极信号
4. 交易量>市值说明热度极高`;
  }
  
  private buildAnalysisPrompt(signal: AggregatedSignal): string {
    const { token, metrics, isNewToken, ageHours, riskLevel, riskFactors, type } = signal;
    return `分析以下代币数据并返回JSON格式：

【基础信息】
代币名称: ${token.name}
代币符号: ${token.symbol}
合约地址: ${token.address}
所属链: Solana
是否新币: ${isNewToken ? '是' : '否'}，上线${ageHours.toFixed(1)}小时
信号类型: ${type}

【市场数据】
当前价格: $${token.priceUsd.toFixed(10)}
24小时涨幅: ${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(2)}%
市值: $${token.marketCap.toLocaleString()}
流动性: $${token.liquidityUsd.toLocaleString()}
24小时交易量: $${token.volume24h.toLocaleString()}
持有者数量: ${token.holderCount.toLocaleString()}

【平台验证】
数据来源平台数: ${metrics.platformCount}
确认平台: ${metrics.confirmingPlatforms.join(', ')}
综合评分: ${signal.score}/100
紧急程度: ${signal.urgency}

【初步风险评估】
风险等级: ${riskLevel}
风险因素: ${riskFactors.join('；')}

请给出：
1. 投资建议（strong_buy/buy/watch/avoid）
2. 置信度（0-100）
3. 入场策略（价格、止损、止盈、仓位、周期）
4. 详细风险分析
5. 关键观察点`;
  }
  
  private normalizeResult(parsed: any, signal: AggregatedSignal): AIAnalysisResult {
    return {
      signalId: signal.id,
      recommendation: ['strong_buy','buy','watch','avoid'].includes(parsed.recommendation) 
        ? parsed.recommendation : 'watch',
      confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
      reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : ['AI分析完成'],
      entryStrategy: {
        suggestedEntryPrice: parsed.entryStrategy?.suggestedEntryPrice || signal.token.priceUsd,
        suggestedStopLoss: parsed.entryStrategy?.suggestedStopLoss || signal.token.priceUsd * 0.8,
        suggestedTakeProfit: parsed.entryStrategy?.suggestedTakeProfit || signal.token.priceUsd * 1.5,
        positionSize: ['small','medium','large'].includes(parsed.entryStrategy?.positionSize)
          ? parsed.entryStrategy.positionSize : 'small',
        maxPositionUsd: parsed.entryStrategy?.maxPositionUsd || 200,
        timeHorizon: ['scalp','short','medium','long'].includes(parsed.entryStrategy?.timeHorizon)
          ? parsed.entryStrategy.timeHorizon : 'short'
      },
      riskAnalysis: {
        rugRisk: Math.max(0, Math.min(100, parsed.riskAnalysis?.rugRisk || 50)),
        volatilityRisk: Math.max(0, Math.min(100, parsed.riskAnalysis?.volatilityRisk || 50)),
        liquidityRisk: Math.max(0, Math.min(100, parsed.riskAnalysis?.liquidityRisk || 50)),
        overallRisk: ['low','medium','high','extreme'].includes(parsed.riskAnalysis?.overallRisk)
          ? parsed.riskAnalysis.overallRisk : 'medium',
        warnings: Array.isArray(parsed.riskAnalysis?.warnings) 
          ? parsed.riskAnalysis.warnings : []
      },
      keyObservations: Array.isArray(parsed.keyObservations) ? parsed.keyObservations : [],
      analyzedAt: new Date().toISOString(),
      aiModel: 'minimax-abab6.5s'
    };
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
