import axios from 'axios';

// Serviço para buscar dados reais da B3 via Yahoo Finance
class StockAPI {
  constructor() {
    this.baseURL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
    this.cache = new Map();
    this.cacheExpiry = 60000; // 1 minuto de cache
  }

  // Converter ticker brasileiro para formato Yahoo Finance
  formatTicker(ticker) {
    // Ações brasileiras precisam do sufixo .SA
    return `${ticker}.SA`;
  }

  // Buscar dados de uma ação
  async fetchStockData(ticker) {
    try {
      // Verificar cache
      const cacheKey = ticker;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log(`📦 Cache hit: ${ticker}`);
        return cached.data;
      }

      const yahooTicker = this.formatTicker(ticker);
      const url = `${this.baseURL}${yahooTicker}?interval=1d&range=1mo`;

      console.log(`🔍 Buscando ${ticker}...`);
      const response = await axios.get(url);

      if (!response.data || !response.data.chart || !response.data.chart.result) {
        throw new Error('Dados inválidos da API');
      }

      const result = response.data.chart.result[0];
      const quote = result.indicators.quote[0];
      const meta = result.meta;

      // Extrair dados
      const prices = quote.close.filter(p => p !== null);
      const volumes = quote.volume.filter(v => v !== null);
      const highs = quote.high.filter(h => h !== null);
      const lows = quote.low.filter(l => l !== null);

      if (prices.length === 0) {
        throw new Error('Sem dados de preço disponíveis');
      }

      const currentPrice = prices[prices.length - 1];
      const previousPrice = prices[prices.length - 2] || currentPrice;
      const change = ((currentPrice - previousPrice) / previousPrice) * 100;

      // Calcular indicadores técnicos
      const indicators = this.calculateIndicators(prices, volumes, highs, lows);

      const stockData = {
        ticker,
        price: parseFloat(currentPrice.toFixed(2)),
        change: parseFloat(change.toFixed(2)),
        volume: volumes[volumes.length - 1] || 0,
        currency: meta.currency || 'BRL',
        exchangeName: meta.exchangeName || 'SAO',
        ...indicators,
        lastUpdate: new Date().toISOString(),
        dataSource: 'Yahoo Finance'
      };

      // Salvar no cache
      this.cache.set(cacheKey, {
        data: stockData,
        timestamp: Date.now()
      });

      console.log(`✅ ${ticker}: R$ ${currentPrice.toFixed(2)} (${change.toFixed(2)}%)`);
      return stockData;

    } catch (error) {
      console.error(`❌ Erro ao buscar ${ticker}:`, error.message);
      
      // Retornar dados simulados em caso de erro
      return this.getFallbackData(ticker);
    }
  }

  // Calcular indicadores técnicos
  calculateIndicators(prices, volumes, highs, lows) {
    const period14 = Math.min(14, prices.length);
    const period20 = Math.min(20, prices.length);
    const period50 = Math.min(50, prices.length);

    // RSI (14 períodos)
    const rsi = this.calculateRSI(prices, period14);

    // MACD (12, 26, 9)
    const macd = this.calculateMACD(prices);

    // ADX (14 períodos)
    const adx = this.calculateADX(highs, lows, prices, period14);

    // Médias Móveis
    const ma20 = this.calculateSMA(prices, period20);
    const ma50 = this.calculateSMA(prices, period50);

    // Bollinger Bands (20, 2)
    const bollinger = this.calculateBollingerBands(prices, period20, 2);

    // Suporte e Resistência
    const support = Math.min(...lows.slice(-20));
    const resistance = Math.max(...highs.slice(-20));

    return {
      rsi: parseFloat(rsi.toFixed(2)),
      macd: parseFloat(macd.toFixed(3)),
      adx: parseFloat(adx.toFixed(2)),
      ma20: parseFloat(ma20.toFixed(2)),
      ma50: parseFloat(ma50.toFixed(2)),
      bollingerUpper: parseFloat(bollinger.upper.toFixed(2)),
      bollingerLower: parseFloat(bollinger.lower.toFixed(2)),
      support: parseFloat(support.toFixed(2)),
      resistance: parseFloat(resistance.toFixed(2))
    };
  }

  // Calcular RSI
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  // Calcular MACD
  calculateMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    return ema12 - ema26;
  }

  // Calcular EMA
  calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  // Calcular SMA
  calculateSMA(prices, period) {
    if (prices.length < period) {
      period = prices.length;
    }
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b) / slice.length;
  }

  // Calcular ADX
  calculateADX(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return 25;

    let dmPlus = 0;
    let dmMinus = 0;
    let tr = 0;

    for (let i = Math.max(1, highs.length - period); i < highs.length; i++) {
      const highDiff = highs[i] - highs[i - 1];
      const lowDiff = lows[i - 1] - lows[i];

      dmPlus += (highDiff > lowDiff && highDiff > 0) ? highDiff : 0;
      dmMinus += (lowDiff > highDiff && lowDiff > 0) ? lowDiff : 0;

      const tr1 = highs[i] - lows[i];
      const tr2 = Math.abs(highs[i] - closes[i - 1]);
      const tr3 = Math.abs(lows[i] - closes[i - 1]);
      tr += Math.max(tr1, tr2, tr3);
    }

    const diPlus = (dmPlus / tr) * 100;
    const diMinus = (dmMinus / tr) * 100;
    const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;

    return dx || 25;
  }

  // Calcular Bollinger Bands
  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    const sma = this.calculateSMA(prices, period);
    const slice = prices.slice(-Math.min(period, prices.length));
    
    const variance = slice.reduce((sum, price) => {
      return sum + Math.pow(price - sma, 2);
    }, 0) / slice.length;
    
    const std = Math.sqrt(variance);

    return {
      middle: sma,
      upper: sma + (std * stdDev),
      lower: sma - (std * stdDev)
    };
  }

  // Dados de fallback em caso de erro
  getFallbackData(ticker) {
    console.log(`⚠️ Usando dados simulados para ${ticker}`);
    
    const basePrice = Math.random() * 80 + 10;
    return {
      ticker,
      price: parseFloat(basePrice.toFixed(2)),
      change: (Math.random() - 0.5) * 6,
      volume: Math.floor(Math.random() * 5000000) + 500000,
      rsi: parseFloat((Math.random() * 100).toFixed(2)),
      macd: parseFloat(((Math.random() - 0.5) * 3).toFixed(3)),
      adx: parseFloat((Math.random() * 60 + 10).toFixed(2)),
      ma20: parseFloat((basePrice * (0.95 + Math.random() * 0.1)).toFixed(2)),
      ma50: parseFloat((basePrice * (0.90 + Math.random() * 0.15)).toFixed(2)),
      bollingerUpper: parseFloat((basePrice * 1.15).toFixed(2)),
      bollingerLower: parseFloat((basePrice * 0.85).toFixed(2)),
      support: parseFloat((basePrice * 0.92).toFixed(2)),
      resistance: parseFloat((basePrice * 1.08).toFixed(2)),
      dataSource: 'Simulado',
      lastUpdate: new Date().toISOString()
    };
  }

  // Buscar múltiplas ações
  async fetchMultipleStocks(tickers) {
    console.log(`🔄 Buscando ${tickers.length} ações...`);
    
    const promises = tickers.map(ticker => 
      this.fetchStockData(ticker).catch(error => {
        console.error(`Erro em ${ticker}:`, error.message);
        return this.getFallbackData(ticker);
      })
    );

    const results = await Promise.all(promises);
    console.log(`✅ ${results.length} ações carregadas`);
    
    return results;
  }

  // Limpar cache
  clearCache() {
    this.cache.clear();
    console.log('🗑️ Cache limpo');
  }
}

// Exportar instância única
export default new StockAPI();