/**
 * DeepSeek AI 服务
 * 文档: https://platform.deepseek.com/docs
 */
import axios, { AxiosInstance } from 'axios';
import { AggregatedSignal, AIAnalysisResult } from '../../types/platform';
import logger from '../../utils/logger';

export class DeepSeekService {
  private client: AxiosInstance;
  private apiKey: string;
  private readonly model = 'deepseek-chat'; // 或 deepseek-reasoner
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://api.deepseek.com/v1',
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }
  
  async analyzeSignal(signal: AggregatedSignal): Promise<AIAnalysisResult> {
    logger.info(`使用 DeepSeek 分析 ${signal.token.symbol}...`);
    
    const prompt = this.buildAnalysisPrompt(signal);
    
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });
      
      const content = response.data.choices[0]?.message?.content;
      if (!content) throw new Error('DeepSeek 返回空内容');
      
      const parsed = JSON.parse(content);
      return this.normalizeResult(parsed, signal);
      
    } catch (error) {
      logger.error(`DeepSeek 分析失败 ${signal.token.symbol}:`, error);
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
        logger.error(`DeepSeek 批量分析失败 ${signal.token.symbol}:`, error);
      }
    }
    return results;
  }
  
  private getSystemPrompt(): string {
    return `你是专业加密货币分析师，分析Solana Meme币。返回JSON格式：
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
原则：新币<24h极度危险；流动性<$10k极高风险；多平台确认是积极信号。`;
  }
  
  private buildAnalysisPrompt(signal: AggregatedSignal): string {
    const { token, metrics, isNewToken, ageHours, riskLevel, riskFactors, type } = signal;
    return `分析以下代币数据并返回JSON：

代币: ${token.symbol} (${token.name})
价格: $${token.priceUsd.toFixed(10)}
24h涨幅: ${token.priceChange24h.toFixed(2)}%
市值: $${token.marketCap.toLocaleString()}
流动性: $${token.liquidityUsd.toLocaleString()}
24h交易量: $${token.volume24h.toLocaleString()}
持有者: ${token.holderCount.toLocaleString()}
是否新币: ${isNewToken}, 上线${ageHours.toFixed(1)}小时
信号类型: ${type}
数据来源: ${metrics.confirmingPlatforms.join(',')}
综合评分: ${signal.score}/100
初步风险: ${riskLevel}
风险因素: ${riskFactors.join(';')}`;
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
      aiModel: 'deepseek-chat'
    };
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
