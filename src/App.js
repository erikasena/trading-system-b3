import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, Bell, AlertTriangle, Target, Plus, X, Volume2, Zap, DollarSign, Shield } from 'lucide-react';

const TradingSystem = () => {
  const [selectedStock, setSelectedStock] = useState('PETR4');
  const [watchlist, setWatchlist] = useState([]);
  const [topOpportunities, setTopOpportunities] = useState([]);
  const [stocksData, setStocksData] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false); // DESABILITADO por padrão
  const [addStockInput, setAddStockInput] = useState('');
  const [timeframe, setTimeframe] = useState('daily'); // daily, weekly, monthly, yearly

  const top30Liquid = [
    'PETR4', 'VALE3', 'ITUB4', 'BBDC4', 'ABEV3', 'BBAS3', 'B3SA3', 'WEGE3', 'RENT3', 'MGLU3',
    'ITSA4', 'HAPV3', 'ELET3', 'SUZB3', 'RADL3', 'RAIL3', 'JBSS3', 'EMBR3', 'PRIO3', 'UGPA3',
    'CSAN3', 'GGBR4', 'VIVT3', 'GOAU4', 'CSNA3', 'ENBR3', 'ENEV3', 'CPLE6', 'SBSP3', 'LREN3'
  ];

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

  // Calcular pontos de entrada e saída baseado no timeframe e indicadores
  const calculateEntryExit = (data, timeframe) => {
    if (!data || !data.price) {
      return {
        entry: [{ price: 0, reason: 'Aguardando dados...', distance: 0 }],
        exit: [{ price: 0, reason: 'Aguardando dados...', distance: 0 }],
        stopLoss: 0
      };
    }

    const entryPoints = [];
    const exitPoints = [];

    // Ajustar sensibilidade e parâmetros baseados no timeframe
    const timeframeConfig = {
      daily: { 
        multiplier: 1, 
        stopDistance: 0.97, 
        rsiOverbought: 75, 
        rsiOversold: 30,
        macdStrong: 0.15,
        adxStrong: 35,
        targetMultiplier: 1.5
      },
      weekly: { 
        multiplier: 1.5, 
        stopDistance: 0.95, 
        rsiOverbought: 73, 
        rsiOversold: 32,
        macdStrong: 0.12,
        adxStrong: 30,
        targetMultiplier: 2
      },
      monthly: { 
        multiplier: 2.5, 
        stopDistance: 0.92, 
        rsiOverbought: 70, 
        rsiOversold: 35,
        macdStrong: 0.10,
        adxStrong: 28,
        targetMultiplier: 3
      },
      yearly: { 
        multiplier: 4, 
        stopDistance: 0.88, 
        rsiOverbought: 68, 
        rsiOversold: 38,
        macdStrong: 0.08,
        adxStrong: 25,
        targetMultiplier: 5
      }
    };

    const config = timeframeConfig[timeframe];
    const tolerance = 0.015 * config.multiplier;

    // Calcular distância percentual do preço atual
    const calcDistance = (targetPrice) => {
      return ((targetPrice - data.price) / data.price) * 100;
    };

    // PONTOS DE ENTRADA baseados em análise técnica ajustados por timeframe

    // 1. Entrada por RSI oversold + Suporte (mais agressivo em timeframes maiores)
    if (data.rsi < config.rsiOversold + (5 * (config.multiplier - 1))) {
      const entryPrice = data.support * (1 - tolerance * 0.5);
      entryPoints.push({
        price: entryPrice,
        reason: `RSI oversold (${data.rsi.toFixed(1)}) + Suporte`,
        distance: calcDistance(entryPrice)
      });
    }

    // 2. Entrada na banda inferior de Bollinger (ajustada por timeframe)
    const bbLowerTarget = data.bollingerLower * (1 + tolerance * 0.3);
    const bbLowerDistance = calcDistance(bbLowerTarget);
    if (Math.abs(bbLowerDistance) < 15 * config.multiplier) {
      entryPoints.push({
        price: bbLowerTarget,
        reason: `Banda Bollinger inferior (Timeframe ${timeframe})`,
        distance: bbLowerDistance
      });
    }

    // 3. Entrada em cruzamento de MA20 (mais conservador em timeframes maiores)
    if (data.macd > -0.05 * config.multiplier) {
      const ma20Entry = data.ma20 * (0.99 + tolerance);
      entryPoints.push({
        price: ma20Entry,
        reason: `MA20 com MACD ${data.macd >= 0 ? 'positivo' : 'em recuperação'} (${data.macd.toFixed(3)})`,
        distance: calcDistance(ma20Entry)
      });
    }

    // 4. Entrada em MA50 para períodos maiores (monthly/yearly)
    if ((timeframe === 'monthly' || timeframe === 'yearly') && data.adx > config.adxStrong - 10) {
      const ma50Entry = data.ma50 * (0.98 + tolerance * 0.5);
      entryPoints.push({
        price: ma50Entry,
        reason: `MA50 - Tendência ${timeframe === 'yearly' ? 'de longo prazo' : 'mensal'} (ADX ${data.adx.toFixed(1)})`,
        distance: calcDistance(ma50Entry)
      });
    }

    // 5. Entrada em pullback (ajustado por timeframe)
    if (data.price > data.ma20 && data.macd > 0) {
      const pullbackEntry = data.price * (0.97 + tolerance * 0.5);
      entryPoints.push({
        price: pullbackEntry,
        reason: `Pullback em tendência de alta (${timeframe})`,
        distance: calcDistance(pullbackEntry)
      });
    }

    // 6. Entrada quando RSI está em zona ideal (varia por timeframe)
    const idealRsiMin = 45 - (config.multiplier * 2);
    const idealRsiMax = 55 + (config.multiplier * 2);
    if (data.rsi > idealRsiMin && data.rsi < idealRsiMax && data.macd > 0) {
      const idealEntry = data.price * (0.985 + tolerance);
      entryPoints.push({
        price: idealEntry,
        reason: `RSI em zona ideal para ${timeframe} (${data.rsi.toFixed(1)})`,
        distance: calcDistance(idealEntry)
      });
    }

    // PONTOS DE SAÍDA baseados em análise técnica ajustados por timeframe

    // 1. Saída em resistência técnica (mais agressiva em timeframes maiores)
    const resistanceTarget = data.resistance * (1 + tolerance * 0.7);
    exitPoints.push({
      price: resistanceTarget,
      reason: `Resistência técnica ${timeframe}`,
      distance: calcDistance(resistanceTarget)
    });

    // 2. Saída na banda superior de Bollinger (ajustada)
    const bbUpperTarget = data.bollingerUpper * (0.99 + tolerance * 0.5);
    exitPoints.push({
      price: bbUpperTarget,
      reason: `Banda Bollinger superior (${timeframe})`,
      distance: calcDistance(bbUpperTarget)
    });

    // 3. Saída por RSI overbought (threshold varia por timeframe)
    if (data.rsi > config.rsiOverbought - 10) {
      const rsiTarget = Math.min(data.resistance, data.bollingerUpper) * (1 + tolerance * 0.3);
      exitPoints.push({
        price: rsiTarget,
        reason: `Alvo RSI (${data.rsi.toFixed(1)}) - Realizar lucros ${timeframe}`,
        distance: calcDistance(rsiTarget)
      });
    }

    // 4. Saída baseada em ATR (volatilidade) ajustada por timeframe
    const atrEstimate = (data.bollingerUpper - data.bollingerLower) / 4;
    const atrTarget = data.price + (atrEstimate * config.targetMultiplier);
    exitPoints.push({
      price: atrTarget,
      reason: `Alvo por volatilidade (ATR × ${config.targetMultiplier}) - ${timeframe}`,
      distance: calcDistance(atrTarget)
    });

    // 5. Alvo Fibonacci ajustado por timeframe
    const fibonacciLevel = timeframe === 'daily' ? 1.382 : timeframe === 'weekly' ? 1.618 : timeframe === 'monthly' ? 2.0 : 2.618;
    const fibTarget = data.support + ((data.resistance - data.support) * fibonacciLevel);
    const potentialRR = (fibTarget - data.price) / (data.price - (data.support * config.stopDistance));
    
    if (potentialRR > 1.5) {
      exitPoints.push({
        price: fibTarget,
        reason: `Fibonacci ${fibonacciLevel} (R/R ${potentialRR.toFixed(1)}:1) - ${timeframe}`,
        distance: calcDistance(fibTarget)
      });
    }

    // 6. Alvo agressivo para ADX forte (varia por timeframe)
    if (data.adx > config.adxStrong && data.macd > config.macdStrong) {
      const aggressiveMultiplier = 1 + (0.05 * config.multiplier);
      const aggressiveTarget = data.resistance * aggressiveMultiplier;
      exitPoints.push({
        price: aggressiveTarget,
        reason: `Tendência forte confirmada (ADX ${data.adx.toFixed(1)}, MACD ${data.macd.toFixed(3)}) - ${timeframe}`,
        distance: calcDistance(aggressiveTarget)
      });
    }

    // 7. Alvo conservador baseado em suporte/resistência range (ajustado)
    const rangeSize = data.resistance - data.support;
    const conservativeTarget = data.price + (rangeSize * 0.5 * config.multiplier);
    if (conservativeTarget > data.price && conservativeTarget < data.resistance * 1.2) {
      exitPoints.push({
        price: conservativeTarget,
        reason: `Alvo conservador ${timeframe} (50% do range)`,
        distance: calcDistance(conservativeTarget)
      });
    }

    // STOP LOSS inteligente baseado em análise técnica e timeframe
    let stopLoss;
    
    // Stop loss ajustado por volatilidade e timeframe
    const volatilityMargin = ((data.bollingerUpper - data.bollingerLower) / data.price) * 0.4 * config.multiplier;
    stopLoss = data.support * (config.stopDistance - volatilityMargin);

    // Ajustar stop para ADX fraco (mercado lateral) - mais apertado
    if (data.adx < 20) {
      stopLoss = data.support * (0.985 - tolerance * 0.5);
    }

    // Ajustar stop para ADX forte - pode ser mais amplo em timeframes maiores
    if (data.adx > config.adxStrong) {
      stopLoss = data.support * (config.stopDistance - tolerance * 0.3);
    }

    // Se não houver pontos de entrada viáveis
    if (entryPoints.length === 0) {
      entryPoints.push({
        price: data.price,
        reason: `Preço de mercado atual (${timeframe})`,
        distance: 0
      });
    }

    // Se não houver pontos de saída viáveis
    if (exitPoints.length === 0) {
      exitPoints.push({
        price: data.resistance,
        reason: 'Resistência técnica principal',
        distance: calcDistance(data.resistance)
      });
    }

    // Filtrar entradas que fazem sentido (não muito longe do preço)
    const validEntries = entryPoints.filter(e => 
      Math.abs(e.distance) < 20 * config.multiplier
    );

    // Filtrar saídas que fazem sentido (acima do preço atual)
    const validExits = exitPoints.filter(e => 
      e.distance > 0 && e.distance < 30 * config.multiplier
    );

    // Ordenar por distância
    validEntries.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
    validExits.sort((a, b) => b.distance - a.distance);

    return {
      entry: validEntries.length > 0 ? validEntries.slice(0, 4) : entryPoints.slice(0, 1),
      exit: validExits.length > 0 ? validExits.slice(0, 4) : exitPoints.slice(0, 4),
      stopLoss
    };
  };

  useEffect(() => {
    const initialData = {};
    top30Liquid.forEach((ticker, index) => {
      const basePrice = Math.random() * 80 + 10;
      const shouldHaveGoodScore = index < 8;
      let rsi, macd, adx, ma20, ma50;
      if (shouldHaveGoodScore) {
        rsi = 50 + Math.random() * 20;
        macd = 0.1 + Math.random() * 0.5;
        adx = 30 + Math.random() * 25;
        ma20 = basePrice * (0.92 + Math.random() * 0.06);
        ma50 = basePrice * (0.88 + Math.random() * 0.08);
      } else {
        rsi = Math.random() * 100;
        macd = (Math.random() - 0.5) * 3;
        adx = Math.random() * 60 + 10;
        ma20 = basePrice * (0.95 + Math.random() * 0.1);
        ma50 = basePrice * (0.90 + Math.random() * 0.15);
      }
      const volume = Math.floor(Math.random() * 10000000) + 1000000;
      initialData[ticker] = {
        price: parseFloat(basePrice.toFixed(2)),
        change: (Math.random() - 0.5) * 6,
        volume: volume,
        liquidityRank: top30Liquid.indexOf(ticker) + 1,
        rsi: parseFloat(rsi.toFixed(2)),
        macd: parseFloat(macd.toFixed(3)),
        adx: parseFloat(adx.toFixed(2)),
        ma20: parseFloat(ma20.toFixed(2)),
        ma50: parseFloat(ma50.toFixed(2)),
        bollingerUpper: parseFloat((basePrice * 1.15).toFixed(2)),
        bollingerLower: parseFloat((basePrice * 0.85).toFixed(2)),
        support: parseFloat((basePrice * 0.92).toFixed(2)),
        resistance: parseFloat((basePrice * 1.08).toFixed(2))
      };
    });
    setStocksData(initialData);
  }, []);

  useEffect(() => {
    if (Object.keys(stocksData).length === 0) return;
    const allStocksWithScore = Object.entries(stocksData)
      .map(([ticker, data]) => ({
        ticker,
        score: calculateScore(data),
        ...data
      }))
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
  }, [stocksData, selectedStock]);

  const calculateSignals = (data) => {
    const signals = { entry: [], exit: [], warnings: [], score: calculateScore(data) };
    if (data.rsi > 85) signals.exit.push('RSI extremamente sobrecomprado');
    else if (data.rsi > 70) signals.warnings.push('RSI sobrecomprado - aguardar correção');
    else if (data.rsi >= 50 && data.rsi <= 70) signals.entry.push('RSI em zona favorável para compra');
    else if (data.rsi < 30) signals.entry.push('RSI sobrevendido - oportunidade de compra');
    if (data.macd > 0.2) signals.entry.push('MACD positivo forte - momentum de alta');
    else if (data.macd > 0) signals.entry.push('MACD positivo - momentum de alta');
    else if (data.macd < -0.1) signals.exit.push('MACD negativo - momentum de baixa');
    if (data.adx > 40) signals.entry.push('Tendência forte estabelecida (ADX > 40)');
    else if (data.adx > 25) signals.entry.push('Tendência moderada');
    else if (data.adx < 20) signals.warnings.push('Tendência fraca - mercado lateral');
    if (data.price > data.ma20 && data.price > data.ma50) signals.entry.push('Preço acima de MA20 e MA50 - tendência altista');
    else if (data.price < data.ma20 && data.price < data.ma50) signals.exit.push('Preço abaixo de MA20 e MA50 - tendência baixista');
    else if (data.price < data.ma20) signals.warnings.push('Preço abaixo de MA20');
    const bbPosition = (data.price - data.bollingerLower) / (data.bollingerUpper - data.bollingerLower);
    if (bbPosition >= 0.9) signals.warnings.push('Preço na banda superior - possível reversão');
    else if (bbPosition <= 0.1) signals.entry.push('Preço na banda inferior - oportunidade de compra');
    const distToSupport = ((data.price - data.support) / data.support) * 100;
    const distToResistance = ((data.resistance - data.price) / data.price) * 100;
    if (distToSupport < 1.5) signals.entry.push(`Preço próximo ao suporte (R$ ${data.support.toFixed(2)})`);
    if (distToResistance < 1.5) signals.warnings.push(`Preço próximo à resistência (R$ ${data.resistance.toFixed(2)})`);
    return signals;
  };

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setStocksData(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(ticker => {
          const variation = (Math.random() - 0.5) * 0.8;
          const newPrice = updated[ticker].price * (1 + variation / 100);
          updated[ticker] = {
            ...updated[ticker],
            price: parseFloat(newPrice.toFixed(2)),
            change: parseFloat((updated[ticker].change + (Math.random() - 0.5) * 0.5).toFixed(2)),
            rsi: Math.max(0, Math.min(100, updated[ticker].rsi + (Math.random() - 0.5) * 3)),
            macd: parseFloat((updated[ticker].macd + (Math.random() - 0.5) * 0.15).toFixed(3)),
            adx: Math.max(10, Math.min(70, updated[ticker].adx + (Math.random() - 0.5) * 2)),
            volume: updated[ticker].volume + Math.floor((Math.random() - 0.5) * 200000)
          };
          const isTopOpportunity = topOpportunities.some(opp => opp.ticker === ticker);
          if (!isTopOpportunity) return;
          const signals = calculateSignals(updated[ticker]);
          if (signals.entry.length >= 3 && signals.score >= 75) {
            const existingAlert = alerts.find(a => 
              a.ticker === ticker && a.type === 'entry' && 
              Date.now() - new Date(a.timestamp).getTime() < 30000
            );
            if (!existingAlert) {
              const newAlert = {
                id: Date.now() + Math.random(),
                type: 'entry',
                ticker,
                message: `🔥 OPORTUNIDADE FORTE: ${ticker} - Score ${signals.score}/100`,
                signals: signals.entry,
                timestamp: new Date().toISOString()
              };
              setAlerts(prev => [newAlert, ...prev].slice(0, 20));
              if (soundEnabled) console.log('🔔 ALERTA DE COMPRA FORTE:', ticker);
            }
          }
          if (signals.exit.length > 0 && signals.score < 40) {
            const existingAlert = alerts.find(a => 
              a.ticker === ticker && a.type === 'exit' && 
              Date.now() - new Date(a.timestamp).getTime() < 30000
            );
            if (!existingAlert) {
              const newAlert = {
                id: Date.now() + Math.random(),
                type: 'exit',
                ticker,
                message: `⚠️ ALERTA DE VENDA: ${ticker} - Score ${signals.score}/100`,
                signals: signals.exit,
                timestamp: new Date().toISOString()
              };
              setAlerts(prev => [newAlert, ...prev].slice(0, 20));
              if (soundEnabled) console.log('🔔 ALERTA DE VENDA:', ticker);
            }
          }
        });
        return updated;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, soundEnabled, topOpportunities, alerts]);

  const currentData = stocksData[selectedStock] || {};
  const signals = calculateSignals(currentData);
  const entryExitData = calculateEntryExit(currentData, timeframe);

  const generateHistoricalData = () => {
    const data = [];
    let price = currentData.price || 18;
    const periods = timeframe === 'daily' ? 30 : timeframe === 'weekly' ? 52 : timeframe === 'monthly' ? 12 : 5;
    const label = timeframe === 'daily' ? 'd' : timeframe === 'weekly' ? 's' : timeframe === 'monthly' ? 'm' : 'a';
    
    for (let i = periods; i >= 0; i--) {
      const variation = (Math.random() - 0.5) * 2;
      price = price * (1 + variation / 100);
      data.push({
        time: `${i}${label}`,
        price: parseFloat(price.toFixed(2)),
        volume: Math.floor(Math.random() * 2000000) + 500000
      });
    }
    return data.reverse();
  };

  const historicalData = generateHistoricalData();

  const addToWatchlist = () => {
    const ticker = addStockInput.toUpperCase().trim();
    
    if (!ticker) {
      return;
    }

    // Validar formato básico de ticker da B3 (letras + números)
    const tickerPattern = /^[A-Z]{4}\d{1,2}$/;
    if (!tickerPattern.test(ticker)) {
      alert('Formato inválido. Use o formato correto (ex: MGLU3, PETR4, VALE3)');
      return;
    }

    // Verificar se já existe na watchlist
    if (watchlist.includes(ticker)) {
      alert('Esta ação já está na sua watchlist!');
      setAddStockInput('');
      return;
    }

    // Adicionar à watchlist
    setWatchlist([...watchlist, ticker]);

    // Se não existir nos dados, criar dados simulados para ela
    if (!stocksData[ticker]) {
      const basePrice = Math.random() * 100 + 10;
      const rsi = Math.random() * 100;
      const macd = (Math.random() - 0.5) * 3;
      const adx = Math.random() * 60 + 10;
      const ma20 = basePrice * (0.95 + Math.random() * 0.1);
      const ma50 = basePrice * (0.90 + Math.random() * 0.15);
      const volume = Math.floor(Math.random() * 5000000) + 500000;
      
      setStocksData(prev => ({
        ...prev,
        [ticker]: {
          price: parseFloat(basePrice.toFixed(2)),
          change: (Math.random() - 0.5) * 6,
          volume: volume,
          liquidityRank: 31, // Fora do top 30
          rsi: parseFloat(rsi.toFixed(2)),
          macd: parseFloat(macd.toFixed(3)),
          adx: parseFloat(adx.toFixed(2)),
          ma20: parseFloat(ma20.toFixed(2)),
          ma50: parseFloat(ma50.toFixed(2)),
          bollingerUpper: parseFloat((basePrice * 1.15).toFixed(2)),
          bollingerLower: parseFloat((basePrice * 0.85).toFixed(2)),
          support: parseFloat((basePrice * 0.92).toFixed(2)),
          resistance: parseFloat((basePrice * 1.08).toFixed(2))
        }
      }));
    }

    setAddStockInput('');
  };

  const removeFromWatchlist = (ticker) => {
    setWatchlist(watchlist.filter(t => t !== ticker));
    if (selectedStock === ticker && watchlist.length > 1) {
      setSelectedStock(watchlist[0]);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('pt-BR');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      {/* Disclaimer Legal */}
      <div className="bg-yellow-900/20 border-2 border-yellow-600 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-yellow-400 mb-2">⚠️ Aviso Legal Importante</h3>
            <p className="text-sm text-yellow-100">
              Este sistema apresenta <strong>apenas dados estatísticos e análises técnicas</strong> com fins educacionais e informativos. 
              <strong> Não constitui recomendação de investimento, consultoria financeira ou oferta de compra/venda de ativos</strong>. 
              O desenvolvedor não possui certificações para oferecer recomendações financeiras. 
              Investimentos em ações envolvem riscos. Consulte um profissional certificado (AAI, CNPI) antes de investir.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl shadow-2xl p-6 mb-6 border border-slate-700">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              Trading System - B3
            </h1>
            <p className="text-slate-400 mt-2">Análise Técnica • Dados Estatísticos • 30 Ações Mais Líquidas</p>
          </div>
          <div className="flex gap-4 items-center">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-3 rounded-lg transition-all ${soundEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 hover:bg-slate-600'}`}
              title={soundEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'}
            >
              <Volume2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${autoRefresh ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`}
            >
              {autoRefresh ? '⏸️ Pausar Auto-Atualização' : '▶️ Ativar Auto-Atualização'}
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
            
            {topOpportunities.length > 0 ? (
              <div className="space-y-2">
                {topOpportunities.map((opp, index) => {
                  const isSelected = opp.ticker === selectedStock;
                  return (
                    <div
                      key={opp.ticker}
                      className={`p-4 rounded-lg cursor-pointer transition-all border-2 relative ${
                        isSelected 
                          ? 'bg-gradient-to-r from-green-600 to-blue-600 border-green-400' 
                          : 'bg-slate-700 border-slate-600 hover:bg-slate-650 hover:border-green-500'
                      }`}
                      onClick={() => setSelectedStock(opp.ticker)}
                    >
                      <div className="absolute top-2 right-2 bg-yellow-400 text-slate-900 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                        {index + 1}
                      </div>
                      <div className="font-bold text-lg mb-1">{opp.ticker}</div>
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
                          Liquidez: #{opp.liquidityRank}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">Aguardando identificação de oportunidades...</p>
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
              />
              <button
                onClick={addToWatchlist}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            
            <div className="text-xs text-slate-400">
              Apenas ações das 30 mais líquidas
            </div>

            {watchlist.filter(t => !topOpportunities.some(opp => opp.ticker === t)).length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-semibold text-slate-300 mb-2">Minhas Ações:</div>
                {watchlist
                  .filter(t => !topOpportunities.some(opp => opp.ticker === t))
                  .map(ticker => {
                    const data = stocksData[ticker] || {};
                    const score = calculateScore(data);
                    const isSelected = ticker === selectedStock;
                    return (
                      <div
                        key={ticker}
                        className={`p-3 rounded-lg cursor-pointer transition-all border ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-400' 
                            : 'bg-slate-700 border-slate-600 hover:bg-slate-650'
                        }`}
                        onClick={() => setSelectedStock(ticker)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-bold">{ticker}</div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromWatchlist(ticker);
                            }}
                            className="text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="text-lg font-bold">R$ {data.price?.toFixed(2)}</div>
                        <div className={`text-xs ${score >= 70 ? 'text-green-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                          Score: {score}/100
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
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-bold">{selectedStock}</h2>
                  {currentData.liquidityRank && (
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                      Liquidez #{currentData.liquidityRank}
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
                  {signals.score >= 70 ? '📊 Análise Positiva' : signals.score >= 40 ? '⚠️ Neutro' : '📉 Análise Negativa'}
                </div>
              </div>
            </div>
          </div>

          {/* Pontos de Entrada e Saída */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border-2 border-green-600">
              <h3 className="text-xl font-bold mb-4 flex items-center text-green-400">
                <DollarSign className="w-6 h-6 mr-2" />
                Pontos de Entrada ({timeframe === 'daily' ? 'Diário' : timeframe === 'weekly' ? 'Semanal' : timeframe === 'monthly' ? 'Mensal' : 'Anual'})
              </h3>
              <div className="space-y-3">
                {entryExitData.entry.map((entry, idx) => (
                  <div key={idx} className="bg-green-900/20 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-green-400">R$ {entry.price?.toFixed(2)}</div>
                    <div className="text-sm text-slate-300 mt-1">{entry.reason}</div>
                    <div className={`text-xs mt-1 font-semibold ${entry.distance > 0 ? 'text-yellow-400' : entry.distance < 0 ? 'text-blue-400' : 'text-slate-400'}`}>
                      {entry.distance !== 0 ? `${entry.distance > 0 ? '+' : ''}${entry.distance.toFixed(2)}% do preço atual` : 'Preço de mercado'}
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
                {entryExitData.exit.map((exit, idx) => (
                  <div key={idx} className="bg-blue-900/20 p-3 rounded-lg">
                    <div className="text-2xl font-bold text-blue-400">R$ {exit.price?.toFixed(2)}</div>
                    <div className="text-sm text-slate-300 mt-1">{exit.reason}</div>
                    <div className="text-xs text-green-400 mt-1 font-semibold">
                      {exit.distance ? `+${exit.distance.toFixed(2)}% de ganho potencial` : 'Calculando...'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filtro de Período */}
          <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Análise Temporal</h3>
              <div className="flex gap-2">
                {[
                  { value: 'daily', label: 'Diário' },
                  { value: 'weekly', label: 'Semanal' },
                  { value: 'monthly', label: 'Mensal' },
                  { value: 'yearly', label: 'Anual' }
                ].map(period => (
                  <button
                    key={period.value}
                    onClick={() => setTimeframe(period.value)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      timeframe === period.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4">Histórico de Preço ({timeframe === 'daily' ? '30 dias' : timeframe === 'weekly' ? '52 semanas' : timeframe === 'monthly' ? '12 meses' : '5 anos'})</h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold mb-4">Volume</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={historicalData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar dataKey="volume" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'RSI', value: currentData.rsi, unit: '', warning: currentData.rsi > 70 || currentData.rsi < 30 },
              { label: 'MACD', value: currentData.macd, unit: '', warning: currentData.macd < 0 },
              { label: 'ADX', value: currentData.adx, unit: '', warning: currentData.adx < 20 },
              { label: 'Volume', value: currentData.volume / 1000000, unit: 'M', warning: false }
            ].map((indicator, idx) => (
              <div key={idx} className={`bg-slate-800 rounded-xl shadow-2xl p-4 border ${indicator.warning ? 'border-yellow-500' : 'border-slate-700'}`}>
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
                )) : <p className="text-slate-500 text-sm italic">Nenhum sinal ativo</p>}
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
                )) : <p className="text-slate-500 text-sm italic">Nenhum sinal ativo</p>}
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl shadow-2xl p-6 border border-slate-700">
            <h3 className="text-lg font-bold mb-4 flex items-center">
              <Bell className="w-5 h-5 mr-2 text-blue-400" />
              Histórico de Alertas
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {alerts.length > 0 ? alerts.map(alert => (
                <div 
                  key={alert.id}
                  className={`p-4 rounded-lg border-l-4 ${
                    alert.type === 'entry' 
                      ? 'bg-green-900/20 border-green-400' 
                      : 'bg-red-900/20 border-red-400'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold">{alert.message}</span>
                    <span className="text-sm text-slate-400">{formatTimestamp(alert.timestamp)}</span>
                  </div>
                  <div className="text-sm text-slate-300">
                    {alert.signals.slice(0, 3).join(' • ')}
                  </div>
                </div>
              )) : (
                <p className="text-slate-500 text-center py-8">Nenhum alerta registrado</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-slate-500">
        <p>📊 Sistema de análise técnica com dados simulados para fins educacionais</p>
        <p className="mt-1">⚠️ Não constitui recomendação de investimento • Consulte um profissional certificado</p>
      </div>
    </div>
  );
};

export default TradingSystem;