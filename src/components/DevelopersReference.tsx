import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../clipboard';
import {
  DEVELOPER_REFERENCE_ENDPOINTS,
  DEVELOPER_REFERENCE_SECTIONS,
  DIRECTORY_BOUNDS,
  KNOWN_QDN_ACTIONS,
  LOCAL_READ_ACTIONS,
  RATING_VALUE_RANGE,
  ROLE_MAPPINGS,
  SUBMISSION_TIMING,
  formatDurationMs,
} from '../developerReference';
import type { BridgeState, TrustPolicy } from '../types';

// Local to the reference: its copy affordances are always English (see the module doc below), so
// they intentionally do not go through t() the way the rest of the app's chrome does.
function CopyExampleButton({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const copy = async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    const succeeded = await copyToClipboard(value);
    setStatus(succeeded ? 'copied' : 'failed');
    timerRef.current = window.setTimeout(() => setStatus('idle'), succeeded ? 1800 : 2400);
  };

  const actionLabel = status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy';

  return (
    <button
      aria-label={`${actionLabel} ${label}`}
      className="copy-value-button developer-reference__copy"
      onClick={() => void copy()}
      title={`${actionLabel} ${label}`}
      type="button"
    >
      {status === 'copied' ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      <span>{actionLabel}</span>
      <span aria-live="polite" className="sr-only">
        {status === 'copied' ? `${label} copied` : status === 'failed' ? `Copy failed: ${label}` : ''}
      </span>
    </button>
  );
}

function CopyableCode({ label, value }: { label: string; value: string }) {
  return (
    <div className="developer-reference__example">
      <code>{value}</code>
      <CopyExampleButton label={label} value={value} />
    </div>
  );
}

const RATE_ACCOUNT_REQUEST_EXAMPLE = JSON.stringify(
  { action: 'RATE_ACCOUNT', category: 'SUBJECT', rating: 2, targetPublicKey: '<target public key>' },
  null,
  2,
);

/**
 * Trust's developer/API reference: a public, always-English, always-LTR workspace documenting the
 * Core read endpoints, bridge capabilities, and rating protocol this app itself uses — distinct from
 * the community "About" wiki link. Every number below is imported from the real implementation
 * constant or the live TrustPolicy the app already loaded; nothing here re-derives, re-fetches, or
 * mutates anything (no new bridge/Core calls originate from this component).
 */
export function DevelopersReference({
  bridge,
  initialSection,
  onNavigateSection,
  policy,
}: {
  bridge: BridgeState | null;
  initialSection: string | null;
  onNavigateSection: (section: string | null) => void;
  policy: TrustPolicy | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionElementsRef = useRef<Record<string, HTMLElement | null>>({});

  const scrollToSection = (id: string) => {
    const container = containerRef.current;
    const target = sectionElementsRef.current[id];

    if (!container || !target) {
      return;
    }

    // Manual scrollTop math, confined to this container's own scroll position — never
    // element.scrollIntoView(), which can walk up and scroll ancestor scroll containers (the outer
    // Qortium Home shell this app is embedded in).
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    container.scrollTop += targetRect.top - containerRect.top;
  };

  useEffect(() => {
    if (initialSection) {
      scrollToSection(initialSection);
    }
    // Re-run only when the requested section identity changes (a TOC click or browser Back/Forward
    // landing on a different #section), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  const selectSection = (id: string) => {
    onNavigateSection(id);
    scrollToSection(id);
  };

  const liveActions = bridge?.actions ?? null;

  return (
    <section
      aria-labelledby="developers-reference-title"
      className="developers-reference"
      dir="ltr"
      lang="en"
    >
      <header className="developers-reference__header">
        <h2 id="developers-reference-title">Developers reference</h2>
        <p className="developers-reference__intro">
          A public, technical reference for how Trust reads Qortium Core’s trust APIs and submits
          ratings through Qortium Home. This page always renders in English, regardless of the
          app’s display language — it documents an API surface, not the app’s own copy.
        </p>
        <nav aria-label="Developers reference sections" className="developers-reference__toc">
          <ul>
            {DEVELOPER_REFERENCE_SECTIONS.map((section) => (
              <li key={section.id}>
                <button onClick={() => selectSection(section.id)} type="button">
                  {section.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="developers-reference__body" ref={containerRef}>
        <section
          aria-labelledby="developers-reference-overview-title"
          id="overview"
          ref={(el) => {
            sectionElementsRef.current.overview = el;
          }}
        >
          <h3 id="developers-reference-overview-title">Overview</h3>
          <p>
            Trust runs inside Qortium Home through the <code>qdnRequest</code> bridge, with a
            read-only browser fallback that talks to a local Core node directly. Everything below is
            sourced from the app’s own implementation — endpoint paths, bridge action names, and
            protocol constants — not from chain policy, which Core can change independently.
          </p>
        </section>

        <section
          aria-labelledby="developers-reference-endpoints-title"
          id="endpoints"
          ref={(el) => {
            sectionElementsRef.current.endpoints = el;
          }}
        >
          <h3 id="developers-reference-endpoints-title">Core read endpoints</h3>
          <p>Every Core endpoint Trust reads. All are plain HTTP GET requests; none are mutating.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Path</th>
                  <th scope="col">Description</th>
                </tr>
              </thead>
              <tbody>
                {DEVELOPER_REFERENCE_ENDPOINTS.map((endpoint) => (
                  <tr key={endpoint.path}>
                    <td>
                      <CopyableCode label={endpoint.path} value={`${endpoint.method} ${endpoint.path}`} />
                    </td>
                    <td>{endpoint.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="developers-reference-policy-title"
          id="policy"
          ref={(el) => {
            sectionElementsRef.current.policy = el;
          }}
        >
          <h3 id="developers-reference-policy-title">Live policy &amp; units</h3>
          {policy ? (
            <>
              <div className="detail-grid">
                <div>
                  <span>Active weight category</span>
                  <strong>{policy.activeWeightCategory}</strong>
                </div>
                <div>
                  <span>Starting energy</span>
                  <strong>{policy.startingEnergy}</strong>
                </div>
                <div>
                  <span>Manager energy hops</span>
                  <strong>{policy.managerEnergyHops}</strong>
                </div>
                <div>
                  <span>Positive min branch count</span>
                  <strong>{policy.positiveMinBranchCount}</strong>
                </div>
                <div>
                  <span>Suspicious min rater count</span>
                  <strong>{policy.suspiciousMinRaterCount}</strong>
                </div>
                <div>
                  <span>Suspicious min branch count</span>
                  <strong>{policy.suspiciousMinBranchCount}</strong>
                </div>
                <div>
                  <span>Suspicious min rating confidence</span>
                  <strong>{policy.suspiciousMinRatingConfidence}</strong>
                </div>
                <div>
                  <span>Rating change cooldown (blocks)</span>
                  <strong>{policy.accountRatingChangeCooldownBlocks}</strong>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <caption className="table-caption">Status vote weights</caption>
                  <thead>
                    <tr>
                      <th scope="col">Status</th>
                      <th scope="col">Vote weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(policy.statusVoteWeights ?? []).map((entry) => (
                      <tr key={entry.status}>
                        <td>{entry.status}</td>
                        <td>{entry.voteWeightPercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table>
                  <caption className="table-caption">Per-category suspicious thresholds</caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Suspicious threshold</th>
                      <th scope="col">Suspicious level-score cap</th>
                      <th scope="col">Configured levels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(policy.categoryPolicies ?? []).map((entry) => (
                      <tr key={entry.category}>
                        <td>{entry.category}</td>
                        <td>{entry.suspiciousThreshold}</td>
                        <td>{entry.suspiciousLevelScoreCap}</td>
                        <td>{entry.levels.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p role="status">
              Live policy is unavailable right now — open Trust in Qortium Home or against a synced
              Core node to see current values. These are on-chain, governance-configured values that
              can change; nothing on this page freezes them as fixed documentation.
            </p>
          )}
        </section>

        <section
          aria-labelledby="developers-reference-roles-title"
          id="roles"
          ref={(el) => {
            sectionElementsRef.current.roles = el;
          }}
        >
          <h3 id="developers-reference-roles-title">Role mapping</h3>
          <p>
            Core’s wire categories are renamed for the public-facing role names everywhere in this
            app’s UI. Evaluator role is who must trust the rater for their rating in that category to
            count at all — Designers are the exception, since their influence is a shared pool rather
            than a separate evaluator role.
          </p>
          <p>
            The categories form one trust chain, not four parallel opinions:{' '}
            <strong>Designers (MANAGER) → Guides (TRAINER) → Voters (PLAYER) → Minters (SUBJECT)</strong>.
            Minters receive the final standing; each upstream role determines whose ratings count at
            the next step, with Designers sharing a limited influence pool.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Wire category</th>
                  <th scope="col">Public name</th>
                  <th scope="col">Evaluator role</th>
                  <th scope="col">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_MAPPINGS.map((role) => (
                  <tr key={role.wireCategory}>
                    <td>
                      <code>{role.wireCategory}</code>
                    </td>
                    <td>{role.publicName}</td>
                    <td>{role.evaluatorRole ?? '—'}</td>
                    <td>{role.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="developers-reference-ratings-title"
          id="ratings"
          ref={(el) => {
            sectionElementsRef.current.ratings = el;
          }}
        >
          <h3 id="developers-reference-ratings-title">Rating values</h3>
          <p>
            A rating is a signed integer confidence from {RATING_VALUE_RANGE.min} to{' '}
            {RATING_VALUE_RANGE.max} ({RATING_VALUE_RANGE.values.join(', ')}); a rating of{' '}
            {RATING_VALUE_RANGE.removalValue} removes an existing rating rather than setting it to a
            zero-weight vote. Negative ratings weigh more heavily than positive ones in the
            derivation and can mark an account Suspicious, which blocks minting.
          </p>
        </section>

        <section
          aria-labelledby="developers-reference-capabilities-title"
          id="capabilities"
          ref={(el) => {
            sectionElementsRef.current.capabilities = el;
          }}
        >
          <h3 id="developers-reference-capabilities-title">Bridge capabilities</h3>
          <p>
            Home advertises which <code>qdnRequest</code> actions it supports via{' '}
            <code>SHOW_ACTIONS</code>. Trust gates its own features — rating submission chief among
            them — on whether <code>RATE_ACCOUNT</code> is present, rather than assuming Home version
            or runtime.
          </p>
          <p>
            <strong>{liveActions ? 'Currently advertised (live):' : 'Not yet resolved.'}</strong>
            {liveActions ? ` ${liveActions.join(', ')}` : null}
          </p>
          <p>
            <strong>Browser-dev fallback (no Home bridge):</strong> {LOCAL_READ_ACTIONS.join(', ')}
          </p>
          <p>
            <strong>Every action name Trust knows:</strong> {KNOWN_QDN_ACTIONS.join(', ')}
          </p>
        </section>

        <section
          aria-labelledby="developers-reference-identity-title"
          id="identity"
          ref={(el) => {
            sectionElementsRef.current.identity = el;
          }}
        >
          <h3 id="developers-reference-identity-title">Selected account, lock &amp; approval</h3>
          <p>
            The rater is resolved via <code>GET_SELECTED_ACCOUNT</code>, then its public key is read
            from <code>GET /addresses/{'{address}'}</code> — which is <code>null</code> until that
            account has an on-chain transaction, so a brand-new account cannot yet rate. Submitting
            reads the account’s live lock state and requests <code>UNLOCK_SELECTED_ACCOUNT</code> only
            when the account is locked or its state is unknown. Home owns the password dialog and
            advertises this Home-account action through <code>SHOW_ACTIONS</code> on both bridge
            protocols; approval is still a single user action and never exposes a private key to Trust.
          </p>
          <p>An inert example of the request Trust sends Home to submit a rating:</p>
          <CopyableCode label="RATE_ACCOUNT request example" value={RATE_ACCOUNT_REQUEST_EXAMPLE} />
        </section>

        <section
          aria-labelledby="developers-reference-submission-title"
          id="submission"
          ref={(el) => {
            sectionElementsRef.current.submission = el;
          }}
        >
          <h3 id="developers-reference-submission-title">Asynchronous submission</h3>
          <p>
            Home’s single proof-of-work worker processes one rating broadcast at a time; Trust queues
            requests rather than sending them concurrently, and each queued job re-checks the live
            lock state and identity when it starts (not when it was queued). A submission closes its
            editor immediately and shows a pending spinner while it waits.
          </p>
          <p>
            Confirmation is polled every {formatDurationMs(SUBMISSION_TIMING.pollIntervalMs)} by
            re-reading <code>GET /account-ratings/cooldown</code> and comparing{' '}
            <code>activeRating</code> against the submitted value. An entry that has not confirmed
            after {formatDurationMs(SUBMISSION_TIMING.timeoutMs)} stops polling and surfaces a
            Retry/Dismiss notice instead of polling forever.
          </p>
          <p>
            A broadcast whose outcome is uncertain (a missing response, <code>BROADCAST_UNKNOWN</code>,
            or <code>accepted: false</code> without an error) is marked unknown and reconciled purely
            through this same read-based polling — it is never automatically resubmitted.
          </p>
        </section>

        <section
          aria-labelledby="developers-reference-readonly-title"
          id="readonly"
          ref={(el) => {
            sectionElementsRef.current.readonly = el;
          }}
        >
          <h3 id="developers-reference-readonly-title">Read-only fallback</h3>
          <p>
            The full explorer — accounts, changes, and every read endpoint above — stays available
            without <code>RATE_ACCOUNT</code>; only rating submission is gated on it. Outside Qortium
            Home there is no key to sign with at all, so the browser-dev fallback (
            <code>WHICH_UI</code> = <code>BROWSER_DEV</code>) is always read-only, regardless of which
            actions a local node’s bridge stub might otherwise claim to support.
          </p>
        </section>

        <section
          aria-labelledby="developers-reference-bounds-title"
          id="bounds"
          ref={(el) => {
            sectionElementsRef.current.bounds = el;
          }}
        >
          <h3 id="developers-reference-bounds-title">Directory &amp; activity bounds</h3>
          <div className="detail-grid">
            <div>
              <span>Accounts page size</span>
              <strong>{DIRECTORY_BOUNDS.pageSize}</strong>
            </div>
            <div>
              <span>Ratings page size</span>
              <strong>{DIRECTORY_BOUNDS.ratingPageSize}</strong>
            </div>
            <div>
              <span>Max full-directory scan</span>
              <strong>{DIRECTORY_BOUNDS.maxDerivationLimit.toLocaleString()}</strong>
            </div>
            <div>
              <span>Max ratings scanned per query</span>
              <strong>{DIRECTORY_BOUNDS.maxRatingsScan.toLocaleString()}</strong>
            </div>
          </div>
          <p>
            Recent-activity reads grow through {DIRECTORY_BOUNDS.activityScanPrefixes
              .map((prefix) => prefix.toLocaleString())
              .join(' → ')}{' '}
            transaction prefixes; a full final prefix, an incomplete directory, an unsupported
            endpoint, or a failed read all cause an explicit fallback to the loaded accounts sorted by
            name — never a silent, possibly-incomplete “recent” ordering.
          </p>
        </section>

        <section
          aria-labelledby="developers-reference-privacy-title"
          id="privacy"
          ref={(el) => {
            sectionElementsRef.current.privacy = el;
          }}
        >
          <h3 id="developers-reference-privacy-title">Data &amp; privacy</h3>
          <p>
            Confirmed ratings and trust status are public on-chain state read through Core’s REST APIs;
            names and avatars are identity metadata resolved through Qortium Home’s bridge. The current
            rating draft, selected account, pending confirmation state, and read/preview responses are
            local app state or read results and are not public ratings. Rating submission is sent to
            Home for its signed broadcast to Core; Trust does not receive or handle a private key.
          </p>
        </section>
      </div>
    </section>
  );
}
