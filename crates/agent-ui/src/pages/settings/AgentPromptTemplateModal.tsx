import {
  type AgentPromptTemplate,
  type CustomProvider,
  getChatRuntimeReasoningLevelsForProvider,
  type ReasoningLevel,
} from "@liveagent/app/lib/settings";
import { BookOpen, Check, FileText, ScrollText } from "@liveagent/ui/components/IconSet";
import { useLocale } from "@liveagent/ui/i18n/index";
import { buildModelOptions } from "@liveagent/ui/lib/models/modelOptions";
import { parseModelValue, toModelValue } from "@liveagent/ui/lib/models/modelValue";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { ModelPicker } from "./modelPicker";

type AgentPromptTemplateModalProps = {
  initialData?: AgentPromptTemplate;
  onSave: (data: Omit<AgentPromptTemplate, "id" | "enabled">) => void;
  onClose: () => void;
  providers: CustomProvider[];
};

export function AgentPromptTemplateModal({
  initialData,
  onSave,
  onClose,
  providers,
}: AgentPromptTemplateModalProps) {
  const { t } = useLocale();
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [prompt, setPrompt] = useState(initialData?.prompt ?? "");
  const [subagentEnabled, setSubagentEnabled] = useState(initialData?.subagentEnabled ?? false);
  const [selectedModel, setSelectedModel] = useState(initialData?.selectedModel);
  const [thinkingEnabled, setThinkingEnabled] = useState(initialData?.thinkingEnabled ?? true);
  const [reasoning, setReasoning] = useState<ReasoningLevel>(initialData?.reasoning ?? "medium");
  const isEditing = Boolean(initialData);
  const availableModelOptions = buildModelOptions({ customProviders: providers }).map((option) => ({
    ...option,
    description: option.providerName,
  }));
  const selectedModelValue = selectedModel
    ? toModelValue(selectedModel.customProviderId, selectedModel.model)
    : "";
  const modelOptions =
    selectedModel && !availableModelOptions.some((option) => option.value === selectedModelValue)
      ? [
          {
            value: selectedModelValue,
            label: selectedModel.model,
            description: t("settings.agentsRoleModelUnavailable"),
            providerName: t("settings.agentsRoleModelUnavailable"),
            providerId: selectedModel.customProviderId,
          },
          ...availableModelOptions,
        ]
      : availableModelOptions;
  const selectedProvider = selectedModel
    ? providers.find((provider) => provider.id === selectedModel.customProviderId)
    : undefined;
  const reasoningLevels = selectedProvider
    ? getChatRuntimeReasoningLevelsForProvider({
        providerId: selectedProvider.type,
        requestFormat: selectedProvider.requestFormat,
        modelId: selectedModel?.model,
      })
    : (["minimal", "low", "medium", "high", "xhigh", "max"] as const);

  function handleSave() {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedName || !trimmedPrompt) return;

    onSave({
      name: trimmedName,
      description: description.trim(),
      prompt: trimmedPrompt,
      subagentEnabled,
      ...(selectedModel ? { selectedModel } : {}),
      thinkingEnabled,
      reasoning,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[90dvh] max-w-4xl flex-col p-0"
        closeLabel={t("settings.cancel")}
        showCloseButton
      >
        <DialogHeader className="flex-row items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-muted/50 text-muted-foreground shadow-xs">
            <ScrollText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">
              {isEditing ? t("settings.agentsEdit") : t("settings.agentsAdd")}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs leading-relaxed">
              {t("settings.agentsDesc")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="grid items-stretch gap-4 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
            <section className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{t("settings.agentsTemplateDetails")}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t("settings.agentsTemplateDetailsHint")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-template-name" className="text-xs font-semibold">
                  {t("settings.agentsName")}
                  <span className="ml-1 text-muted-foreground/70">*</span>
                </Label>
                <Input
                  id="agent-template-name"
                  value={name}
                  placeholder={t("settings.agentsNamePlaceholder")}
                  className="h-10 px-3.5"
                  onChange={(e) => setName(e.currentTarget.value)}
                />
              </div>

              <div className="mt-5 flex min-h-0 flex-1 flex-col gap-2">
                <Label htmlFor="agent-template-description" className="text-xs font-semibold">
                  {t("settings.agentsDescription")}
                </Label>
                <Textarea
                  id="agent-template-description"
                  value={description}
                  placeholder={t("settings.agentsDescriptionPlaceholder")}
                  className="h-32 min-h-32 flex-1 resize-none overflow-y-auto overscroll-contain px-3.5 py-3 leading-relaxed md:h-auto md:min-h-0"
                  onChange={(e) => setDescription(e.currentTarget.value)}
                />
              </div>

              <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-xs font-semibold">
                      {t("settings.agentsRoleEnabled")}
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("settings.agentsRoleEnabledHint")}
                    </p>
                  </div>
                  <Switch
                    checked={subagentEnabled}
                    onCheckedChange={(checked) => setSubagentEnabled(checked === true)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">{t("settings.agentsRoleModel")}</Label>
                  <ModelPicker
                    options={modelOptions}
                    value={selectedModelValue}
                    onChange={(value) =>
                      setSelectedModel(value ? (parseModelValue(value) ?? undefined) : undefined)
                    }
                    placeholder={t("settings.agentsRoleFollowParent")}
                    noneLabel={t("settings.agentsRoleFollowParent")}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs font-semibold">
                    {t("settings.agentsRoleThinking")}
                  </Label>
                  <Switch
                    checked={thinkingEnabled}
                    onCheckedChange={(checked) => setThinkingEnabled(checked === true)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">
                    {t("settings.agentsRoleReasoning")}
                  </Label>
                  <Select
                    value={reasoning}
                    disabled={!thinkingEnabled || reasoningLevels.length === 0}
                    onValueChange={(value) => setReasoning(value as ReasoningLevel)}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue>{reasoning}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {reasoningLevels.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-xs md:min-h-[438px]">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <Label htmlFor="agent-template-prompt" className="text-sm font-semibold">
                      {t("settings.agentsPrompt")}
                      <span className="ml-1 text-muted-foreground/70">*</span>
                    </Label>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t("settings.agentsPromptHint")}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
                  {prompt.length.toLocaleString()} {t("settings.agentsCharacters")}
                </span>
              </div>
              <Textarea
                id="agent-template-prompt"
                value={prompt}
                placeholder={t("settings.agentsPromptPlaceholder")}
                className="h-80 min-h-80 flex-1 resize-none overflow-y-auto overscroll-contain p-4 font-mono text-[13px] leading-6 md:h-auto md:min-h-0"
                onChange={(e) => setPrompt(e.currentTarget.value)}
              />
            </section>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogActions>
            <Button
              className="flex-1 px-5 sm:flex-none"
              onClick={handleSave}
              disabled={!name.trim() || !prompt.trim()}
            >
              <Check className="h-3.5 w-3.5" />
              {t("settings.save")}
            </Button>
          </DialogActions>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
