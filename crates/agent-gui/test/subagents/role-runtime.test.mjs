import assert from "node:assert/strict";
import test from "node:test";
import { createTsModuleLoader } from "../helpers/load-ts-module.mjs";

const loader = createTsModuleLoader();
const settings = loader.loadModule("src/lib/settings/index.ts");
const roles = loader.loadModule("src/lib/subagentRoles/runtime.ts");

function provider(id, type, model) {
  return settings.normalizeCustomProvider({
    id,
    name: id,
    type,
    baseUrl: `https://${id}.example.test/v1`,
    apiKey: `${id}-key`,
    models: [model],
    activeModels: [model],
  });
}

test("role runtime selects its configured provider, model, and reasoning", () => {
  const parentProvider = provider("parent", "codex", "gpt-parent");
  const roleProvider = provider("review", "codex", "gpt-review");
  const resolved = roles.resolveSubagentRoleRuntime({
    template: {
      id: "reviewer",
      name: "Reviewer",
      description: "Review code",
      prompt: "Find defects",
      selectedModel: { customProviderId: "review", model: "gpt-review" },
      thinkingEnabled: true,
      reasoning: "high",
    },
    providers: [parentProvider, roleProvider],
    controls: settings.DEFAULT_CHAT_RUNTIME_CONTROLS,
    parentProvider,
    parent: {
      providerId: "codex",
      model: "gpt-parent",
      runtime: { baseUrl: "parent", apiKey: "parent-key" },
    },
  });

  assert.equal(resolved.providerId, "codex");
  assert.equal(resolved.model, "gpt-review");
  assert.equal(resolved.runtime.baseUrl, roleProvider.baseUrl);
  assert.equal(resolved.runtime.reasoning, "high");
  assert.equal(resolved.fallbackReason, undefined);
});

test("stale role model falls back to the parent model visibly", () => {
  const parentProvider = provider("parent", "codex", "gpt-parent");
  const resolved = roles.resolveSubagentRoleRuntime({
    template: {
      id: "reviewer",
      name: "Reviewer",
      description: "Review code",
      prompt: "Find defects",
      selectedModel: { customProviderId: "removed", model: "missing" },
      thinkingEnabled: true,
      reasoning: "high",
    },
    providers: [parentProvider],
    controls: settings.DEFAULT_CHAT_RUNTIME_CONTROLS,
    parentProvider,
    parent: {
      providerId: "codex",
      model: "gpt-parent",
      runtime: { baseUrl: "parent", apiKey: "parent-key" },
    },
  });

  assert.equal(resolved.model, "gpt-parent");
  assert.equal(resolved.runtime.baseUrl, parentProvider.baseUrl);
  assert.equal(resolved.runtime.reasoning, "high");
  assert.match(resolved.fallbackReason, /unavailable; inherited the parent model/);
});
