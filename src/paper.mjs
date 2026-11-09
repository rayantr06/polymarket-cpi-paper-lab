// Public reads only. No signer, authenticated trading endpoint or order submission.
export async function fetchPaperSnapshot(market, outcome, { fetcher = fetch, clock = Date.now, signal, allowNegativeRisk = false } = {}) {
  const labels = JSON.parse(market.outcomes), tokens = JSON.parse(market.tokens);
  const index = labels.indexOf(outcome);
  if (index < 0 || !/^\d+$/.test(tokens[index])) throw new Error('Issue ou token inconnu.');
  const requestedAt = clock();
  const bookUrl = 'https://clob.polymarket.com/book?token_id=' + tokens[index];
  const marketUrl = 'https://gamma-api.polymarket.com/markets/slug/' + encodeURIComponent(market.slug);
  const bodies = await Promise.all([bookUrl, marketUrl].map(async url => {
    const r = await fetcher(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error('Lecture publique HTTP ' + r.status);
    return r.json();
  }));
  const [book, meta] = bodies;
  if (String(book.asset_id) !== tokens[index] || book.market !== market.condition_id ||
      meta.conditionId !== market.condition_id || meta.slug !== market.slug || meta.version !== 'v1' ||
      (typeof book.neg_risk === 'boolean' && book.neg_risk !== meta.negRisk) ||
      (meta.negRisk !== false && !(allowNegativeRisk && meta.negRisk === true && book.neg_risk === true)) ||
      JSON.parse(meta.clobTokenIds)[index] !== tokens[index] || JSON.parse(meta.outcomes)[index] !== outcome) {
    throw new Error('Identité du carnet ou du marché discordante.');
  }
  const schedule = meta.feesEnabled === false ? { rate: 0, exponent: 1 } : meta.feesEnabled === true ? meta.feeSchedule : null;
  if (!schedule || !['number', 'string'].includes(typeof schedule.rate) || String(schedule.rate).trim() === '' ||
      !Number.isFinite(Number(schedule.rate)) || Number(schedule.rate) < 0 || Number(schedule.rate) > 1 || Number(schedule.exponent) !== 1) {
    throw new Error('Barème de frais absent ou non pris en charge.');
  }
  return { requestedAt, receivedAt: clock(), timestamp: Number(book.timestamp), market: market.slug, outcome,
    token: tokens[index], condition: market.condition_id, asks: book.asks, bids: book.bids, hash: book.hash,
    minNotional: Number(meta.orderMinSize), minShares: Number(book.min_order_size), tickSize: Number(book.tick_size),
    acceptingOrders: meta.active === true && meta.closed === false && meta.acceptingOrders === true,
    feeRate: Number(schedule.rate), feeExponent: 1, sources: [bookUrl, marketUrl] };
}

export function simulatePaper(forecast, snapshot, { now, budget, maxPrice, extraCost = 0, unscoredShadow = false } = {}) {
  const abstain = reason => ({ action: 'abstain', reason, budget, model: 'taker-snapshot-v1' });
  if (!Number.isFinite(budget) || budget < 1 || budget > 100 || !Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice >= 1 ||
      !Number.isFinite(extraCost) || extraCost < 0 || extraCost >= budget) return abstain('Paramètres de simulation invalides.');
  if (!Number.isFinite(forecast.deadline) || forecast.deadline <= now) return abstain('Le marché est arrivé à échéance ou sa date est inconnue.');
  if (!snapshot || !snapshot.acceptingOrders) return abstain('Carnet absent ou marché fermé.');
  if (snapshot.market !== forecast.market || snapshot.outcome !== forecast.outcome ||
      snapshot.requestedAt < forecast.recordedAt || snapshot.receivedAt > now ||
      !Number.isFinite(snapshot.timestamp) || snapshot.timestamp > now + 1000 || now - snapshot.timestamp > 5000 || now - snapshot.receivedAt > 5000) {
    return abstain('Carnet périmé, antérieur à la prévision ou discordant.');
  }
  if (!Number.isFinite(snapshot.feeRate) || snapshot.feeRate < 0 || snapshot.feeRate > 1 || snapshot.feeExponent !== 1 ||
      !Number.isFinite(snapshot.minNotional) || snapshot.minNotional <= 0 || !Number.isFinite(snapshot.minShares) || snapshot.minShares <= 0) {
    return abstain('Frais ou taille minimale non vérifiables.');
  }
  if (!Array.isArray(snapshot.asks) || snapshot.asks.length > 10000) return abstain('Profondeur du carnet invalide.');
  const levels = snapshot.asks.map(l => ({ price: Number(l.price), size: Number(l.size) }));
  if (levels.some(l => !Number.isFinite(l.price) || l.price <= 0 || l.price >= 1 || !Number.isFinite(l.size) || l.size <= 0)) return abstain('Niveau du carnet invalide.');
  let remaining = budget - extraCost, quantity = 0, notional = 0, fees = 0;
  const fills = [];
  for (const l of levels.sort((a, b) => a.price - b.price)) {
    if (l.price > maxPrice || remaining <= 0.00001) break;
    const feePerShare = snapshot.feeRate * l.price * (1 - l.price);
    // Reserve rounding headroom, floor shares, round fees upward conservatively.
    const size = Math.floor(Math.min(l.size, Math.max(0, remaining - .00001) / (l.price + feePerShare)) * 100) / 100;
    if (!size) continue;
    const cost = size * l.price, fee = Math.ceil(size * feePerShare * 1e5 - 1e-9) / 1e5;
    if (cost + fee > remaining + 1e-8) continue;
    fills.push({ price: l.price, quantity: size, notional: cost, fee });
    quantity += size; notional += cost; fees += fee; remaining -= cost + fee;
  }
  if (notional < snapshot.minNotional || quantity < snapshot.minShares) return abstain('Profondeur insuffisante sous le prix limite et le budget.');
  if (!unscoredShadow && (!Number.isFinite(forecast.probability) || forecast.probability <= 0 || forecast.probability >= 1)) return abstain('Probabilité invalide.');
  const totalCost = notional + fees + extraCost, expectedNet = unscoredShadow ? null : forecast.probability * quantity - totalCost;
  if (!unscoredShadow && expectedNet <= 0) return { ...abstain('Espérance nette non positive selon la probabilité saisie.'), expectedNet,
    breakEvenProbability: totalCost / quantity, vwap: notional / quantity };
  return { action: 'paper_buy', model: unscoredShadow ? 'unscored-shadow-v1' : 'taker-snapshot-v1', budget, maxPrice, quantity, notional, fees, extraCost,
    totalCost, expectedNet, breakEvenProbability: totalCost / quantity, vwap: notional / quantity, fills,
    unspent: budget - totalCost, worstLoss: totalCost, rewards: 0,
    limitations: 'Simulation au carnet reçu, sans réservation de liquidité ni garantie de remplissage ; coûts supplémentaires saisis, récompenses exclues.' };
}
