export type MatchSource = "fingerprint" | "ngram";

export type MatchSignal = {
  source: MatchSource;
  currentPageScore: number;
  nextPageScore: number;
  suggestedPage: number | null;
  confidence: number;
};

export type CoordinatorDecision = {
  action: "turn" | "hold";
  targetPage: number | null;
  reason: string;
  fingerprintConfidence: number;
  ngramConfidence: number;
  agreement: boolean;
};

export type CoordinatorConfig = {
  fingerprintThreshold: number;
  ngramThreshold: number;
  agreementBonus: number;
  disagreementPenalty: number;
  requiredConsecutiveAgreements: number;
};

const DEFAULT_CONFIG: CoordinatorConfig = {
  fingerprintThreshold: 60,
  ngramThreshold: 2,
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

  constructor(config: Partial<CoordinatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setCurrentPage(page: number) {
    this.currentPage = page;
    this.consecutiveAgreements = 0;
    this.lastAgreedPage = null;
    this.latestFingerprint = null;
    this.latestNgram = null;
    console.log(`[Coordinator] Page set to ${page}, buffers reset`);
  }

  setHasFingerprintData(hasData: boolean) {
    this.hasFingerprintData = hasData;
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
    const nextPage = this.currentPage + 1;
    
    const fpConfidence = fp?.confidence ?? 0;
    const ngConfidence = ng?.confidence ?? 0;
    const fpSuggests = fp?.suggestedPage;
    const ngSuggests = ng?.suggestedPage;
    
    let decision: CoordinatorDecision = {
      action: "hold",
      targetPage: null,
      reason: "insufficient_data",
      fingerprintConfidence: fpConfidence,
      ngramConfidence: ngConfidence,
      agreement: false,
    };

    if (!this.hasFingerprintData) {
      if (ngSuggests === nextPage && ngConfidence >= 20) {
        decision = {
          action: "turn",
          targetPage: nextPage,
          reason: "ngram_only_mode",
          fingerprintConfidence: 0,
          ngramConfidence: ngConfidence,
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
    const disagree = (fpSuggests !== null && ngSuggests !== null && fpSuggests !== ngSuggests) ||
                     (fpSuggests === nextPage && ngSuggests === null && ngConfidence > 10) ||
                     (ngSuggests === nextPage && fpSuggests === null && fpConfidence > 30);

    if (bothAgree) {
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
          agreement: true,
        };
      } else {
        decision = {
          action: "hold",
          targetPage: null,
          reason: `agreement_pending_${this.consecutiveAgreements}/${this.config.requiredConsecutiveAgreements}`,
          fingerprintConfidence: fpConfidence,
          ngramConfidence: ngConfidence,
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
        agreement: false,
      };
    } else if (fpSuggests === nextPage && fpConfidence >= this.config.fingerprintThreshold) {
      decision = {
        action: "turn",
        targetPage: nextPage,
        reason: "fingerprint_strong",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        agreement: false,
      };
    } else if (ngSuggests === nextPage && ng && ng.nextPageScore >= this.config.ngramThreshold * 2) {
      decision = {
        action: "turn",
        targetPage: nextPage,
        reason: "ngram_strong",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
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
        agreement: true,
      };
    } else {
      decision = {
        action: "hold",
        targetPage: null,
        reason: "uncertain",
        fingerprintConfidence: fpConfidence,
        ngramConfidence: ngConfidence,
        agreement: false,
      };
    }

    console.log(`[Coordinator] Decision: ${decision.action} (${decision.reason}) fp=${fpConfidence.toFixed(1)}% ng=${ngConfidence.toFixed(1)}%`);
    return decision;
  }

  reset() {
    this.consecutiveAgreements = 0;
    this.lastAgreedPage = null;
    this.latestFingerprint = null;
    this.latestNgram = null;
    console.log(`[Coordinator] Reset`);
  }
}
