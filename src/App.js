import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Bell, AlertTriangle, Target, Plus, X, Volume2, Zap, DollarSign, Shield, RefreshCw } from 'lucide-react';

const TradingSystem = () => {
  const [selectedStock, setSelectedStock] = useState('');
  const [watchlist, setWatchlist] = useState([]);
  const [topOpportunities, setTopOpportunities] = useState([]);
  const [stocksData, setStocksData] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [addStockInput, setAddStockInput] = useState('');
  const [timeframe, setTimeframe] = useState('daily');
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });

  const top30Liquid = [
    'PETR4', 'VALE3', 'ITUB4', 'BBDC4', 'ABEV3', 'BBAS3', 'B3SA3', 'WEGE3', 'RENT3', 'MGLU3',
    'ITSA4', 'HAPV3', 'ELET3', 'SUZB3', 'RADL3', 'RAIL3', 'JBSS3', 'EMBR3', 'PRIO3', 'UGPA3',
    'CSAN3', 'GGBR4', 'VIVT3', 'GOAU4', 'CSNA3', 'ENBR3', 'ENEV3', 'CPLE6', 'SBSP3', 'LREN3'
  ];

  // 💾 CARREGAR DADOS SALVOS AO INICIAR
  useEffect(() => {
    try {
      // Carregar watchlist salva
      const savedWatchlist = localStorage.getItem('tradingB3_watchlist');
      if (savedWatchlist) {
        const parsed = JSON.parse(savedWatchlist);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWatchlist(parsed);
        }
      }

      // Carregar ação selecionada
      const savedStock = localStorage.getItem('tradingB3_selectedStock');
      if (savedStock) {
        setSelectedStock(savedStock);
      }

      // Carregar timeframe
      const savedTimeframe = localStorage.getItem('tradingB3_timeframe');
      if (savedTimeframe) {
        setTimeframe(savedTimeframe);
      }

      // Carregar auto-refresh
      const savedAutoRefresh = localStorage.getItem('tradingB3_autoRefresh');
      if (savedAutoRefresh !== null) {
        setAutoRefresh(savedAutoRefresh === 'true');
      }
    } catch (error) {
      console.error('Erro ao carregar dados salvos:', error);
    }
  }, []);

  // 💾 SALVAR WATCHLIST AUTOMATICAMENTE (removido - agora salva direto nas funções)
  // useEffect foi removido para evitar loops

  // 💾 SALVAR AÇÃO SELECIONADA
  useEffect(() => {
    if (selectedStock) {
      try {
        localStorage.setItem('tradingB3_selectedStock', selectedStock);
      } catch (error) {
        console.error('Erro ao salvar ação selecionada:', error);
      }
    }
  }, [selectedStock]);

  // 💾 SALVAR TIMEFRAME
  useEffect(() => {
    try {
      localStorage.setItem('tradingB3_timeframe', timeframe);
    } catch (error) {
      console.error('Erro ao salvar timeframe:', error);
    }
  }, [timeframe]);

  // 💾 SALVAR AUTO-REFRESH
  useEffect(() => {
    try {
      localStorage.setItem('tradingB3_autoRefresh', autoRefresh.toString());
    } catch (error) {
      console.error('Erro ao salvar auto-refresh:', error);
    }
  }, [autoRefresh]);

  // API para buscar dados reais
  const api = {
    cache: new Map(),
    cacheExpiry: 60000,

    formatTicker(ticker) {
      return `${ticker}.SA`;
    },

    async fetchStockData(ticker) {
      try {
        const cacheKey = ticker;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.data;
        }

        const yahooTicker = this.formatTicker(ticker);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1mo`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data?.chart?.result || data.chart.result.length === 0) {
          throw new Error('Dados inválidos da API');
        }

        const result = data.chart.result[0];
        const quote = result.indicators.quote[0];
        const meta = result.meta;

        const prices = quote.close.filter(p => p !== null);
        const volumes = quote.volume.filter(v => v !== null);
        const highs = quote.high.filter(h => h !== null);
        const lows = quote.low.filter(l => l !== null);

        if (prices.length === 0) {
          throw new Error('Sem dados de preço');
        }

        const currentPrice = prices[prices.length - 1];
        const previousPrice = prices[prices.length - 2] || currentPrice;
        const change = ((currentPrice - previousPrice) / previousPrice) * 100;

        const indicators = this.calculateIndicators(prices, volumes, highs, lows);

        const stockData = {
          ticker,
          price: parseFloat(currentPrice.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          volume: volumes[volumes.length - 1] || 0,
          liquidityRank: top30Liquid.indexOf(ticker) + 1 || 31,
          ...indicators,
          lastUpdate: new Date().toISOString(),
          dataSource: 'Yahoo Finance',
          historicalData: this.formatHistoricalData(
            result.timestamp,
            prices,
            volumes
          )
        };

        this.cache.set(cacheKey, {
          data: stockData,
          timestamp: Date.now()
        });

        return stockData;
      } catch (error) {
        console.error(`Erro ao buscar ${ticker}:`, error.message);
        return this.getFallbackData(ticker);
      }
    },

    formatHistoricalData(timestamps, prices, volumes) {
      return timestamps.map((timestamp, index) => ({
        timestamp,
        date: new Date(timestamp * 1000).toLocaleDateString('pt-BR'),
        price: prices[index],
        volume: volumes[index]
      })).filter(d => d.price !== null);
    },

    calculateIndicators(prices, volumes, highs, lows) {
      const period14 = Math.min(14, prices.length);
      const period20 = Math.min(20, prices.length);
      const period50 = Math.min(50, prices.length);

      const rsi = this.calculateRSI(prices, period14);
      const macd = this.calculateMACD(prices);
      const adx = this.calculateADX(highs, lows, prices, period14);
      const ma20 = this.calculateSMA(prices, period20);
      const ma50 = this.calculateSMA(prices, period50);
      const bollinger = this.calculateBollingerBands(prices, period20, 2);
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
    },

    calculateRSI(prices, period = 14) {
      if (prices.length < period + 1) return 50;
      let gains = 0, losses = 0;
      for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
    },

    calculateMACD(prices) {
      const ema12 = this.calculateEMA(prices, 12);
      const ema26 = this.calculateEMA(prices, 26);
      return ema12 - ema26;
    },

    calculateEMA(prices, period) {
      if (prices.length < period) return prices[prices.length - 1];
      const multiplier = 2 / (period + 1);
      let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
      for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
      }
      return ema;
    },

    calculateSMA(prices, period) {
      if (prices.length < period) period = prices.length;
      const slice = prices.slice(-period);
      return slice.reduce((a, b) => a + b) / slice.length;
    },

    calculateADX(highs, lows, closes, period = 14) {
      if (highs.length < period + 1) return 25;
      let dmPlus = 0, dmMinus = 0, tr = 0;
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
    },

    calculateBollingerBands(prices, period = 20, stdDev = 2) {
      const sma = this.calculateSMA(prices, period);
      const slice = prices.slice(-Math.min(period, prices.length));
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / slice.length;
      const std = Math.sqrt(variance);
      return {
        middle: sma,
        upper: sma + (std * stdDev),
        lower: sma - (std * stdDev)
      };
    },

    getFallbackData(ticker) {
      const basePrice = Math.random() * 80 + 10;
      return {
        ticker,
        price: parseFloat(basePrice.toFixed(2)),
        change: (Math.random() - 0.5) * 6,
        volume: Math.floor(Math.random() * 5000000) + 500000,
        liquidityRank: top30Liquid.indexOf(ticker) + 1 || 31,
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
        lastUpdate: new Date().toISOString(),
        historicalData: []
      };
    }
  };

  const calculateScore = (data) => {
    let score = 0;
    if (data.rsi >= 50 && data.rsi <= 70) score += 30;
    else if (data.rsi < 30) score += 25;
    else if (data.rsi > 70 && data.rsi < 85) score += 15;
    if (data.macd > 0.2) score += 20;
    else if (data.macd > 0) score += 10;
    if (data.adx > 40) score += 15;
    else if (data.adx > 25) score += 10;
    if (data.price > data.ma20 && data.price > data.ma50) score += 25;
    else if (data.price > data.ma20) score += 15;
    const bbPosition = (data.price - data.bollingerLower) / (data.bollingerUpper - data.bollingerLower);
    if (bbPosition < 0.3) score += 10;
    else if (bbPosition > 0.7) score -= 10;
    return Math.max(0, Math.min(100, score));
  };

  const calculateEntryExit = (data, timeframe) => {
    if (!data || !data.price) {
      return {
        entry: [{ price: 0, reason: 'Aguardando dados...', distance: 0, probability: 0 }],
        exit: [{ price: 0, reason: 'Aguardando dados...', distance: 0, probability: 0 }],
        stopLoss: 0
      };
    }

    const entryPoints = [];
    const exitPoints = [];

    // Configuração ULTRA CONSERVADORA - alvos realistas por timeframe
    const timeframeConfig = {
      daily: { 
        multiplier: 1, 
        stopDistance: 0.97, 
        rsiOversold: 30,
        rsiOverbought: 70,
        maxTargetDistance: 0.025, // 2.5% MÁXIMO para diário
        conservativeTarget: 0.015, // 1.5% conservador
        realisticTarget: 0.02, // 2% realista
        adxMinimum: 25
      },
      weekly: { 
        multiplier: 1.5, 
        stopDistance: 0.95, 
        rsiOversold: 32,
        rsiOverbought: 68,
        maxTargetDistance: 0.06, // 6% máximo semanal
        conservativeTarget: 0.035, // 3.5% conservador
        realisticTarget: 0.045, // 4.5% realista
        adxMinimum: 23
      },
      monthly: { 
        multiplier: 2.5, 
        stopDistance: 0.92, 
        rsiOversold: 35,
        rsiOverbought: 65,
        maxTargetDistance: 0.12, // 12% máximo mensal
        conservativeTarget: 0.07, // 7% conservador
        realisticTarget: 0.09, // 9% realista
        adxMinimum: 20
      },
      yearly: { 
        multiplier: 4, 
        stopDistance: 0.88, 
        rsiOversold: 38,
        rsiOverbought: 62,
        maxTargetDistance: 0.25, // 25% máximo anual
        conservativeTarget: 0.15, // 15% conservador
        realisticTarget: 0.20, // 20% realista
        adxMinimum: 18
      }
    };

    const config = timeframeConfig[timeframe];
    const calcDistance = (targetPrice) => ((targetPrice - data.price) / data.price) * 100;
    
    // Calcular probabilidade REALISTA baseada em múltiplos indicadores
    const calculateProbability = (targetPrice, isEntry = false) => {
      let probability = 40; // Base mais baixa: 40%
      const distance = Math.abs(calcDistance(targetPrice));
      
      // Penalizar MUITO alvos distantes
      if (distance < 1) probability += 30;
      else if (distance < 2) probability += 20;
      else if (distance < 3) probability += 10;
      else if (distance < 5) probability += 5;
      else if (distance > 8) probability -= 25;
      else if (distance > 5) probability -= 15;
      
      if (isEntry) {
        // Para entradas
        if (data.rsi < 30) probability += 20;
        else if (data.rsi < 40) probability += 12;
        else if (data.rsi > 70) probability -= 20;
        
        if (data.macd > 0.1) probability += 12;
        else if (data.macd > 0) probability += 6;
        else if (data.macd < -0.2) probability -= 15;
        
        if (data.adx > 40) probability += 12;
        else if (data.adx > 30) probability += 6;
        else if (data.adx < 20) probability -= 12;
        
        if (data.price < data.ma20 && data.price < data.ma50) probability += 8;
        
        // Bônus se está perto do suporte
        const distToSupport = Math.abs(((data.price - data.support) / data.support) * 100);
        if (distToSupport < 2) probability += 10;
        
      } else {
        // Para saídas - MUITO mais rigoroso
        if (data.rsi > 70) probability += 15;
        else if (data.rsi > 60) probability += 8;
        else if (data.rsi < 50) probability -= 15;
        
        if (data.macd > 0.3) probability += 12;
        else if (data.macd > 0.1) probability += 6;
        else if (data.macd < 0) probability -= 20;
        
        if (data.adx > 45) probability += 12;
        else if (data.adx > 35) probability += 6;
        else if (data.adx < 25) probability -= 20;
        
        if (data.price > data.ma20 && data.price > data.ma50) probability += 8;
        else probability -= 10;
      }
      
      return Math.max(10, Math.min(92, probability));
    };

    // PONTOS DE ENTRADA - Conservadores e ABAIXO do preço atual
    
    // 1. Entrada em suporte forte (sempre ABAIXO do preço)
    if (data.rsi < config.rsiOversold + 15) {
      const supportEntry = Math.min(data.support * 1.003, data.price * 0.99); // Máx 1% abaixo
      const distanceCalc = calcDistance(supportEntry);
      
      if (distanceCalc < 0) { // Garantir que está ABAIXO
        const prob = calculateProbability(supportEntry, true);
        if (prob >= 65) {
          entryPoints.push({ 
            price: supportEntry, 
            reason: `Suporte (RSI ${data.rsi.toFixed(1)})`, 
            distance: distanceCalc,
            probability: prob
          });
        }
      }
    }

    // 2. Entrada na MA20 (só se MA20 estiver ABAIXO do preço)
    if (data.macd > 0 && data.ma20 < data.price && data.price > data.ma50 && data.adx > config.adxMinimum) {
      const ma20Entry = data.ma20 * 0.997;
      const distanceCalc = calcDistance(ma20Entry);
      
      if (distanceCalc < 0) { // Garantir que está ABAIXO
        const prob = calculateProbability(ma20Entry, true);
        if (prob >= 65) {
          entryPoints.push({ 
            price: ma20Entry, 
            reason: `Pullback MA20`, 
            distance: distanceCalc,
            probability: prob
          });
        }
      }
    }

    // 3. Entrada na banda inferior (só se banda estiver ABAIXO)
    if (data.bollingerLower < data.price) {
      const bbLowerEntry = data.bollingerLower * 1.008;
      const distanceCalc = calcDistance(bbLowerEntry);
      
      if (distanceCalc < 0 && Math.abs(distanceCalc) < 8) { // ABAIXO e não muito longe
        const bbLowerProb = calculateProbability(bbLowerEntry, true);
        if (bbLowerProb >= 65) {
          entryPoints.push({ 
            price: bbLowerEntry, 
            reason: `Banda inferior`, 
            distance: distanceCalc,
            probability: bbLowerProb
          });
        }
      }
    }

    // PONTOS DE SAÍDA - SEMPRE ACIMA do preço atual
    
    // 1. Alvo ULTRA conservador (sempre ACIMA)
    const ultraConservativeTarget = data.price * (1 + config.conservativeTarget);
    const ultraDist = calcDistance(ultraConservativeTarget);
    const ultraProb = calculateProbability(ultraConservativeTarget, false);
    
    if (ultraDist > 0 && ultraProb >= 70) { // Garantir que está ACIMA
      exitPoints.push({ 
        price: ultraConservativeTarget, 
        reason: `Alvo conservador ${(config.conservativeTarget * 100).toFixed(1)}%`, 
        distance: ultraDist,
        probability: ultraProb
      });
    }

    // 2. Alvo realista (sempre ACIMA)
    const realisticTarget = data.price * (1 + config.realisticTarget);
    const realisticDist = calcDistance(realisticTarget);
    const realisticProb = calculateProbability(realisticTarget, false);
    
    if (realisticDist > 0 && realisticProb >= 65 && data.macd > 0) { // ACIMA
      exitPoints.push({ 
        price: realisticTarget, 
        reason: `Alvo realista ${(config.realisticTarget * 100).toFixed(1)}%`, 
        distance: realisticDist,
        probability: realisticProb
      });
    }

    // 3. Resistência próxima (só se estiver ACIMA)
    const resistanceDistance = calcDistance(data.resistance);
    if (resistanceDistance > 0 && resistanceDistance <= config.maxTargetDistance * 100 && data.resistance > data.price) {
      const resistanceProb = calculateProbability(data.resistance, false);
      
      if (resistanceProb >= 65) {
        exitPoints.push({ 
          price: data.resistance, 
          reason: `Resistência técnica`, 
          distance: resistanceDistance,
          probability: resistanceProb
        });
      }
    }

    // 4. Alvo por tendência forte (sempre ACIMA)
    if (data.adx > 40 && data.macd > 0.15 && data.rsi > 55 && data.rsi < 75) {
      const strongTrendTarget = data.price * (1 + (config.realisticTarget * 1.15));
      const trendDist = calcDistance(strongTrendTarget);
      const trendProb = calculateProbability(strongTrendTarget, false);
      
      if (trendDist > 0 && trendProb >= 65 && trendDist <= config.maxTargetDistance * 100) {
        exitPoints.push({ 
          price: strongTrendTarget, 
          reason: `Tendência forte (ADX ${data.adx.toFixed(1)})`, 
          distance: trendDist,
          probability: trendProb
        });
      }
    }

    // 5. Alvo mínimo de risco-retorno (sempre ACIMA)
    const stopLoss = data.support * config.stopDistance;
    const riskAmount = data.price - stopLoss;
    const rrTarget = data.price + (riskAmount * 1.5);
    const rrDistance = calcDistance(rrTarget);
    const rrProb = calculateProbability(rrTarget, false);
    
    if (rrDistance > 0 && rrProb >= 65 && rrDistance <= config.maxTargetDistance * 100) {
      exitPoints.push({ 
        price: rrTarget, 
        reason: `R/R 1.5:1`, 
        distance: rrDistance,
        probability: rrProb
      });
    }

    // Filtrar RIGOROSAMENTE
    // ENTRADAS: devem estar ABAIXO do preço (distância negativa)
    const validEntries = entryPoints
      .filter(e => e.distance < 0 && e.probability >= 65 && Math.abs(e.distance) < 12)
      .sort((a, b) => b.probability - a.probability);
    
    // SAÍDAS: devem estar ACIMA do preço (distância positiva)
    const validExits = exitPoints
      .filter(e => e.distance > 0 && e.probability >= 65 && e.distance <= config.maxTargetDistance * 100)
      .sort((a, b) => b.probability - a.probability);

    // Se não houver saídas válidas, criar um micro-alvo garantidamente ACIMA
    if (validExits.length === 0) {
      const microTarget = data.price * (1 + config.conservativeTarget * 0.7);
      const microDist = calcDistance(microTarget);
      const microProb = calculateProbability(microTarget, false);
      
      if (microDist > 0) { // Garantir que está ACIMA
        validExits.push({
          price: microTarget,
          reason: `Alvo mínimo ${((config.conservativeTarget * 0.7) * 100).toFixed(1)}%`,
          distance: microDist,
          probability: Math.max(microProb, 70)
        });
      }
    }

    // Se ainda não houver entradas, criar uma no preço atual menos 1%
    if (validEntries.length === 0) {
      const currentEntry = data.price * 0.99;
      validEntries.push({
        price: currentEntry,
        reason: 'Entrada próxima ao preço atual',
        distance: -1,
        probability: 60
      });
    }

    return {
      entry: validEntries.slice(0, 3), // Máximo 3 entradas
      exit: validExits.slice(0, 3), // Máximo 3 saídas
      stopLoss
    };
  };

  const loadStocksData = async (tickers) => {
    setLoading(true);
    setLoadingProgress({ current: 0, total: tickers.length });
    
    try {
      const newData = {};
      
      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        setLoadingProgress({ current: i + 1, total: tickers.length });
        
        const result = await api.fetchStockData(ticker);
        if (result) newData[result.ticker] = result;
        
        // Pequeno delay para não sobrecarregar a API
        if (i < tickers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      setStocksData(newData);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
      setLoadingProgress({ current: 0, total: 0 });
    }
  };

  useEffect(() => {
    // Só carregar se não houver watchlist salva
    const savedWatchlist = localStorage.getItem('tradingB3_watchlist');
    if (!savedWatchlist || savedWatchlist === '[]') {
      loadStocksData(top30Liquid);
    } else {
      // Carregar watchlist salva + top 30 para ter dados completos
      const parsed = JSON.parse(savedWatchlist);
      const allTickers = [...new Set([...parsed, ...top30Liquid])];
      loadStocksData(allTickers);
    }
  }, []);

  useEffect(() => {
    if (Object.keys(stocksData).length === 0) return;
    
    const allStocksWithScore = Object.entries(stocksData)
      .map(([ticker, data]) => ({ ticker, score: calculateScore(data), ...data }))
      .sort((a, b) => {
        const scoreWeight = 0.7;
        const liquidityWeight = 0.3;
        const aRank = (a.score * scoreWeight) + ((31 - a.liquidityRank) * liquidityWeight);
        const bRank = (b.score * scoreWeight) + ((31 - b.liquidityRank) * liquidityWeight);
        return bRank - aRank;
      });

    let opportunities = allStocksWithScore.filter(stock => stock.score >= 70).slice(0, 5);
    if (opportunities.length < 5) {
      const remaining = 5 - opportunities.length;
      const additionalStocks = allStocksWithScore
        .filter(stock => !opportunities.some(opp => opp.ticker === stock.ticker))
        .slice(0, remaining);
      opportunities = [...opportunities, ...additionalStocks];
    }

    setTopOpportunities(opportunities);
    const topTickers = opportunities.map(opp => opp.ticker);
    setWatchlist(topTickers);
    
    if (!selectedStock && topTickers.length > 0) {
      setSelectedStock(topTickers[0]);
    }
  }, [stocksData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      const allTickers = [...new Set([...top30Liquid, ...watchlist])];
      loadStocksData(allTickers);
    }, 120000); // Atualiza a cada 2 minutos
    return () => clearInterval(interval);
  }, [autoRefresh, watchlist]);

  const calculateSignals = (data, timeframe = 'daily') => {
    if (!data || !data.price) {
      return { entry: [], exit: [], warnings: [], score: 0 };
    }
    
    const signals = { entry: [], exit: [], warnings: [], score: calculateScore(data) };
    
    // Configuração de thresholds por timeframe
    const thresholds = {
      daily: { rsiOversold: 30, rsiOverbought: 70, adxStrong: 35, macdStrong: 0.15 },
      weekly: { rsiOversold: 32, rsiOverbought: 68, adxStrong: 30, macdStrong: 0.12 },
      monthly: { rsiOversold: 35, rsiOverbought: 65, adxStrong: 28, macdStrong: 0.10 },
      yearly: { rsiOversold: 38, rsiOverbought: 62, adxStrong: 25, macdStrong: 0.08 }
    };
    
    const config = thresholds[timeframe] || thresholds.daily;
    
    // SINAIS DE ENTRADA (Positivos)
    
    // RSI Analysis
    if (data.rsi != null) {
      if (data.rsi < config.rsiOversold - 5) {
        signals.entry.push(`RSI extremamente oversold (${data.rsi.toFixed(1)}) - forte oportunidade`);
      } else if (data.rsi < config.rsiOversold) {
        signals.entry.push(`RSI oversold (${data.rsi.toFixed(1)}) - oportunidade de compra`);
      } else if (data.rsi >= 45 && data.rsi <= 60) {
        signals.entry.push(`RSI em zona favorável (${data.rsi.toFixed(1)}) para ${timeframe}`);
      }
      
      // RSI Warnings
      if (data.rsi > config.rsiOverbought + 10) {
        signals.warnings.push(`RSI extremamente overbought (${data.rsi.toFixed(1)}) - correção iminente`);
      } else if (data.rsi > config.rsiOverbought) {
        signals.warnings.push(`RSI overbought (${data.rsi.toFixed(1)}) - aguardar correção para ${timeframe}`);
      }
      
      // RSI Exit Signals
      if (data.rsi > config.rsiOverbought + 15) {
        signals.exit.push(`RSI crítico (${data.rsi.toFixed(1)}) - realizar lucros urgente`);
      } else if (data.rsi > config.rsiOverbought + 5) {
        signals.exit.push(`RSI muito alto (${data.rsi.toFixed(1)}) - considerar saída`);
      }
    }
    
    // MACD Analysis
    if (data.macd != null) {
      if (data.macd > config.macdStrong) {
        signals.entry.push(`MACD positivo forte (${data.macd.toFixed(3)}) - momentum altista`);
      } else if (data.macd > config.macdStrong * 0.5) {
        signals.entry.push(`MACD positivo (${data.macd.toFixed(3)}) - tendência de alta`);
      } else if (data.macd > 0 && data.macd < config.macdStrong * 0.5) {
        signals.entry.push(`MACD levemente positivo (${data.macd.toFixed(3)}) - início de alta`);
      }
      
      // MACD Warnings
      if (data.macd < 0 && data.macd > -config.macdStrong * 0.5) {
        signals.warnings.push(`MACD levemente negativo (${data.macd.toFixed(3)}) - possível reversão`);
      }
      
      // MACD Exit Signals
      if (data.macd < -config.macdStrong) {
        signals.exit.push(`MACD fortemente negativo (${data.macd.toFixed(3)}) - tendência de baixa`);
      } else if (data.macd < -config.macdStrong * 0.5) {
        signals.exit.push(`MACD negativo (${data.macd.toFixed(3)}) - momentum baixista`);
      }
    }
    
    // ADX Analysis
    if (data.adx != null) {
      if (data.adx > config.adxStrong + 10) {
        signals.entry.push(`Tendência muito forte (ADX ${data.adx.toFixed(1)}) - ${timeframe}`);
      } else if (data.adx > config.adxStrong) {
        signals.entry.push(`Tendência forte estabelecida (ADX ${data.adx.toFixed(1)})`);
      } else if (data.adx > config.adxStrong - 5) {
        signals.entry.push(`Tendência moderada (ADX ${data.adx.toFixed(1)})`);
      }
      
      // ADX Warnings
      if (data.adx < 20) {
        signals.warnings.push(`Tendência fraca (ADX ${data.adx.toFixed(1)}) - mercado lateral`);
      } else if (data.adx < config.adxStrong - 10) {
        signals.warnings.push(`ADX baixo (${data.adx.toFixed(1)}) - tendência não definida`);
      }
      
      // ADX with negative MACD
      if (data.adx > config.adxStrong && data.macd != null && data.macd < 0) {
        signals.exit.push(`Tendência forte de baixa (ADX ${data.adx.toFixed(1)} + MACD negativo)`);
      }
    }
    
    // Moving Averages Analysis
    if (data.price != null && data.ma20 != null && data.ma50 != null) {
      if (data.price > data.ma20 && data.price > data.ma50) {
        const distMa20 = ((data.price - data.ma20) / data.ma20) * 100;
        const distMa50 = ((data.price - data.ma50) / data.ma50) * 100;
        signals.entry.push(`Preço acima MA20 (+${distMa20.toFixed(1)}%) e MA50 (+${distMa50.toFixed(1)}%)`);
      } else if (data.price > data.ma20) {
        const distMa20 = ((data.price - data.ma20) / data.ma20) * 100;
        signals.entry.push(`Preço acima MA20 (+${distMa20.toFixed(1)}%)`);
      }
      
      // Moving Averages Exit Signals
      if (data.price < data.ma20 && data.price < data.ma50) {
        const distMa20 = ((data.ma20 - data.price) / data.price) * 100;
        const distMa50 = ((data.ma50 - data.price) / data.price) * 100;
        signals.exit.push(`Preço abaixo MA20 (-${distMa20.toFixed(1)}%) e MA50 (-${distMa50.toFixed(1)}%) - tendência baixista`);
      } else if (data.price < data.ma20) {
        const distMa20 = ((data.ma20 - data.price) / data.price) * 100;
        signals.exit.push(`Preço abaixo MA20 (-${distMa20.toFixed(1)}%) - sinal de fraqueza`);
      }
    }
    
    // Bollinger Bands Position
    if (data.bollingerUpper != null && data.bollingerLower != null && data.price != null) {
      const bbPosition = (data.price - data.bollingerLower) / (data.bollingerUpper - data.bollingerLower);
      if (bbPosition <= 0.2) {
        signals.entry.push(`Preço na região inferior das Bandas (${(bbPosition * 100).toFixed(0)}%) - oversold`);
      } else if (bbPosition >= 0.4 && bbPosition <= 0.6) {
        signals.entry.push(`Preço no meio das Bandas (${(bbPosition * 100).toFixed(0)}%) - equilíbrio`);
      }
      
      // Bollinger Bands Warnings
      if (bbPosition >= 0.85) {
        signals.warnings.push(`Preço na banda superior (${(bbPosition * 100).toFixed(0)}%) - possível reversão`);
      }
      
      // Bollinger Bands Exit
      if (bbPosition >= 0.9) {
        signals.exit.push(`Preço na banda superior extrema (${(bbPosition * 100).toFixed(0)}%) - topo do canal`);
      }
    }
    
    // Support Analysis
    if (data.support != null && data.price != null) {
      const distToSupport = ((data.price - data.support) / data.support) * 100;
      if (distToSupport < 2 && distToSupport > 0) {
        signals.entry.push(`Preço próximo ao suporte (${distToSupport.toFixed(1)}% acima) - R$ ${data.support.toFixed(2)}`);
      }
      
      // Price below support
      const belowSupport = data.price < data.support;
      if (belowSupport) {
        const distBelow = ((data.support - data.price) / data.support) * 100;
        signals.exit.push(`Preço rompeu suporte (-${distBelow.toFixed(1)}%) - stop loss acionado`);
      }
    }
    
    // Resistance Warnings
    if (data.resistance != null && data.price != null) {
      const distToResistance = ((data.resistance - data.price) / data.price) * 100;
      if (distToResistance < 2 && distToResistance > 0) {
        signals.warnings.push(`Preço próximo à resistência (${distToResistance.toFixed(1)}% abaixo) - R$ ${data.resistance.toFixed(2)}`);
      }
    }
    
    // Volume Analysis
    if (data.volume != null) {
      if (data.volume < 500000) {
        signals.warnings.push(`Volume baixo (${(data.volume / 1000000).toFixed(2)}M) - liquidez reduzida`);
      }
    }
    
    return signals;
  };

  const currentData = stocksData[selectedStock] || {};
  const signals = calculateSignals(currentData, timeframe); // Passa o timeframe
  const entryExitData = calculateEntryExit(currentData, timeframe);

  const addToWatchlist = async () => {
    const ticker = addStockInput.toUpperCase().trim();
    if (!ticker) return;
    
    const tickerPattern = /^[A-Z]{4}\d{1,2}$/;
    if (!tickerPattern.test(ticker)) {
      alert('Formato inválido. Use: PETR4, VALE3, MGLU3');
      return;
    }

    if (watchlist.includes(ticker)) {
      alert('Já está na watchlist!');
      setAddStockInput('');
      return;
    }

    // Adicionar à watchlist
    const newWatchlist = [...watchlist, ticker];
    setWatchlist(newWatchlist);
    
    // 💾 SALVAR IMEDIATAMENTE
    localStorage.setItem('tradingB3_watchlist', JSON.stringify(newWatchlist));
    
    if (!stocksData[ticker]) {
      setLoading(true);
      const data = await api.fetchStockData(ticker);
      setStocksData(prev => ({ ...prev, [ticker]: data }));
      setLoading(false);
    }

    setAddStockInput('');
  };

  const removeFromWatchlist = (ticker) => {
    const newWatchlist = watchlist.filter(t => t !== ticker);
    setWatchlist(newWatchlist);
    
    // 💾 SALVAR IMEDIATAMENTE
    if (newWatchlist.length > 0) {
      localStorage.setItem('tradingB3_watchlist', JSON.stringify(newWatchlist));
    } else {
      localStorage.removeItem('tradingB3_watchlist');
      localStorage.removeItem('tradingB3_selectedStock');
    }
    
    // Se removeu a ação selecionada, selecionar outra
    if (selectedStock === ticker) {
      if (newWatchlist.length > 0) {
        const newSelected = newWatchlist[0];
        setSelectedStock(newSelected);
        localStorage.setItem('tradingB3_selectedStock', newSelected);
      } else {
        setSelectedStock('');
      }
    }
  };

  const historicalData = currentData.historicalData?.slice(-30) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="bg-yellow-900/20 border-2 border-yellow-600 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-yellow-400 mb-2">⚠️ Aviso Legal</h3>
            <p className="text-sm text-yellow-100">
              <strong>Dados estatísticos com fins educacionais</strong>. Não constitui recomendação de investimento. 
              Consulte um profissional certificado antes de investir.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl shadow-2xl p-6 mb-6 border border-slate-700">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              Trading System B3
            </h1>
            <p className="text-slate-400 mt-2">Dados Reais • Yahoo Finance API • Top 30 Mais Líquidas</p>
            {lastUpdate && (
              <p className="text-xs text-slate-500 mt-1">
                Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
              </p>
            )}
            {loading && loadingProgress.total > 0 && (
              <p className="text-xs text-blue-400 mt-1">
                Carregando... {loadingProgress.current}/{loadingProgress.total}
              </p>
            )}
            {watchlist.length > 0 && (
              <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Watchlist salva automaticamente ({watchlist.length} ações)
              </p>
            )}
          </div>
          <div className="flex gap-4 items-center">
            <button
              onClick={() => loadStocksData([...new Set([...top30Liquid, ...watchlist])])}
              disabled={loading}
              className="p-3 rounded-lg transition-all bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed"
              title="Atualizar"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${autoRefresh ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`}
            >
              {autoRefresh ? '⏸️ Pausar' : '▶️ Auto'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700 mb-6">
            <h2 className="text-xl font-bold mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-400" />
              Top 5 Oportunidades
            </h2>
            
            {loading && topOpportunities.length === 0 ? (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-400 mb-2" />
                <p className="text-sm text-slate-400">Buscando dados...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topOpportunities.map((opp, index) => {
                  const isSelected = opp.ticker === selectedStock;
                  return (
                    <div
                      key={opp.ticker}
                      className={`p-4 rounded-lg cursor-pointer transition-all border-2 relative ${
                        isSelected 
                          ? 'bg-gradient-to-r from-green-600 to-blue-600 border-green-400' 
                          : 'bg-slate-700 border-slate-600 hover:bg-slate-650'
                      }`}
                      onClick={() => setSelectedStock(opp.ticker)}
                    >
                      <div className="absolute top-2 right-2 bg-yellow-400 text-slate-900 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-bold text-lg">{opp.ticker}</div>
                        {opp.dataSource === 'Yahoo Finance' && (
                          <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded font-bold">REAL</span>
                        )}
                      </div>
                      <div className="text-2xl font-bold">R$ {opp.price.toFixed(2)}</div>
                      <div className={`text-sm font-semibold ${opp.change >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                        {opp.change >= 0 ? '+' : ''}{opp.change.toFixed(2)}%
                      </div>
                      <div className="mt-2 flex justify-between items-center">
                        <div className={`text-xs px-2 py-1 rounded font-bold ${
                          opp.score >= 70 ? 'bg-green-500 text-white' : 
                          opp.score >= 60 ? 'bg-yellow-500 text-white' : 
                          'bg-orange-500 text-white'
                        }`}>
                          Score: {opp.score}/100
                        </div>
                        <div className="text-xs text-slate-300">
                          #{opp.liquidityRank}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold mb-4 flex items-center">
              <Target className="w-5 h-5 mr-2 text-blue-400" />
              Adicionar Ação
            </h3>
            
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={addStockInput}
                onChange={(e) => setAddStockInput(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && addToWatchlist()}
                placeholder="Ex: MGLU3"
                className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={6}
              />
              <button
                onClick={addToWatchlist}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {watchlist.filter(t => !topOpportunities.some(opp => opp.ticker === t)).length > 0 && (
              <div className="space-y-2 mt-4">
                <div className="text-sm font-semibold text-slate-300 mb-2">Minhas Ações:</div>
                {watchlist.filter(t => !topOpportunities.some(opp => opp.ticker === t)).map(ticker => {
                  const data = stocksData[ticker] || {};
                  const score = calculateScore(data);
                  const isSelected = ticker === selectedStock;
                  return (
                    <div
                      key={ticker}
                      className={`p-3 rounded-lg cursor-pointer transition-all border-2 ${
                        isSelected 
                          ? 'bg-blue-600 border-blue-400' 
                          : 'bg-slate-700 border-slate-600 hover:bg-slate-650'
                      }`}
                      onClick={() => setSelectedStock(ticker)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-bold text-lg">{ticker}</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWatchlist(ticker);
                          }}
                          className="text-slate-400 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-2xl font-bold">R$ {data.price?.toFixed(2)}</div>
                      <div className={`text-sm ${data.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {data.change >= 0 ? '+' : ''}{data.change?.toFixed(2)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-3xl font-bold">{selectedStock}</h2>
                  {currentData.dataSource === 'Yahoo Finance' && (
                    <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                      Dados Reais
                    </span>
                  )}
                  {currentData.liquidityRank <= 30 && (
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                      Top #{currentData.liquidityRank}
                    </span>
                  )}
                </div>
                <div className="text-5xl font-bold mt-2">R$ {currentData.price?.toFixed(2)}</div>
                <div className={`text-2xl font-semibold mt-1 ${currentData.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {currentData.change >= 0 ? '+' : ''}{currentData.change?.toFixed(2)}%
                </div>
              </div>
              <div className="text-right">
                <div className={`text-5xl font-bold ${signals.score >= 70 ? 'text-green-400' : signals.score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {signals.score}/100
                </div>
                <div className={`text-xl font-semibold mt-2 ${signals.score >= 70 ? 'text-green-400' : signals.score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {signals.score >= 70 ? '📊 Positivo' : signals.score >= 40 ? '⚠️ Neutro' : '📉 Negativo'}
                </div>
              </div>
            </div>
          </div>

          {/* Filtro de Período */}
          <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h3 className="text-lg font-bold">Análise Temporal</h3>
              <div className="flex gap-2 flex-wrap">
                {[
                  { value: 'daily', label: '📅 Diário', desc: 'Curto prazo' },
                  { value: 'weekly', label: '📊 Semanal', desc: 'Médio prazo' },
                  { value: 'monthly', label: '📈 Mensal', desc: 'Longo prazo' },
                  { value: 'yearly', label: '🎯 Anual', desc: 'Muito longo prazo' }
                ].map(period => (
                  <button
                    key={period.value}
                    onClick={() => setTimeframe(period.value)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      timeframe === period.value
                        ? 'bg-blue-600 text-white shadow-lg scale-105'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                    title={period.desc}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-400">
              {timeframe === 'daily' && '⚡ Operações rápidas - Stop loss mais apertado (3%)'}
              {timeframe === 'weekly' && '📊 Swing trade - Stop loss moderado (5%)'}
              {timeframe === 'monthly' && '📈 Position trade - Stop loss amplo (8%)'}
              {timeframe === 'yearly' && '🎯 Investimento - Stop loss muito amplo (12%)'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border-2 border-green-600">
              <h3 className="text-xl font-bold mb-4 flex items-center text-green-400">
                <DollarSign className="w-6 h-6 mr-2" />
                Pontos de Entrada ({timeframe === 'daily' ? 'Diário' : timeframe === 'weekly' ? 'Semanal' : timeframe === 'monthly' ? 'Mensal' : 'Anual'})
              </h3>
              <div className="space-y-3">
                {entryExitData.entry.map((entry, idx) => (
                  <div key={idx} className="bg-green-900/20 p-3 rounded-lg">
                    <div className="flex justify-between items-start mb-1">
                      <div className="text-2xl font-bold text-green-400">R$ {entry.price?.toFixed(2)}</div>
                      {entry.probability && (
                        <div className="text-xs bg-green-500 text-white px-2 py-1 rounded font-bold">
                          {entry.probability.toFixed(0)}% chance
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-slate-300 mt-1">{entry.reason}</div>
                    <div className={`text-xs mt-1 font-semibold ${entry.distance > 0 ? 'text-yellow-400' : entry.distance < 0 ? 'text-blue-400' : 'text-slate-400'}`}>
                      {entry.distance !== 0 ? `${entry.distance > 0 ? '+' : ''}${entry.distance.toFixed(2)}%` : 'Preço atual'}
                    </div>
                  </div>
                ))}
                <div className="bg-red-900/20 p-3 rounded-lg border-2 border-red-600">
                  <div className="text-sm font-semibold text-red-400">Stop Loss ({timeframe === 'daily' ? 'Curto Prazo' : timeframe === 'weekly' ? 'Médio Prazo' : timeframe === 'monthly' ? 'Longo Prazo' : 'Muito Longo Prazo'})</div>
                  <div className="text-xl font-bold text-red-400">R$ {entryExitData.stopLoss?.toFixed(2)}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {currentData.price && entryExitData.stopLoss ? 
                      `-${(((currentData.price - entryExitData.stopLoss) / currentData.price) * 100).toFixed(2)}% do preço atual` 
                      : 'Calculando...'}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border-2 border-blue-600">
              <h3 className="text-xl font-bold mb-4 flex items-center text-blue-400">
                <TrendingUp className="w-6 h-6 mr-2" />
                Pontos de Saída ({timeframe === 'daily' ? 'Diário' : timeframe === 'weekly' ? 'Semanal' : timeframe === 'monthly' ? 'Mensal' : 'Anual'})
              </h3>
              <div className="space-y-3">
                {entryExitData.exit.map((exit, idx) => {
                  // Calcular lucro real baseado no primeiro ponto de entrada
                  const entryPrice = entryExitData.entry.length > 0 ? entryExitData.entry[0].price : currentData.price;
                  const realProfit = ((exit.price - entryPrice) / entryPrice) * 100;
                  
                  return (
                    <div key={idx} className="bg-blue-900/20 p-3 rounded-lg">
                      <div className="flex justify-between items-start mb-1">
                        <div className="text-2xl font-bold text-blue-400">R$ {exit.price?.toFixed(2)}</div>
                        {exit.probability && (
                          <div className={`text-xs px-2 py-1 rounded font-bold ${
                            exit.probability >= 80 ? 'bg-green-500 text-white' : 
                            exit.probability >= 75 ? 'bg-yellow-500 text-white' : 
                            'bg-orange-500 text-white'
                          }`}>
                            {exit.probability.toFixed(0)}% chance
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-slate-300 mt-1">{exit.reason}</div>
                      <div className="text-xs text-green-400 mt-1 font-semibold">
                        +{realProfit?.toFixed(2)}% potencial
                      </div>
                      {idx === 0 && entryExitData.entry.length > 0 && (
                        <div className="text-xs text-slate-400 mt-1">
                          Lucro de R$ {entryPrice.toFixed(2)} → R$ {exit.price?.toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {historicalData.length > 0 && (
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4">
                Histórico de Preço ({timeframe === 'daily' ? '30 dias' : timeframe === 'weekly' ? '52 semanas' : timeframe === 'monthly' ? '12 meses' : '5 anos'})
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'RSI', value: currentData.rsi, unit: '' },
              { label: 'MACD', value: currentData.macd, unit: '' },
              { label: 'ADX', value: currentData.adx, unit: '' },
              { label: 'Volume', value: currentData.volume / 1000000, unit: 'M' }
            ].map((indicator, idx) => (
              <div key={idx} className="bg-slate-800 rounded-xl shadow-2xl p-4 border border-slate-700">
                <div className="text-sm text-slate-400">{indicator.label}</div>
                <div className="text-2xl font-bold mt-1">
                  {indicator.value?.toFixed(2)}{indicator.unit}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4 flex items-center text-green-400">
                <TrendingUp className="w-5 h-5 mr-2" />
                Sinais Positivos
              </h3>
              <div className="space-y-2">
                {signals.entry.length > 0 ? signals.entry.map((signal, idx) => (
                  <div key={idx} className="flex items-start text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                    <span>{signal}</span>
                  </div>
                )) : <p className="text-slate-500 text-sm italic">Nenhum sinal</p>}
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4 flex items-center text-yellow-400">
                <AlertTriangle className="w-5 h-5 mr-2" />
                Alertas
              </h3>
              <div className="space-y-2">
                {signals.warnings.length > 0 ? signals.warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-start text-sm">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                    <span>{warning}</span>
                  </div>
                )) : <p className="text-slate-500 text-sm italic">Nenhum alerta</p>}
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4 flex items-center text-red-400">
                <TrendingDown className="w-5 h-5 mr-2" />
                Sinais Negativos
              </h3>
              <div className="space-y-2">
                {signals.exit.length > 0 ? signals.exit.map((signal, idx) => (
                  <div key={idx} className="flex items-start text-sm">
                    <div className="w-2 h-2 bg-red-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                    <span>{signal}</span>
                  </div>
                )) : <p className="text-slate-500 text-sm italic">Nenhum sinal</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-slate-500">
        <p>📊 Sistema com dados reais via Yahoo Finance API</p>
        <p className="mt-1">⚠️ Não constitui recomendação de investimento</p>
      </div>
    </div>
  );
};

export default TradingSystem;