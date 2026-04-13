<script lang="ts">
  import { onMount } from "svelte";
  import {
    aicoFlowsApi,
    type AicoFlow,
    type TriggerResponse,
  } from "../aicoApi";
  import {
    toastService,
    PageLayout,
    SectionPanel,
    Button,
    FormField,
    Badge,
    StateBlock,
  } from "@aico/blueprint";

  let flows = $state<AicoFlow[]>([]);
  let loadingFlows = $state(true);
  let triggering = $state(false);

  // Form state
  let organizationId = $state("DEMO");
  let selectedFlowSlug = $state("");
  let destination = $state("");
  let userId = $state("");
  let variablesJson = $state("");

  // Result state
  let lastResult = $state<TriggerResponse | null>(null);
  let lastError = $state<string | null>(null);
  let triggerHistory = $state<
    Array<{
      timestamp: Date;
      flow: string;
      destination: string;
      result: TriggerResponse | null;
      error: string | null;
    }>
  >([]);

  const selectedFlow = $derived(
    flows.find((f) => f.slug === selectedFlowSlug),
  );

  onMount(() => {
    loadFlows();
  });

  async function loadFlows() {
    loadingFlows = true;
    try {
      flows = await aicoFlowsApi.list(organizationId);
      if (flows.length > 0 && !selectedFlowSlug) {
        selectedFlowSlug = flows[0].slug;
      }
    } catch (error) {
      toastService.error(
        `Failed to load flows: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      loadingFlows = false;
    }
  }

  async function handleTrigger() {
    if (!selectedFlowSlug) {
      toastService.error("Select a flow first");
      return;
    }

    triggering = true;
    lastResult = null;
    lastError = null;

    let variables: Record<string, unknown> | undefined;
    if (variablesJson.trim()) {
      try {
        variables = JSON.parse(variablesJson);
      } catch {
        toastService.error("Invalid JSON in variables field");
        triggering = false;
        return;
      }
    }

    try {
      const result = await aicoFlowsApi.trigger(
        organizationId,
        selectedFlowSlug,
        {
          destination: destination || undefined,
          userId: userId || undefined,
          variables,
        },
      );
      lastResult = result;
      toastService.success(
        `Flow triggered — session ${result.sessionId.slice(0, 12)}...`,
      );
      triggerHistory = [
        {
          timestamp: new Date(),
          flow: selectedFlowSlug,
          destination: destination || "(none)",
          result,
          error: null,
        },
        ...triggerHistory,
      ].slice(0, 20);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Unknown error";
      lastError = msg;
      toastService.error(`Trigger failed: ${msg}`);
      triggerHistory = [
        {
          timestamp: new Date(),
          flow: selectedFlowSlug,
          destination: destination || "(none)",
          result: null,
          error: msg,
        },
        ...triggerHistory,
      ].slice(0, 20);
    } finally {
      triggering = false;
    }
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
</script>

<PageLayout
  title="Flow Trigger"
  description="Trigger outbound calls via the AICO flow engine."
  maxWidth="lg"
  spacing="md"
>
  <div class="trigger-grid">
    <div class="trigger-form">
      <SectionPanel title="Configuration" icon="settings">
        <div class="form-stack">
          <FormField label="Organization ID">
            <div class="org-row">
              <input
                type="text"
                bind:value={organizationId}
                placeholder="DEMO"
              />
              <Button
                variant="secondary"
                size="sm"
                icon="refresh-cw"
                onclick={loadFlows}
                loading={loadingFlows}
              >
                Reload
              </Button>
            </div>
          </FormField>

          <FormField label="Flow" required>
            {#if loadingFlows}
              <select disabled>
                <option>Loading flows...</option>
              </select>
            {:else if flows.length === 0}
              <select disabled>
                <option>No flows found</option>
              </select>
            {:else}
              <select bind:value={selectedFlowSlug}>
                {#each flows as flow}
                  <option value={flow.slug}>
                    {flow.name} ({flow.slug})
                  </option>
                {/each}
              </select>
            {/if}
          </FormField>
        </div>
      </SectionPanel>

      <SectionPanel title="Trigger" icon="phone-outgoing">
        <div class="form-stack">
          <FormField
            label="Destination"
            help="Phone number or SIP URI to dial"
          >
            <input
              type="tel"
              bind:value={destination}
              placeholder="+4915158152571"
            />
          </FormField>

          <FormField
            label="User ID"
            help="Optional — links session to user memory"
          >
            <input
              type="text"
              bind:value={userId}
              placeholder="(optional)"
            />
          </FormField>

          <FormField
            label="Variables"
            help="Optional JSON object for initial session variables"
          >
            <textarea
              bind:value={variablesJson}
              placeholder={'{"customerName": "Max Mustermann"}'}
              rows="3"
            ></textarea>
          </FormField>

          <div class="trigger-actions">
            <Button
              variant="primary"
              size="lg"
              icon="phone-outgoing"
              onclick={handleTrigger}
              loading={triggering}
              disabled={!selectedFlowSlug || loadingFlows}
              fullWidth
            >
              {destination ? `Call ${destination}` : "Trigger Flow"}
            </Button>
          </div>
        </div>
      </SectionPanel>
    </div>

    <div class="trigger-result">
      <SectionPanel title="Last Result" icon="terminal">
        {#if lastResult}
          <div class="result-block">
            <div class="result-row">
              <span class="result-label">Status</span>
              <Badge
                tone={lastResult.status === "started"
                  ? "positive"
                  : lastResult.status === "completed"
                    ? "info"
                    : "critical"}
                label={lastResult.status}
              />
            </div>
            <div class="result-row">
              <span class="result-label">Session ID</span>
              <code class="result-value">{lastResult.sessionId}</code>
            </div>
            {#if lastResult.roomName}
              <div class="result-row">
                <span class="result-label">Room</span>
                <code class="result-value">{lastResult.roomName}</code>
              </div>
            {/if}
            {#if lastResult.duration != null}
              <div class="result-row">
                <span class="result-label">Duration</span>
                <span class="result-value">{lastResult.duration}ms</span>
              </div>
            {/if}
            {#if lastResult.error}
              <div class="result-row result-error">
                <span class="result-label">Error</span>
                <span class="result-value">{lastResult.error}</span>
              </div>
            {/if}
          </div>
        {:else if lastError}
          <div class="result-block result-error">
            <p>{lastError}</p>
          </div>
        {:else}
          <StateBlock
            variant="empty"
            title="No triggers yet"
            message="Trigger a flow to see results here."
          />
        {/if}
      </SectionPanel>

      {#if triggerHistory.length > 0}
        <SectionPanel title="History" icon="history">
          <div class="history-list">
            {#each triggerHistory as entry}
              <div class="history-entry">
                <div class="history-meta">
                  <Badge
                    tone={entry.error
                      ? "critical"
                      : entry.result?.status === "started"
                        ? "positive"
                        : "info"}
                    size="sm"
                    label={entry.error
                      ? "error"
                      : (entry.result?.status ?? "unknown")}
                  />
                  <span class="history-time">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <div class="history-detail">
                  <span class="history-flow">{entry.flow}</span>
                  <span class="history-dest">{entry.destination}</span>
                </div>
                {#if entry.result?.sessionId}
                  <code class="history-session">
                    {entry.result.sessionId.slice(0, 20)}...
                  </code>
                {/if}
              </div>
            {/each}
          </div>
        </SectionPanel>
      {/if}
    </div>
  </div>
</PageLayout>

<style>
  .trigger-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--blueprint-spacing-lg);
    align-items: start;
  }

  @media (max-width: 960px) {
    .trigger-grid {
      grid-template-columns: 1fr;
    }
  }

  .trigger-form,
  .trigger-result {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-md);
  }

  .form-stack {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-md);
  }

  .org-row {
    display: flex;
    gap: var(--blueprint-spacing-sm);
    align-items: stretch;
  }

  .org-row input {
    flex: 1;
  }

  .trigger-actions {
    padding-top: var(--blueprint-spacing-sm);
  }

  textarea {
    font-family: var(--blueprint-font-mono);
    font-size: 0.85rem;
    resize: vertical;
  }

  .result-block {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-sm);
  }

  .result-row {
    display: flex;
    align-items: center;
    gap: var(--blueprint-spacing-md);
  }

  .result-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--aico-color-text-tertiary);
    min-width: 80px;
    flex-shrink: 0;
  }

  .result-value {
    font-size: 0.85rem;
    word-break: break-all;
  }

  code.result-value {
    font-family: var(--blueprint-font-mono);
    font-size: 0.8rem;
    color: var(--aico-color-text-secondary);
  }

  .result-error {
    color: var(--aico-danger);
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: var(--blueprint-spacing-xs);
  }

  .history-entry {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--blueprint-spacing-sm);
    border: 1px solid var(--aico-color-border-light);
    border-radius: var(--blueprint-radius-sm);
  }

  .history-meta {
    display: flex;
    align-items: center;
    gap: var(--blueprint-spacing-sm);
  }

  .history-time {
    font-size: 0.75rem;
    color: var(--aico-color-text-tertiary);
  }

  .history-detail {
    display: flex;
    gap: var(--blueprint-spacing-sm);
    font-size: 0.85rem;
  }

  .history-flow {
    font-weight: 500;
  }

  .history-dest {
    color: var(--aico-color-text-secondary);
  }

  code.history-session {
    font-family: var(--blueprint-font-mono);
    font-size: 0.72rem;
    color: var(--aico-color-text-tertiary);
  }
</style>
