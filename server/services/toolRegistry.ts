/**
 * toolRegistry.ts — Maps tool names to actual TypeScript service implementations.
 *
 * Ported from Python src/orchestrator/tool_registry.py.
 *
 * Tools are called directly (in-process) rather than via MCP transport.
 * The architecture still follows MCP conventions so it can be upgraded later.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolFn = (...args: any[]) => Promise<any>;

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private _tools: Map<string, ToolFn> = new Map();
  private _loaded = false;

  // -------------------------------------------------------------------------
  // Lazy load
  // -------------------------------------------------------------------------

  /**
   * Lazy-load all tool implementations from the service modules.
   * Each domain is wrapped in its own try/catch so a single missing module
   * does not prevent other tools from loading.
   */
  async _ensureLoaded(): Promise<void> {
    if (this._loaded) return;

    // --- Sanctions -----------------------------------------------------------
    try {
      const {
        SanctionsClient,
        OFACClient,
      } = await import('./sanctions');

      const sanctionsClient = new SanctionsClient();
      const ofacClient = new OFACClient();

      this._tools.set('search_sanctions', async (query: string, entityType?: string) =>
        sanctionsClient.search(query, entityType),
      );
      this._tools.set('check_sanctions_status', async (entityName: string) =>
        sanctionsClient.checkStatus(entityName),
      );
      this._tools.set('get_sanctions_proximity', async (entityName: string, maxHops = 2) =>
        sanctionsClient.getProximity(entityName, maxHops),
      );
      this._tools.set('get_recent_designations', async (days = 30) =>
        ofacClient.getRecentDesignations(days),
      );
    } catch (e) {
      console.warn('  Warning: sanctions tools not available:', e);
    }

    // --- Corporate -----------------------------------------------------------
    try {
      const {
        gleifSearchLei,
        gleifGetDirectParent,
        gleifGetUltimateParent,
        ocSearchCompanies,
        ocSearchOfficers,
        icijSearch,
      } = await import('./corporate');

      // search_entity — search across OpenCorporates, GLEIF, ICIJ in parallel
      this._tools.set('search_entity', async (query: string) => {
        const [ocResults, gleifResults, icijResults] = await Promise.allSettled([
          ocSearchCompanies(query),
          gleifSearchLei(query),
          icijSearch(query),
        ]);
        return {
          opencorporates: ocResults.status === 'fulfilled' ? ocResults.value : [],
          gleif: gleifResults.status === 'fulfilled' ? gleifResults.value : [],
          icij: icijResults.status === 'fulfilled' ? icijResults.value : [],
        };
      });

      // get_corporate_tree — ownership chain via GLEIF
      this._tools.set('get_corporate_tree', async (entityName: string) => {
        const leiRecords = await gleifSearchLei(entityName);
        if (leiRecords.length === 0) return { entity: entityName, tree: [] };
        const lei = leiRecords[0].lei;
        const [directParent, ultimateParent] = await Promise.allSettled([
          gleifGetDirectParent(lei),
          gleifGetUltimateParent(lei),
        ]);
        return {
          entity: entityName,
          lei,
          directParent: directParent.status === 'fulfilled' ? directParent.value : null,
          ultimateParent: ultimateParent.status === 'fulfilled' ? ultimateParent.value : null,
          records: leiRecords,
        };
      });

      // get_beneficial_owners — officers via OpenCorporates
      this._tools.set('get_beneficial_owners', async (entityName: string) => {
        const [officers, companies] = await Promise.allSettled([
          ocSearchOfficers(entityName),
          ocSearchCompanies(entityName),
        ]);
        return {
          entity: entityName,
          officers: officers.status === 'fulfilled' ? officers.value : [],
          companies: companies.status === 'fulfilled' ? companies.value : [],
        };
      });

      // get_offshore_connections — ICIJ Offshore Leaks
      this._tools.set('get_offshore_connections', async (entityName: string) =>
        icijSearch(entityName),
      );

      // resolve_entity — multi-source resolution
      this._tools.set('resolve_entity', async (name: string, jurisdiction?: string) => {
        const [ocResults, gleifResults] = await Promise.allSettled([
          ocSearchCompanies(name, jurisdiction),
          gleifSearchLei(name),
        ]);
        return {
          name,
          jurisdiction: jurisdiction ?? null,
          opencorporates: ocResults.status === 'fulfilled' ? ocResults.value : [],
          gleif: gleifResults.status === 'fulfilled' ? gleifResults.value : [],
        };
      });
    } catch (e) {
      console.warn('  Warning: corporate tools not available:', e);
    }

    // --- Market --------------------------------------------------------------
    try {
      const {
        yfinanceClient,
        fredGetSeries,
        fredSearchSeries,
        isPensionOrSovereign,
      } = await import('./market');

      this._tools.set('get_stock_profile', async (ticker: string) =>
        yfinanceClient.getStockProfile(ticker),
      );

      this._tools.set('get_price_history', async (ticker: string, period = '1y') =>
        yfinanceClient.getPriceData(ticker, period),
      );

      this._tools.set('get_institutional_holders', async (ticker: string) =>
        yfinanceClient.getInstitutionalHolders(ticker),
      );

      // get_market_exposure — search for ticker then get institutional holders + flag pension/sovereign
      this._tools.set('get_market_exposure', async (entityName: string) => {
        const searchResults = await fredSearchSeries(entityName, 3).catch(() => ({ seriess: [] }));
        let tickerGuess: string | null = null;

        // Attempt a best-effort ticker guess via FRED search (won't be exact, but surfaced for LLM)
        // The primary approach is to check for the entity in YF directly if a ticker looks obvious
        const upperQuery = entityName.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (upperQuery.length >= 1 && upperQuery.length <= 5) {
          tickerGuess = upperQuery;
        }

        const holders = tickerGuess
          ? await yfinanceClient.getInstitutionalHolders(tickerGuess).catch(() => [])
          : [];

        const exposedHolders = holders.filter((h) => isPensionOrSovereign(h.holderName));

        return {
          entity: entityName,
          tickerGuess,
          totalInstitutionalHolders: holders.length,
          pensionAndSovereignExposure: exposedHolders,
          fredSearchHints: searchResults,
        };
      });

      this._tools.set('get_macro_indicator', async (seriesId: string, period = '1y') =>
        fredGetSeries(seriesId, period),
      );

      // search_market_entity — search FRED for matching series
      this._tools.set('search_market_entity', async (query: string) =>
        fredSearchSeries(query, 5),
      );
    } catch (e) {
      console.warn('  Warning: market tools not available:', e);
    }

    // --- Trade ---------------------------------------------------------------
    try {
      const {
        getBilateralTradeFlows,
        getCommodityTradeFlows,
        getSupplyChainDependency,
        getTradePartnerSummary,
      } = await import('./trade');

      this._tools.set('get_bilateral_trade', async (reporter: string, partner: string, year: string) =>
        getBilateralTradeFlows(reporter, partner, year),
      );

      this._tools.set('get_commodity_trade', async (commodityCode: string, reporter: string, year: string) =>
        getCommodityTradeFlows(commodityCode, reporter, year),
      );

      this._tools.set('get_supply_chain_exposure', async (country: string, commodityCode: string) =>
        getSupplyChainDependency(country, commodityCode),
      );

      this._tools.set('get_trade_partners', async (country: string, flow = 'M', year?: string) =>
        getTradePartnerSummary(country, flow, year),
      );

      // get_shipping_connectivity — use trade openness as a proxy (no dedicated shipping API)
      this._tools.set('get_shipping_connectivity', async (country: string) => {
        const partnerData = await getTradePartnerSummary(country, 'M').catch(() => null);
        return {
          country,
          tradePartners: partnerData?.topPartners?.length ?? 0,
          totalImportValue: partnerData?.totalValue ?? null,
          note: 'Connectivity derived from Comtrade bilateral import partner count',
          partnerSummary: partnerData,
        };
      });
    } catch (e) {
      console.warn('  Warning: trade tools not available:', e);
    }

    // --- Geopolitical --------------------------------------------------------
    try {
      const {
        gdeltDocSearch,
        gdeltTimeline,
        gdeltBilateralSearch,
        acledGetEvents,
      } = await import('./geopolitical');

      this._tools.set('search_events', async (query: string, days = 30) =>
        gdeltDocSearch(query, days),
      );

      // get_conflict_data — ACLED events for a country
      this._tools.set('get_conflict_data', async (country: string, days = 30) =>
        acledGetEvents(country, days),
      );

      // get_risk_profile — GDELT search combined with ACLED
      this._tools.set('get_risk_profile', async (country: string) => {
        const [gdeltData, acledData] = await Promise.allSettled([
          gdeltDocSearch(country, 30),
          acledGetEvents(country, 90),
        ]);
        return {
          country,
          gdelt: gdeltData.status === 'fulfilled' ? gdeltData.value : null,
          acled: acledData.status === 'fulfilled' ? acledData.value : null,
        };
      });

      this._tools.set('get_bilateral_tensions', async (country1: string, country2: string, days = 90) =>
        gdeltBilateralSearch(country1, country2, days),
      );

      this._tools.set('get_event_timeline', async (query: string, days = 30) =>
        gdeltTimeline(query, days),
      );
    } catch (e) {
      console.warn('  Warning: geopolitical tools not available:', e);
    }

    // --- Economic ------------------------------------------------------------
    try {
      const {
        buildCountryProfile,
        fetchMacroSeries,
        getCommodityPrice,
        estimateSanctionImpact,
        imfGetIndicator,
      } = await import('./economic');

      this._tools.set('get_country_profile', async (country: string) =>
        buildCountryProfile(country),
      );

      // get_gdp_exposure — country profile + optional sector via IMF indicator
      this._tools.set('get_gdp_exposure', async (country: string, sector?: string) => {
        const [profile, gdpSeries] = await Promise.allSettled([
          buildCountryProfile(country),
          fetchMacroSeries('gdp', country, 5),
        ]);
        let sectorData = null;
        if (sector) {
          sectorData = await imfGetIndicator('NGDPD', country).catch(() => null);
        }
        return {
          country,
          sector: sector ?? null,
          profile: profile.status === 'fulfilled' ? profile.value : null,
          gdpSeries: gdpSeries.status === 'fulfilled' ? gdpSeries.value : null,
          sectorData,
        };
      });

      this._tools.set('get_commodity_prices', async (commodity: string, period = '1y') =>
        getCommodityPrice(commodity, period),
      );

      this._tools.set('get_macro_series', async (indicator: string, country: string, years = 5) =>
        fetchMacroSeries(indicator, country, years),
      );

      this._tools.set('estimate_sanction_impact', async (targetCountry: string, sanctionType: string) =>
        estimateSanctionImpact(targetCountry, sanctionType),
      );
    } catch (e) {
      console.warn('  Warning: economic tools not available:', e);
    }

    // --- Sayari --------------------------------------------------------------
    try {
      const { getSayariClient } = await import('./sayari');
      const sayari = getSayariClient();

      this._tools.set('sayari_resolve', async (query: string) =>
        sayari.resolve(query),
      );

      this._tools.set('sayari_get_related', async (entityId: string, depth = 1, limit = 20) =>
        sayari.getTraversal(entityId, depth, limit),
      );

      this._tools.set('sayari_get_ubo', async (entityId: string) =>
        sayari.getUbo(entityId),
      );

      this._tools.set('sayari_get_entity', async (entityId: string) =>
        sayari.getEntity(entityId),
      );
    } catch (e) {
      console.warn('  Warning: sayari tools not available:', e);
    }

    this._loaded = true;
    console.log(`  Loaded ${this._tools.size} tools`);
  }

  // -------------------------------------------------------------------------
  // callTool
  // -------------------------------------------------------------------------

  /**
   * Call a registered tool by name with the given parameters.
   *
   * Handles parameter mismatches by trying common positional-arg patterns —
   * LLM often uses "company", "name", "entity", "symbol" instead of the
   * actual parameter name a function expects.
   */
  async callTool(name: string, params: AnyRecord): Promise<unknown> {
    await this._ensureLoaded();

    const fn = this._tools.get(name);
    if (!fn) {
      return {
        error: `Unknown tool: ${name}`,
        available: this.listTools(),
      };
    }

    try {
      const result = await fn(...Object.values(params));
      return result;
    } catch (e) {
      // Parameter mismatch — try common positional arg patterns.
      // LLM often uses "query", "entity_name", "ticker", "country", etc.
      const POSITIONAL_KEYS = [
        'query',
        'entity_name',
        'ticker',
        'country',
        'name',
        'company',
        'entity',
        'symbol',
        'commodity_code',
      ];

      for (const key of POSITIONAL_KEYS) {
        if (key in params) {
          try {
            const result = await fn(params[key]);
            return result;
          } catch {
            continue;
          }
        }
      }

      // Last resort: pass first value as positional argument
      const values = Object.values(params);
      if (values.length > 0) {
        try {
          const result = await fn(values[0]);
          return result;
        } catch {
          // fall through
        }
      }

      return { error: `Tool call failed: ${(e as Error).message}` };
    }
  }

  // -------------------------------------------------------------------------
  // listTools
  // -------------------------------------------------------------------------

  /**
   * Return names of all registered tools.
   * Note: tools are lazy-loaded; call _ensureLoaded() first for a complete list.
   */
  listTools(): string[] {
    return [...this._tools.keys()];
  }
}
