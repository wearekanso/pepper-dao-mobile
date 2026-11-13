import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useCreateProposal } from '@/hooks/use-create-proposal';
import { useWallet } from '@/contexts/wallet-context';
import {
  PROPOSAL_FORM_LIMITS,
  ProposalFormSchema,
  type ProposalFormState,
} from '@/types/proposal-form';

const INITIAL_STATE: ProposalFormState = {
  title: '',
  summary: '',
  body: '',
  resources: [],
  track: 'STANDARD',
};

export function LegacyCreateProposalScreen() {
  const router = useRouter();
  const { isConnected } = useWallet();
  const { submit, isSubmitting, status, error: submitError } = useCreateProposal();

  const [form, setForm] = useState<ProposalFormState>(INITIAL_STATE);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [resourceInput, setResourceInput] = useState({ url: '', title: '' });
  const [showResourceInput, setShowResourceInput] = useState(false);

  function handleClose() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }

  function updateField<K extends keyof ProposalFormState>(field: K, value: ProposalFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear validation error when user types
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function addResource() {
    if (!resourceInput.url || !resourceInput.title) return;

    // Validate URL
    try {
      new URL(resourceInput.url);
    } catch {
      setValidationErrors((prev) => ({ ...prev, resourceUrl: 'Invalid URL format' }));
      return;
    }

    if (form.resources.length >= PROPOSAL_FORM_LIMITS.MAX_RESOURCES) {
      setValidationErrors((prev) => ({
        ...prev,
        resources: `Maximum ${PROPOSAL_FORM_LIMITS.MAX_RESOURCES} resources`,
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      resources: [...prev.resources, { url: resourceInput.url, title: resourceInput.title }],
    }));
    setResourceInput({ url: '', title: '' });
    setShowResourceInput(false);
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next.resourceUrl;
      delete next.resources;
      return next;
    });
  }

  function removeResource(index: number) {
    setForm((prev) => ({
      ...prev,
      resources: prev.resources.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Validate with Zod
    const result = ProposalFormSchema.safeParse(form);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string') {
          errors[path] = issue.message;
        }
      }
      setValidationErrors(errors);
      return;
    }

    const submitResult = await submit({
      title: form.title,
      summary: form.summary || undefined,
      body: form.body || undefined,
      resources: form.resources.length > 0 ? form.resources : undefined,
    });

    if (submitResult.status === 'success' && submitResult.proposalId) {
      // Navigate to the new proposal
      // Build the composite ID format used by the app
      router.replace({
        pathname: '/governance/[proposalId]',
        params: { proposalId: submitResult.proposalId },
      });
    }
  }

  const canSubmit = isConnected && form.title.length > 0 && !isSubmitting;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a1a' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View className="border-b border-[#FFC043]/30 px-4 py-3">
          <Text className="text-center font-['PPNeueBit-Bold'] text-base uppercase tracking-wider text-[#FFC043]">
            Submit Proposal
          </Text>
        </View>

        <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
          {!isConnected ? (
            <View className="mb-4 bg-[#FF006E]/10 p-3">
              <Text className="font-['PPNeueBit-Bold'] text-xs uppercase text-[#FF006E]">
                Wallet Not Connected
              </Text>
              <Text className="mt-1 text-xs text-white/80">
                Please connect your wallet to submit proposals.
              </Text>
            </View>
          ) : null}

          {/* Title Input */}
          <View className="mb-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-white">
                Title *
              </Text>
              <Text className="text-xs text-white/60">
                {form.title.length}/{PROPOSAL_FORM_LIMITS.TITLE_MAX}
              </Text>
            </View>
            <TextInput
              value={form.title}
              onChangeText={(text) => updateField('title', text)}
              placeholder="Enter proposal title"
              placeholderTextColor="#666666"
              maxLength={PROPOSAL_FORM_LIMITS.TITLE_MAX}
              className="bg-white/10 px-4 py-3 text-sm text-white"
            />
            {validationErrors.title && (
              <Text className="mt-1 text-xs text-[#FF006E]">{validationErrors.title}</Text>
            )}
          </View>

          {/* Summary Input */}
          <View className="mb-4">
            <View className="mb-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-white">
                  Summary
                </Text>
                <View className="bg-white/10 px-2 py-0.5">
                  <Text className="text-[10px] text-white/50">Optional</Text>
                </View>
              </View>
              <Text className="text-xs text-white/60">
                {form.summary.length}/{PROPOSAL_FORM_LIMITS.SUMMARY_MAX}
              </Text>
            </View>
            <Text className="mb-2 text-xs text-white/50">
              Brief description shown in the proposal list.
            </Text>
            <TextInput
              value={form.summary}
              onChangeText={(text) => updateField('summary', text)}
              placeholder="Brief summary of your proposal"
              placeholderTextColor="#666666"
              maxLength={PROPOSAL_FORM_LIMITS.SUMMARY_MAX}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="min-h-[80px] bg-white/10 px-4 py-3 text-sm text-white"
            />
            {validationErrors.summary && (
              <Text className="mt-1 text-xs text-[#FF006E]">{validationErrors.summary}</Text>
            )}
          </View>

          {/* Body Input */}
          <View className="mb-4">
            <View className="mb-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-white">
                  Body
                </Text>
                <View className="bg-white/10 px-2 py-0.5">
                  <Text className="text-[10px] text-white/50">Optional</Text>
                </View>
              </View>
              <Text className="text-xs text-white/60">
                {form.body.length}/{PROPOSAL_FORM_LIMITS.BODY_MAX}
              </Text>
            </View>
            <Text className="mb-2 text-xs text-white/50">
              Full proposal details. Supports markdown: **bold**, *italic*, [links](url), - lists
            </Text>
            <TextInput
              value={form.body}
              onChangeText={(text) => updateField('body', text)}
              placeholder="Detailed description of your proposal..."
              placeholderTextColor="#666666"
              maxLength={PROPOSAL_FORM_LIMITS.BODY_MAX}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              className="min-h-[160px] bg-white/10 px-4 py-3 text-sm text-white"
            />
            {validationErrors.body && (
              <Text className="mt-1 text-xs text-[#FF006E]">{validationErrors.body}</Text>
            )}
          </View>

          {/* Resources Section */}
          <View className="mb-4">
            <View className="mb-1 flex-row items-center gap-2">
              <Text className="font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-white">
                Resources
              </Text>
              <View className="bg-white/10 px-2 py-0.5">
                <Text className="text-[10px] text-white/50">Optional</Text>
              </View>
            </View>
            <Text className="mb-2 text-xs text-white/50">
              Add links to discussions, documentation, or other resources.
            </Text>

            {/* Resource List */}
            {form.resources.map((resource, index) => (
              <View
                key={index}
                className="mb-2 flex-row items-center justify-between bg-white/10 p-3"
              >
                <View className="flex-1">
                  <Text className="text-xs font-bold text-white">{resource.title}</Text>
                  <Text className="text-[10px] text-white/60" numberOfLines={1}>
                    {resource.url}
                  </Text>
                </View>
                <Pressable
                  onPress={() => removeResource(index)}
                  className="ml-2 h-6 w-6 items-center justify-center bg-[#FF006E]/20 active:bg-[#FF006E]/30"
                >
                  <Text className="text-xs text-[#FF006E]">X</Text>
                </Pressable>
              </View>
            ))}

            {/* Add Resource Input */}
            {showResourceInput ? (
              <View className="bg-white/10 p-3">
                <TextInput
                  value={resourceInput.title}
                  onChangeText={(text) => setResourceInput((prev) => ({ ...prev, title: text }))}
                  placeholder="Resource title"
                  placeholderTextColor="#666666"
                  className="mb-2 bg-white/10 px-3 py-2 text-xs text-white"
                />
                <TextInput
                  value={resourceInput.url}
                  onChangeText={(text) => setResourceInput((prev) => ({ ...prev, url: text }))}
                  placeholder="https://..."
                  placeholderTextColor="#666666"
                  autoCapitalize="none"
                  keyboardType="url"
                  className="mb-2 bg-white/10 px-3 py-2 text-xs text-white"
                />
                {validationErrors.resourceUrl && (
                  <Text className="mb-2 text-xs text-[#FF006E]">{validationErrors.resourceUrl}</Text>
                )}
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => {
                      setShowResourceInput(false);
                      setResourceInput({ url: '', title: '' });
                    }}
                    className="flex-1 bg-white/10 py-2 active:bg-white/20"
                  >
                    <Text className="text-center text-xs text-white/80">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={addResource}
                    className="flex-1 bg-[#00FF80] py-2 active:opacity-80"
                  >
                    <Text className="text-center text-xs text-black">Add</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowResourceInput(true)}
                disabled={form.resources.length >= PROPOSAL_FORM_LIMITS.MAX_RESOURCES}
                className={`py-3 ${
                  form.resources.length >= PROPOSAL_FORM_LIMITS.MAX_RESOURCES
                    ? 'bg-white/5'
                    : 'bg-white/10 active:bg-white/15'
                }`}
              >
                <Text
                  className={`text-center text-xs ${
                    form.resources.length >= PROPOSAL_FORM_LIMITS.MAX_RESOURCES
                      ? 'text-white/40'
                      : 'text-white/80'
                  }`}
                >
                  + Add Resource ({form.resources.length}/{PROPOSAL_FORM_LIMITS.MAX_RESOURCES})
                </Text>
              </Pressable>
            )}
            {validationErrors.resources && (
              <Text className="mt-1 text-xs text-[#FF006E]">{validationErrors.resources}</Text>
            )}
          </View>

          {/* Submit Error */}
          {submitError && (
            <View className="mb-4 bg-[#FF006E]/10 p-3">
              <Text className="font-['PPNeueBit-Bold'] text-xs uppercase text-[#FF006E]">
                Submission Failed
              </Text>
              <Text className="mt-1 text-xs text-white/80">{submitError}</Text>
            </View>
          )}

          {/* Success Message */}
          {status === 'success' && (
            <View className="mb-4 bg-[#00FF80]/10 p-3">
              <Text className="font-['PPNeueBit-Bold'] text-xs uppercase text-[#00FF80]">
                Proposal Submitted!
              </Text>
              <Text className="mt-1 text-xs text-white/80">
                Your proposal has been submitted to the blockchain.
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={handleClose}
              className="flex-1 bg-white/10 py-4 active:bg-white/20"
            >
              <Text className="text-center font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-white/70">
                Cancel
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              className={`flex-1 py-4 ${
                canSubmit ? 'bg-[#FFC043] active:opacity-80' : 'bg-white/20'
              }`}
            >
              {isSubmitting ? (
                <View className="flex-row items-center justify-center gap-2">
                  <ActivityIndicator size="small" color="#000000" />
                  <Text className="font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-black">
                    Submitting...
                  </Text>
                </View>
              ) : (
                <Text
                  className={`text-center font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider ${
                    canSubmit ? 'text-black' : 'text-white/40'
                  }`}
                >
                  Submit
                </Text>
              )}
            </Pressable>
          </View>

          {/* Info Text */}
          <View className="mb-8 mt-4">
            <Text className="text-center text-xs text-white/50">
              Submitting a proposal requires a transaction on Chiliz blockchain.
              Gas fees will be paid in CHZ.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
