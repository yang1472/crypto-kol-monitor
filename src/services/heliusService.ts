/**
 * Helius API 服务
 * 用于监控Solana钱包交易
 * Helius提供免费的API和Webhook支持
 */
import axios from 'axios';
import { Transaction, TokenInfo, ChainType } from '../types';

const HELIUS_API_BASE = 'https://api.helius.xyz/v0';

export class HeliusService {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * 获取钱包的交易历史
   */
  async getWalletTransactions(address: string, limit: number = 50): Promise<any[]> {
    try {
      const response = await axios.post(
        `${HELIUS_API_BASE}/addresses?api-key=${this.apiKey}`,
        { 
          query: address,
          limit 
        }
      );
      return response.data || [];
    } catch (error) {
      console.error(`获取钱包 ${address} 交易失败:`, error);
      return [];
    }
  }
  
  /**
   * 获取钱包的代币余额
   */
  async getTokenBalances(address: string): Promise<any[]> {
    try {
      const response = await axios.get(
        `${HELIUS_API_BASE}/addresses/${address}/balances?api-key=${this.apiKey}`
      );
      return response.data.tokens || [];
    } catch (error) {
      console.error(`获取钱包 ${address} 代币余额失败:`, error);
      return [];
    }
  }
  
  /**
   * 获取代币元数据
   */
  async getTokenMetadata(mintAddresses: string[]): Promise<any[]> {
    try {
      const response = await axios.post(
        `${HELIUS_API_BASE}/token-metadata?api-key=${this.apiKey}`,
        { mintAccounts: mintAddresses }
      );
      return response.data || [];
    } catch (error) {
      console.error('获取代币元数据失败:', error);
      return [];
    }
  }
  
  /**
   * 解析交易详情
   */
  async parseTransactions(txSignatures: string[]): Promise<any[]> {
    try {
      const response = await axios.post(
        `${HELIUS_API_BASE}/transactions/?api-key=${this.apiKey}`,
        { transactions: txSignatures }
      );
      return response.data || [];
    } catch (error) {
      console.error('解析交易失败:', error);
      return [];
    }
  }
  
  /**
   * 将Helius交易格式转换为内部格式
   */
  convertToTransaction(
    heliusTx: any, 
    kolId: string, 
    walletId: string
  ): Transaction | null {
    try {
      // 解析代币转账
      const tokenTransfers = heliusTx.tokenTransfers || [];
      const nativeTransfers = heliusTx.nativeTransfers || [];
      
      // 简化处理：只处理有代币转账的交易
      if (tokenTransfers.length === 0) return null;
      
      // 识别买入行为：用SOL/USDC买其他代币
      const isBuy = this.isBuyTransaction(tokenTransfers, nativeTransfers);
      const isSell = this.isSellTransaction(tokenTransfers, nativeTransfers);
      
      if (!isBuy && !isSell) return null;
      
      const type = isBuy ? 'buy' : 'sell';
      
      // 提取代币信息
      const { tokenIn, tokenOut, amountIn, amountOut, valueUsd } = 
        this.extractTokenInfo(tokenTransfers, nativeTransfers, type);
      
      if (!tokenIn || !tokenOut) return null;
      
      // 判断是否是新币（市值小或刚创建）
      const isNewToken = this.isNewToken(tokenOut);
      
      // 生成信号
      const { signal, confidence, analysis } = this.analyzeTransaction(
        type, tokenOut, valueUsd, isNewToken
      );
      
      return {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        txHash: heliusTx.signature,
        chain: 'solana',
        timestamp: new Date(heliusTx.timestamp * 1000).toISOString(),
        kolId,
        walletId,
        type,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        valueUsd,
        isNewToken,
        signal,
        confidence,
        analysis
      };
    } catch (error) {
      console.error('转换交易格式失败:', error);
      return null;
    }
  }
  
  private isBuyTransaction(tokenTransfers: any[], nativeTransfers: any[]): boolean {
    // 简化判断：如果有SOL/USDC转出，且收到其他代币，则视为买入
    const hasStableOrSolOut = tokenTransfers.some((t: any) => 
      ['USDC', 'USDT', 'SOL'].includes(t.tokenStandard) ||
      t.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC
    );
    return hasStableOrSolOut;
  }
  
  private isSellTransaction(tokenTransfers: any[], nativeTransfers: any[]): boolean {
    // 简化判断：如果有其他代币转出，且收到SOL/USDC，则视为卖出
    const hasStableOrSolIn = tokenTransfers.some((t: any) => 
      ['USDC', 'USDT', 'SOL'].includes(t.tokenStandard)
    );
    return hasStableOrSolIn;
  }
  
  private extractTokenInfo(
    tokenTransfers: any[], 
    nativeTransfers: any[],
    type: 'buy' | 'sell'
  ) {
    // 简化实现，实际需要更复杂的逻辑
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const solMint = 'So11111111111111111111111111111111111111112';
    
    let tokenIn: TokenInfo | undefined;
    let tokenOut: TokenInfo | undefined;
    let amountIn = '0';
    let amountOut = '0';
    let valueUsd: number | undefined;
    
    for (const transfer of tokenTransfers) {
      const token: TokenInfo = {
        address: transfer.mint,
        symbol: transfer.tokenStandard || 'UNKNOWN',
        name: transfer.tokenStandard || 'Unknown Token',
        decimals: transfer.tokenAmountDecimals || 9,
        chain: 'solana'
      };
      
      if (transfer.mint === usdcMint) {
        token.symbol = 'USDC';
        token.name = 'USD Coin';
        valueUsd = parseFloat(transfer.tokenAmount);
      }
      
      if (type === 'buy') {
        if (transfer.mint === usdcMint || transfer.mint === solMint) {
          tokenIn = token;
          amountIn = transfer.tokenAmount;
        } else {
          tokenOut = token;
          amountOut = transfer.tokenAmount;
        }
      } else {
        if (transfer.mint === usdcMint || transfer.mint === solMint) {
          tokenOut = token;
          amountOut = transfer.tokenAmount;
        } else {
          tokenIn = token;
          amountIn = transfer.tokenAmount;
        }
      }
    }
    
    return { tokenIn, tokenOut, amountIn, amountOut, valueUsd };
  }
  
  private isNewToken(token: TokenInfo): boolean {
    // 简化判断：符号为UNKNOWN或名称包含test的视为新币
    // 实际应该查询代币创建时间、市值等
    return token.symbol === 'UNKNOWN' || 
           token.name.toLowerCase().includes('test') ||
           token.name.toLowerCase().includes('meme');
  }
  
  private analyzeTransaction(
    type: 'buy' | 'sell',
    tokenOut: TokenInfo,
    valueUsd: number | undefined,
    isNewToken: boolean
  ): { signal: any; confidence: number; analysis: string } {
    let signal: any = 'neutral';
    let confidence = 50;
    let analysis = '';
    
    if (type === 'buy') {
      if (isNewToken && valueUsd && valueUsd > 1000) {
        signal = 'strong_buy';
        confidence = 85;
        analysis = `大资金(${valueUsd.toFixed(0)} USD)买入新币，可能是早期机会`;
      } else if (isNewToken) {
        signal = 'buy';
        confidence = 70;
        analysis = '买入新币，值得关注';
      } else if (valueUsd && valueUsd > 5000) {
        signal = 'buy';
        confidence = 75;
        analysis = `大额买入(${valueUsd.toFixed(0)} USD)，显示信心`;
      } else {
        signal = 'neutral';
        analysis = '常规买入操作';
      }
    } else {
      signal = 'sell';
      confidence = 60;
      analysis = '卖出操作，可能是获利了结';
    }
    
    return { signal, confidence, analysis };
  }
}
