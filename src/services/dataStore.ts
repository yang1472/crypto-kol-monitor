/**
 * 数据存储服务
 * 使用JSON文件存储KOL信息和监控数据
 */
import * as fs from 'fs';
import * as path from 'path';
import { Kol, Wallet, SocialAccount, Transaction, SocialPost, BuyRecommendation, UserConfig } from '../types';

const DATA_DIR = path.join(__dirname, '../data');
const KOLS_FILE = path.join(DATA_DIR, 'kols.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const SOCIAL_POSTS_FILE = path.join(DATA_DIR, 'social_posts.json');
const RECOMMENDATIONS_FILE = path.join(DATA_DIR, 'recommendations.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 初始化文件
function initFile(filePath: string, defaultContent: any = []) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2), 'utf-8');
  }
}

initFile(KOLS_FILE, []);
initFile(TRANSACTIONS_FILE, []);
initFile(SOCIAL_POSTS_FILE, []);
initFile(RECOMMENDATIONS_FILE, []);
initFile(CONFIG_FILE, {});

// ============ KOL 管理 ============

export function getAllKols(): Kol[] {
  const data = fs.readFileSync(KOLS_FILE, 'utf-8');
  return JSON.parse(data);
}

export function getKolById(id: string): Kol | null {
  const kols = getAllKols();
  return kols.find(k => k.id === id) || null;
}

export function addKol(kol: Kol): void {
  const kols = getAllKols();
  // 检查是否已存在
  const existingIndex = kols.findIndex(k => k.id === kol.id);
  if (existingIndex >= 0) {
    kols[existingIndex] = { ...kol, updatedAt: new Date().toISOString() };
  } else {
    kols.push(kol);
  }
  fs.writeFileSync(KOLS_FILE, JSON.stringify(kols, null, 2), 'utf-8');
}

export function updateKol(id: string, updates: Partial<Kol>): Kol | null {
  const kols = getAllKols();
  const index = kols.findIndex(k => k.id === id);
  if (index === -1) return null;
  
  kols[index] = { 
    ...kols[index], 
    ...updates, 
    updatedAt: new Date().toISOString() 
  };
  fs.writeFileSync(KOLS_FILE, JSON.stringify(kols, null, 2), 'utf-8');
  return kols[index];
}

export function deleteKol(id: string): boolean {
  const kols = getAllKols();
  const filtered = kols.filter(k => k.id !== id);
  if (filtered.length === kols.length) return false;
  fs.writeFileSync(KOLS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

// ============ 钱包管理 ============

export function addWallet(kolId: string, wallet: { address: string; chain: string; label?: string }): boolean {
  const kol = getKolById(kolId);
  if (!kol) return false;
  
  const newWallet: Wallet = {
    id: `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    address: wallet.address,
    chain: wallet.chain as any,
    label: wallet.label || '',
    isActive: true,
    addedAt: new Date().toISOString()
  };
  
  kol.wallets.push(newWallet);
  updateKol(kolId, { wallets: kol.wallets });
  return true;
}

export function getActiveWallets() {
  const kols = getAllKols();
  const wallets: Array<{ kolId: string; kolName: string; wallet: any }> = [];
  
  for (const kol of kols) {
    for (const wallet of kol.wallets) {
      if (wallet.isActive) {
        wallets.push({ kolId: kol.id, kolName: kol.name, wallet });
      }
    }
  }
  return wallets;
}

// ============ 社交账号管理 ============

export function addSocialAccount(kolId: string, social: { platform: string; username: string; url?: string }): boolean {
  const kol = getKolById(kolId);
  if (!kol) return false;
  
  const newSocial: SocialAccount = {
    id: `social_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    platform: social.platform as any,
    username: social.username,
    url: social.url || '',
    isActive: true,
    addedAt: new Date().toISOString()
  };
  
  kol.socials.push(newSocial);
  updateKol(kolId, { socials: kol.socials });
  return true;
}

// ============ 交易记录管理 ============

export function saveTransaction(tx: Transaction): void {
  const txs = getAllTransactions();
  // 检查是否已存在
  if (!txs.find(t => t.txHash === tx.txHash && t.chain === tx.chain)) {
    txs.push(tx);
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(txs, null, 2), 'utf-8');
  }
}

export function getAllTransactions(): Transaction[] {
  const data = fs.readFileSync(TRANSACTIONS_FILE, 'utf-8');
  return JSON.parse(data);
}

export function getRecentTransactions(hours: number = 24): Transaction[] {
  const txs = getAllTransactions();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return txs.filter(t => new Date(t.timestamp) > cutoff);
}

// ============ 推荐管理 ============

export function saveRecommendation(rec: BuyRecommendation): void {
  const recs = getAllRecommendations();
  recs.push(rec);
  fs.writeFileSync(RECOMMENDATIONS_FILE, JSON.stringify(recs, null, 2), 'utf-8');
}

export function getAllRecommendations(): BuyRecommendation[] {
  const data = fs.readFileSync(RECOMMENDATIONS_FILE, 'utf-8');
  return JSON.parse(data);
}

export function getPendingRecommendations(): BuyRecommendation[] {
  return getAllRecommendations().filter(r => r.status === 'pending');
}

export function updateRecommendationStatus(id: string, status: BuyRecommendation['status']): boolean {
  const recs = getAllRecommendations();
  const index = recs.findIndex(r => r.id === id);
  if (index === -1) return false;
  recs[index].status = status;
  fs.writeFileSync(RECOMMENDATIONS_FILE, JSON.stringify(recs, null, 2), 'utf-8');
  return true;
}

// ============ 配置管理 ============

export function getConfig(): UserConfig {
  const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
  const saved = JSON.parse(data);
  return {
    monitorIntervalMinutes: 5,
    minConfidenceThreshold: 60,
    ...saved
  };
}

export function saveConfig(config: Partial<UserConfig>): void {
  const current = getConfig();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...config }, null, 2), 'utf-8');
}

// ============ 数据统计 ============

export function getStats() {
  const kols = getAllKols();
  return {
    totalKols: kols.length,
    totalWallets: kols.reduce((sum, k) => sum + k.wallets.length, 0),
    totalSocials: kols.reduce((sum, k) => sum + k.socials.length, 0),
    totalTransactions: getAllTransactions().length,
    pendingRecommendations: getPendingRecommendations().length
  };
}
