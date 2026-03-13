export type MatchSource = "fingerprint" | "ngram" | "trigger";

export type MatchSignal = {
  source: MatchSource;
  currentPageScore: number;
  nextPageScore: number;
  suggestedPage: number | null;
  confidence: number;
};

export type TriggerData = {
  pageNumber: number;
  tokens: string[];
  confidence: number;
};

export type CoordinatorDecision = {
  action: "turn" | "hold";
  targetPage: number | null;
  reason: string;
  fingerprintConfidence: number;
  ngramConfidence: number;
  triggerConfidence: number;
  agreement: boolean;
};

export type CoordinatorConfig = {
  fingerprintThreshold: number;
  ngramThreshold: number;
  triggerMatchThreshold: number;
  agreementBonus: number;
  disagreementPenalty: number;
  requiredConsecutiveAgreements: number;
};

const DEFAULT_CONFIG: CoordinatorConfig = {
  // Production-biased defaults: prefer missed turns over false turns.
  // Live mode already has manual override; accidental page jumps are harder to recover from.
  fingerprintThreshold: 65,
  ngramThreshold: 2,
  triggerMatchThreshold: 3,
  agreementBonus: 20,
  disagreementPenalty: 30,
  requiredConsecutiveAgreements: 2,
};

export class PageMatchCoordinator {
  private config: CoordinatorConfig;
  private currentPage: number = 1;
  private consecutiveAgreements: number = 0;
  private lastAgreedPage: number | null = null;
  private hasFingerprintData: boolean = false;
  
  private latestFingerprint: MatchSignal | null = null;
  private latestNgram: MatchSignal | null = null;
  private latestTrigger: MatchSignal | null = null;
  
  private triggersByPage: Map<number, TriggerData> = new Map();
  private recentTranscriptTokens: string[] = [];

  constructor(config: Partial<CoordinatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setCurrentPage(page: number) {
    this.currentPage = page;
    this.consecutiveAgreements = 0;
    this.lastAgreedPage = null;
    this.latestFingerprint = null;
    this.latestNgram = null;
    this.latestTrigger = null;
    this.recentTranscriptTokens = [];
    console.log(`[Coordinator] Page set to ${page}, buffers reset`);
  }

  setHasFingerprintData(hasData: boolean) {
    this.hasFingerprintData = hasData;
  }
  
  setTriggers(triggers: TriggerData[]) {
    this.triggersByPage.clear();
    for (const t of triggers) {
      this.triggersByPage.set(t.pageNumber, t);
    }
    console.log(`[Coordinator] Loaded ${triggers.length} page triggers`);
  }
  
  updateRecentTranscript(tokens: string[]) {
    this.recentTranscriptTokens = tokens.slice(-10);
    this.checkTriggerMatch();
  }
  
  private checkTriggerMatch() {
    const nextPage = this.currentPage + 1;
    const triggerForCurrentPage = this.triggersByPage.get(this.currentPage);
    
    if (!triggerForCurrentPage || triggerForCurrentPage.tokens.length === 0) {
      this.latestTrigger = null;
      return;
    }
    
    const triggerTokens = triggerForCurrentPage.tokens.map(t => t.toLowerCase());
    const transcriptLower = this.recentTranscriptTokens.map(t => t.toLowerCase());
    
    let matchCount = 0;
    for (const trigger of triggerTokens) {
      if (transcriptLower.some(t => t.includes(trigger) || trigger.includes(t))) {
        matchCount++;
      }
    }
    
    const matchRatio = triggerTokens.length > 0 ? matchCount / triggerTokens.length : 0;
    const confidence = matchRatio * 100;
    const suggestedPage = matchCount >= this.config.triggerMatchThreshold || matchRatio >= 0.6 ? nextPage : null;
    
    this.latestTrigger = {
      source: "trigger",
      currentPageScore: matchCount,
      nextPageScore: matchCount,
      suggestedPage,
      confidence,
    };
    
    if (matchCount > 0) {
      console.log(`[Coordinator] Trigger: ${matchCount}/${triggerTokens.length} matches (${confidence.toFixed(1)}%), suggests=${suggestedPage || 'hold'}`);
    }
  }

  reportFingerprintMatch(currentScore: number, nextScore: number) {
    const nextPage = this.currentPage + 1;
    const suggestedPage = nextScore > currentScore + 10 ? nextPage : null;
    
    this.latestFingerprint = {
      source: "fingerprint",
      currentPageScore: currentScore,
      nextPageScore: nextScore,
      suggestedPage,
      confidence: nextScore,
    };
    
    console.log(`[Coordinator] Fingerprint: current=${currentScore.toFixed(1)}, next=${nextScore.toFixed(1)}, suggests=${suggestedPage || 'hold'}`);
    
    return this.evaluate();
  }

  reportNgramMatch(currentMatches: number, nextMatches: number, totalNgrams: number) {
    const nextPage = this.currentPage + 1;
    const ngramConfidence = totalNgrams > 0 ? (nextMatches / Math.max(totalNgrams, 1)) * 100 : 0;
    const suggestedPage = nextMatches >= this.config.ngramThreshold && nextMatches > currentMatches ? nextPage : null;
    
    this.latestNgram = {
      source: "ngram",
      currentPageScore: currentMatches,
      nextPageScore: nextMatches,
      suggestedPage,
      confidence: ngramConfidence,
    };
    
    console.log(`[Coordinator] N-gram: current=${currentMatches}, next=${nextMatches}, total=${totalNgrams}, suggests=${suggestedPage || 'hold'}`);
    
    return this.evaluate();
  }

  private evaluate(): CoordinatorDecision {
    const fp = this.latestFingerprint;
    const ng = this.latestNgram;
    const tr = this.latestTrigger;
    const nextPage = this.currentPage + 1;
    
    const fpConfidence = fp?.confidence ?? 0;
    const ngConfidence = ng?.confidence ?? 0;
    const trConfidence = tr?.confidence ?? 0;
    const fpSuggests = fp?.suggestedPage;
    const ngSuggests = ng?.suggestedPage;
    const trSuggests = tr?.suggestedPage;
    
    let decision: CoordinatorDecision = {
      action: "hold",
      targetPage: null,
      reason: "insufficient_data",
      fingerprintConfidence: fpConfidence,
      ngramConfidence: ngConfidence,
      triggerConfidence: trConfidence,
      agreement: false,
    };

    // Check for trigger word match first - strong trigger signal can confirm page turn
    if (trSuggests === nextPage && trConfidence >= 60) {
      decision = {
        action: "turn",
        targetPage: nextPage,
        reason: "trigger_match",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        triggerConfidence: trConfidence,
        agreement: false,
      };
      console.log(`[Coordinator] Decision: ${decision.action} (${decision.reason}) trigger=${trConfidence.toFixed(1)}%`);
      return decision;
    }

    if (!this.hasFingerprintData) {
      if (ngSuggests === nextPage && ngConfidence >= 20) {
        decision = {
          action: "turn",
          targetPage: nextPage,
          reason: "ngram_only_mode",
          fingerprintConfidence: 0,
          ngramConfidence: ngConfidence,
          triggerConfidence: trConfidence,
          agreement: false,
        };
      } else {
        decision.reason = "ngram_only_insufficient";
      }
      console.log(`[Coordinator] Decision: ${decision.action} (${decision.reason})`);
      return decision;
    }

    const bothAgree = fpSuggests === nextPage && ngSuggests === nextPage;
    const bothHold = fpSuggests === null && ngSuggests === null;
    const disagree = (fpSuggests !== null && ngSuggests !== null && fpSuggests !== ngSuggests);
    
    // If trigger matches and either fp or ng agrees, that's strong confirmation
    const triggerPlusOne = trSuggests === nextPage && (fpSuggests === nextPage || ngSuggests === nextPage);

    if (triggerPlusOne) {
      decision = {
        action: "turn",
        targetPage: nextPage,
        reason: "trigger_confirmed",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        triggerConfidence: trConfidence,
        agreement: true,
      };
    } else if (bothAgree) {
      if (this.lastAgreedPage === nextPage) {
        this.consecutiveAgreements++;
      } else {
        this.consecutiveAgreements = 1;
        this.lastAgreedPage = nextPage;
      }
      
      if (this.consecutiveAgreements >= this.config.requiredConsecutiveAgreements) {
        decision = {
          action: "turn",
          targetPage: nextPage,
          reason: "both_agree",
          fingerprintConfidence: fpConfidence,
          ngramConfidence: ngConfidence,
          triggerConfidence: trConfidence,
          agreement: true,
        };
      } else {
        decision = {
          action: "hold",
          targetPage: null,
          reason: `agreement_pending_${this.consecutiveAgreements}/${this.config.requiredConsecutiveAgreements}`,
          fingerprintConfidence: fpConfidence,
          ngramConfidence: ngConfidence,
          triggerConfidence: trConfidence,
          agreement: true,
        };
      }
    } else if (disagree) {
      this.consecutiveAgreements = 0;
      this.lastAgreedPage = null;
      decision = {
        action: "hold",
        targetPage: null,
        reason: "disagreement",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        triggerConfidence: trConfidence,
        agreement: false,
      };
    } else if (fpSuggests === nextPage && fpConfidence >= this.config.fingerprintThreshold) {
      decision = {
        action: "turn",
        targetPage: nextPage,
        reason: "fingerprint_strong",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        triggerConfidence: trConfidence,
        agreement: false,
      };
    } else if (ngSuggests === nextPage && ng && ng.nextPageScore >= this.config.ngramThreshold * 2) {
      decision = {
        action: "turn",
        targetPage: nextPage,
        reason: "ngram_strong",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        triggerConfidence: trConfidence,
        agreement: false,
      };
    } else if (bothHold) {
      this.consecutiveAgreements = 0;
      this.lastAgreedPage = null;
      decision = {
        action: "hold",
        targetPage: null,
        reason: "both_hold",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        triggerConfidence: trConfidence,
        agreement: true,
      };
    } else {
      decision = {
        action: "hold",
        targetPage: null,
        reason: "uncertain",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        triggerConfidence: trConfidence,
        agreement: false,
      };
    }

    console.log(`[Coordinator] Decision: ${decision.action} (${decision.reason}) fp=${fpConfidence.toFixed(1)}% ng=${ngConfidence.toFixed(1)}% tr=${trConfidence.toFixed(1)}%`);
    return decision;
  }

  reset() {
    this.consecutiveAgreements = 0;
    this.lastAgreedPage = null;
    this.latestFingerprint = null;
    this.latestNgram = null;
    this.latestTrigger = null;
    this.recentTranscriptTokens = [];
    console.log(`[Coordinator] Reset`);
  }
}
