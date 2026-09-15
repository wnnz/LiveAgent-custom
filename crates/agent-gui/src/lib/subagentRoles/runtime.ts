import { createProviderRuntimeConfig } from "../providers/llm";
import type { ProviderRuntimeConfig } from "../providers/runtime/types";
import {
  type ChatRuntimeControls,
  type CustomProvider,
  getChatRuntimeReasoningProviderKey,
  type ProviderId,
} from "../settings";
import type { SubagentTemplate } from "../subagents";

export type ResolvedSubagentRoleRuntime = {
  providerId: ProviderId;
  model: string;
  runtime: ProviderRuntimeConfig;
  fallbackReason?: string;
};

function roleControls(
  base: ChatRuntimeControls,
  template: SubagentTemplate | undefined,
  provider: CustomProvider,
): ChatRuntimeControls {
  if (!template) return base;
  const key = getChatRuntimeReasoningProviderKey({
    providerId: provider.type,
    requestFormat: provider.requestFormat,
  });
  const reasoning = template.reasoning;
  return {
    ...base,
    thinkingEnabled: template.thinkingEnabled ?? base.thinkingEnabled,
    ...(reasoning ? { reasoning } : {}),
    reasoningByProvider: reasoning
      ? { ...base.reasoningByProvider, [key]: reasoning }
      : base.reasoningByProvider,
  };
}

/**
 * Resolve one delegated role without leaking settings concerns into the core
 * subagent runner. A stale binding deliberately falls back to the parent
 * model, while retaining the role's supported thinking preference.
 */
export function resolveSubagentRoleRuntime(params: {
  template?: SubagentTemplate;
  providers: readonly CustomProvider[];
  controls: ChatRuntimeControls;
  parent: ResolvedSubagentRoleRuntime;
  parentProvider?: CustomProvider;
}): ResolvedSubagentRoleRuntime {
  const selected = params.template?.selectedModel;
  const selectedProvider = selected
    ? params.providers.find((provider) => provider.id === selected.customProviderId)
    : undefined;
  const validSelection = Boolean(selectedProvider?.activeModels.includes(selected?.model ?? ""));
  const provider = validSelection ? (selectedProvider as CustomProvider) : params.parentProvider;

  if (!selected || !validSelection || !provider) {
    const controls = provider
      ? roleControls(params.controls, params.template, provider)
      : params.controls;
    return {
      ...params.parent,
      runtime: provider
        ? createProviderRuntimeConfig(provider, params.parent.model, controls)
        : params.parent.runtime,
      ...(selected && !validSelection
        ? {
            fallbackReason: `Role model ${selected.customProviderId}/${selected.model} is unavailable; inherited the parent model.`,
          }
        : {}),
    };
  }

  const controls = roleControls(params.controls, params.template, provider);
  return {
    providerId: provider.type,
    model: selected.model,
    runtime: createProviderRuntimeConfig(provider, selected.model, controls),
  };
}
